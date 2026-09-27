import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { isSameDocument, type DocumentRef } from '../app/documents'
import { useEscape } from '../app/useEscape'
import type { Note, Snippet } from '../lib/db'
import { layoutBounds, seedLayout, settleLayout, stepLayout, type LayoutPoint } from '../lib/graphLayout'
import { buildSnippetGraph, graphNeighbors, type GraphEdge, type GraphNode, type SnippetGraph } from '../lib/snippetGraph'
import { describeUses } from '../lib/snippets'
import { Icon } from './Icon'

const LABEL_LENGTH = 26
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3
const FIT_PADDING = 60
const DRAG_THRESHOLD = 4
// Below this the layout is still enough to stop animating.
const REST_ALPHA = 0.004

interface SnippetMapProps {
  notes: Note[]
  snippets: Snippet[]
  openDoc: DocumentRef | null
  onOpen: (doc: DocumentRef) => void
  onClose: () => void
}

interface View {
  x: number
  y: number
  zoom: number
}

type Gesture =
  | { kind: 'node'; index: number; startX: number; startY: number; moved: boolean }
  | { kind: 'pan'; startX: number; startY: number; view: View }

function truncate(label: string): string {
  return label.length > LABEL_LENGTH ? `${label.slice(0, LABEL_LENGTH - 1)}…` : label
}

function nodeRadius(node: GraphNode): number {
  return node.kind === 'note' ? 5 : 6 + Math.min(8, Math.sqrt(node.uses) * 2.5)
}

function nodeLabel(node: GraphNode): string {
  return node.kind === 'snippet' ? `@${node.label}` : node.label
}

interface Point {
  x: number
  y: number
}

const ORIGIN: Point = { x: 0, y: 0 }

