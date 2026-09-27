// A small force-directed layout: nodes push each other apart, links pull their ends together,
// and a gentle pull toward the middle keeps unconnected nodes from drifting off.

export interface LayoutPoint {
  x: number
  y: number
  vx: number
  vy: number
  // A node being dragged stays where the pointer puts it.
  pinned?: boolean
}

const REPULSION = 380
const LINK_DISTANCE = 85
const LINK_STRENGTH = 0.3
const GRAVITY = 0.06
const DAMPING = 0.55
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

// Starts nodes on a sunflower spiral, so the layout is the same every time for the same graph.
export function seedLayout(count: number): LayoutPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const radius = 18 * Math.sqrt(index + 0.5)
    const angle = index * GOLDEN_ANGLE
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), vx: 0, vy: 0 }
  })
}

// Moves every node one step. Alpha, from 1 down to 0, scales how far they move.
export function stepLayout(points: LayoutPoint[], edges: readonly { source: number; target: number }[], alpha: number): void {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    for (let j = i + 1; j < points.length; j++) {
      const b = points[j]
      let dx = b.x - a.x
      let dy = b.y - a.y
      if (dx === 0 && dy === 0) {
        dx = (j - i) * 0.1
        dy = 0.1
      }
      const distanceSquared = Math.max(dx * dx + dy * dy, 25)
      const push = (REPULSION * alpha) / distanceSquared
      a.vx -= dx * push
      a.vy -= dy * push
      b.vx += dx * push
      b.vy += dy * push
    }
  }

  for (const { source, target } of edges) {
    const a = points[source]
    const b = points[target]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const distance = Math.hypot(dx, dy) || 1
    const pull = ((distance - LINK_DISTANCE) / distance) * LINK_STRENGTH * alpha
    a.vx += dx * pull
    a.vy += dy * pull
    b.vx -= dx * pull
    b.vy -= dy * pull
  }

  for (const point of points) {
    if (point.pinned) {
      point.vx = 0
      point.vy = 0
      continue
    }
    point.vx = (point.vx - point.x * GRAVITY * alpha) * DAMPING
    point.vy = (point.vy - point.y * GRAVITY * alpha) * DAMPING
    point.x += point.vx
    point.y += point.vy
  }
}

// Runs the layout until it has mostly come to rest, and returns the alpha it stopped at.
export function settleLayout(
  points: LayoutPoint[],
  edges: readonly { source: number; target: number }[],
  steps = 300,
  startAlpha = 1,
): number {
  let alpha = startAlpha
  for (let step = 0; step < steps; step++) {
    stepLayout(points, edges, alpha)
    alpha *= 0.985
  }
  return alpha
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function layoutBounds(points: readonly LayoutPoint[]): Bounds {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}