function nodeKey(node: GraphNode): string {
  return `${node.kind}:${node.id}`
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Holds the moving layout outside React. The map re-renders from snapshots of it.
class LiveLayout {
  private byKey = new Map<string, LayoutPoint>()
  private points: LayoutPoint[] = []
  private edges: readonly GraphEdge[] = []
  private alpha = 0
  private frame: number | undefined
  private listener: (points: Point[]) => void = () => {}

  subscribe(listener: (points: Point[]) => void) {
    this.listener = listener
  }

  // Nodes keep their place across rebuilds, so toggling notes or editing doesn't reshuffle the map.
  setGraph(graph: SnippetGraph): Point[] {
    const seeds = seedLayout(graph.nodes.length)
    const known = graph.nodes.map((node) => this.byKey.get(nodeKey(node)))
    const anyKnown = known.some(Boolean)
    this.points = graph.nodes.map((node, index) => {
      if (known[index]) return known[index]
      // A new node starts beside something it links to, when there is one.
      const edge = graph.edges.find((candidate) => candidate.source === index || candidate.target === index)
      const anchor = edge && known[edge.source === index ? edge.target : edge.source]
      const seed = seeds[index]
      const point = anchor ? { ...seed, x: anchor.x + seed.x * 0.2, y: anchor.y + seed.y * 0.2 } : seed
      this.byKey.set(nodeKey(node), point)
      return point
    })
    this.edges = graph.edges
    if (known.some((point) => !point)) settleLayout(this.points, this.edges, anyKnown ? 120 : 300, anyKnown ? 0.3 : 1)
    return this.snapshot()
  }

  snapshot(): Point[] {
    return this.points.map(({ x, y }) => ({ x, y }))
  }

  drag(index: number, to: Point) {
    Object.assign(this.points[index], to, { pinned: true })
    this.heat(0.25)
  }

  release(index: number) {
    this.points[index].pinned = false
  }

  stop() {
    window.cancelAnimationFrame(this.frame ?? 0)
    this.frame = undefined
  }

  private heat(to: number) {
    if (prefersReducedMotion()) {
      settleLayout(this.points, this.edges, 60, to)
      this.listener(this.snapshot())
      return
    }
    this.alpha = Math.max(this.alpha, to)
    this.frame ??= window.requestAnimationFrame(this.tick)
  }

  private tick = () => {
    stepLayout(this.points, this.edges, this.alpha)
    this.alpha *= 0.96
    this.listener(this.snapshot())
    this.frame = this.alpha > REST_ALPHA ? window.requestAnimationFrame(this.tick) : undefined
  }
}

function fitView(points: Point[], width: number, height: number): View {
  const bounds = layoutBounds(points.map((point) => ({ ...point, vx: 0, vy: 0 })))
  const spanX = bounds.maxX - bounds.minX + FIT_PADDING * 2
  const spanY = bounds.maxY - bounds.minY + FIT_PADDING * 2
  const zoom = Math.min(1, Math.max(MIN_ZOOM, Math.min(width / spanX, height / spanY)))
  return { x: -((bounds.minX + bounds.maxX) / 2) * zoom, y: -((bounds.minY + bounds.maxY) / 2) * zoom, zoom }
}

// An interactive map of which notes and snippets use which snippets.
export function SnippetMap({ notes, snippets, openDoc, onOpen, onClose }: SnippetMapProps) {
  const [showNotes, setShowNotes] = useState(true)
  const graph = useMemo(() => buildSnippetGraph(notes, snippets, { includeNotes: showNotes }), [notes, snippets, showNotes])
  const neighbors = useMemo(() => graphNeighbors(graph), [graph])
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 })
  const [active, setActive] = useState<number | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const fitted = useRef(false)
  const [layout] = useState(() => new LiveLayout())
  const [laidOut, setLaidOut] = useState<SnippetGraph | null>(null)
  const [points, setPoints] = useState<Point[]>([])

  if (laidOut !== graph) {
    setLaidOut(graph)
    setPoints(layout.setGraph(graph))
  }

  useEscape(onClose)

  useEffect(() => {
    layout.subscribe(setPoints)
    return () => layout.stop()
  }, [layout])

  // The first measurement also frames the whole map.
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver(() => {
      const width = svg.clientWidth
      const height = svg.clientHeight
      setSize({ width, height })
      if (fitted.current || width === 0) return
      fitted.current = true
      setView(fitView(layout.snapshot(), width, height))
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [layout])

  const zoomBy = useCallback((factor: number, originX = 0, originY = 0) => {
    setView((current) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor))
      const scale = zoom / current.zoom
      return { zoom, x: originX - (originX - current.x) * scale, y: originY - (originY - current.y) * scale }
    })
  }, [])

  // React's wheel listener is passive, so it can't stop the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      zoomBy(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  function toWorld(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left - rect.width / 2 - view.x) / view.zoom,
      y: (clientY - rect.top - rect.height / 2 - view.y) / view.zoom,
    }
  }

  function open(index: number) {
    const node = graph.nodes[index]
    onOpen({ kind: node.kind, id: node.id })
  }

  function startNodeDrag(event: PointerEvent, index: number) {
    event.stopPropagation()
    svgRef.current?.setPointerCapture(event.pointerId)
    gesture.current = { kind: 'node', index, startX: event.clientX, startY: event.clientY, moved: false }
  }

  function startPan(event: PointerEvent) {
    svgRef.current?.setPointerCapture(event.pointerId)
    gesture.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, view }
  }

  function handlePointerMove(event: PointerEvent) {
    const current = gesture.current
    if (!current) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (current.kind === 'pan') {
      setView({ ...current.view, x: current.view.x + dx, y: current.view.y + dy })
      return
    }
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    current.moved = true
    layout.drag(current.index, toWorld(event.clientX, event.clientY))
    setActive(current.index)
  }

  function handlePointerUp() {
    const current = gesture.current
    gesture.current = null
    if (current?.kind !== 'node') return
    layout.release(current.index)
    if (!current.moved) open(current.index)
  }

  function handleNodeKey(event: KeyboardEvent, index: number) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    open(index)
  }

  const highlighted = active === null ? null : new Set([active, ...neighbors[active]])
  const activeNode = active === null ? undefined : graph.nodes[active]
  const noteCount = graph.nodes.filter((node) => node.kind === 'note').length

  function describe(index: number): string {
    const node = graph.nodes[index]
    const linked = [...neighbors[index]].map((other) => graph.nodes[other])
    if (node.kind === 'note') {
      const used = graph.edges.filter((edge) => edge.source === index).map((edge) => `@${graph.nodes[edge.target].label}`)
      return `Uses ${used.join(', ')}`
    }
    const usedBy = graph.edges.filter((edge) => edge.target === index).map((edge) => graph.nodes[edge.source])
    const users = describeUses(
      usedBy.filter((user) => user.kind === 'note').length,
      usedBy.filter((user) => user.kind === 'snippet').length,
    )
    const uses = linked.length - usedBy.length
    const parts = [users ? `Used in ${users}` : showNotes ? 'Not used anywhere yet' : 'Not used by other snippets']
    if (uses > 0) parts.push(`uses ${uses} ${uses === 1 ? 'snippet' : 'snippets'}`)
    return parts.join(' · ')
  }

  return (
    <div className="overlay map-overlay" onMouseDown={onClose}>
      <div className="snippet-map" role="dialog" aria-modal="true" aria-label="Snippet map" onMouseDown={(event) => event.stopPropagation()}>
        <div className="map-head">
          <div>
            <h2>Snippet map</h2>
            <p className="map-caption">
              {snippets.length} {snippets.length === 1 ? 'snippet' : 'snippets'}
              {showNotes && ` · ${noteCount} ${noteCount === 1 ? 'note' : 'notes'} using them`}
            </p>
          </div>
          <div className="map-actions">
            <button className="preview-toggle" role="switch" aria-checked={showNotes} onClick={() => setShowNotes(!showNotes)}>
              <span className="preview-toggle-track" aria-hidden="true" />
              Notes
            </button>
            <button className="icon-button" onClick={onClose} aria-label="Close snippet map" autoFocus>
              <Icon name="close" />
            </button>
          </div>
        </div>

        <div className="map-canvas">
          {snippets.length === 0 ? (
            <p className="map-empty">
              No snippets yet. Save text you reuse, then type <span className="inline-chip">@name</span> in any note to see how they connect.
            </p>
          ) : null}
          <svg
            ref={svgRef}
            className={highlighted ? 'map-svg has-focus' : 'map-svg'}
            onPointerDown={startPan}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <g transform={`translate(${size.width / 2 + view.x} ${size.height / 2 + view.y}) scale(${view.zoom})`}>
              {graph.edges.map((edge, index) => {
                const from = points[edge.source] ?? ORIGIN
                const to = points[edge.target] ?? ORIGIN
                const lit = active !== null && (edge.source === active || edge.target === active)
                return <line key={index} className={lit ? 'map-edge is-lit' : 'map-edge'} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
              })}
              {graph.nodes.map((node, index) => {
                const point = points[index] ?? ORIGIN
                const radius = nodeRadius(node)
                const current = isSameDocument(openDoc, { kind: node.kind, id: node.id })
                const classes = [
                  'map-node',
                  `is-${node.kind}`,
                  current ? 'is-current' : '',
                  highlighted?.has(index) ? 'is-lit' : '',
                  active === index ? 'is-active' : '',
                ]
                return (
                  <g
                    key={`${node.kind}:${node.id}`}
                    className={classes.filter(Boolean).join(' ')}
                    transform={`translate(${point.x} ${point.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${node.kind === 'snippet' ? `@${node.label}` : `note “${node.label}”`}. ${describe(index)}`}
                    onPointerDown={(event) => startNodeDrag(event, index)}
                    onPointerEnter={() => gesture.current || setActive(index)}
                    onPointerLeave={() => gesture.current || setActive(null)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    onKeyDown={(event) => handleNodeKey(event, index)}
                  >
                    {current && <circle className="map-ring" r={radius + 5} />}
                    {node.kind === 'snippet' ? (
                      <circle className="map-dot" r={radius} />
                    ) : (
                      <rect className="map-dot" x={-radius} y={-radius} width={radius * 2} height={radius * 2} rx={2} />
                    )}
                    <text className="map-label" x={radius + 6} y={4}>
                      {truncate(nodeLabel(node))}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>

          <div className="map-legend" aria-hidden="true">
            <span>
              <i className="legend-snippet" /> Snippet
            </span>
            {showNotes && (
              <span>
                <i className="legend-note" /> Note
              </span>
            )}
          </div>

          <div className="map-zoom">
            <button className="icon-button small" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in">
              <Icon name="plus" size={16} />
            </button>
            <button className="icon-button small" onClick={() => zoomBy(0.8)} aria-label="Zoom out" title="Zoom out">
              <Icon name="minus" size={16} />
            </button>
            <button className="icon-button small" onClick={() => setView(fitView(points, size.width, size.height))} aria-label="Fit to screen" title="Fit to screen">
              <Icon name="fit" size={16} />
            </button>
          </div>

          <p className="map-detail" aria-live="polite">
            {activeNode ? (
              <>
                <strong>{nodeLabel(activeNode)}</strong> {describe(active!)}
              </>
            ) : (
              'Hover to trace connections. Click to open. Drag to rearrange.'
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
