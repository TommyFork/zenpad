import { useEffect, useMemo, useRef, type MouseEvent, type ReactNode } from 'react'
import { hasModifier, MOD_LABEL } from '../app/keys'
import { useEscape } from '../app/useEscape'
import { expandSnippetParts, type ExpansionPart } from '../lib/snippets'

interface NotePreviewProps {
  text: string
  snippets: ReadonlyMap<string, string>
  highlights: boolean
  onToggleHighlights: () => void
  onOpenSnippet: (name: string) => void
  onExit: () => void
}

function filledNames(parts: ExpansionPart[], names = new Set<string>()): Set<string> {
  for (const part of parts) {
    if (part.kind !== 'snippet') continue
    if (part.parts.length > 0) names.add(part.name)
    filledNames(part.parts, names)
  }
  return names
}

function summary(parts: ExpansionPart[]): string {
  const count = filledNames(parts).size
  if (count === 0) return 'No snippets to fill in'
  return `${count} ${count === 1 ? 'snippet' : 'snippets'} filled in`
}

function renderParts(parts: ExpansionPart[], path: string): ReactNode[] {
  return parts.map((part, index) => {
    const key = `${path}.${index}`
    if (part.kind === 'text') return part.text
    if (part.kind === 'unresolved') {
      const reason = part.reason === 'missing' ? "Isn't a snippet yet, so it's copied as written" : 'Uses itself, so it stops here'
      return (
        <span key={key} className="preview-chip is-unresolved" data-snippet={part.name} title={`@${part.name}: ${reason}`}>
          @{part.name}
        </span>
      )
    }
    if (part.parts.length === 0) {
      return (
        <span key={key} className="preview-chip is-empty" data-snippet={part.name} title={`@${part.name} is empty, so it copies as nothing`}>
          @{part.name}
        </span>
      )
    }
    return (
      <span key={key} className="preview-snippet" data-snippet={part.name} title={`@${part.name}  ·  ${MOD_LABEL} click to open`}>
        {renderParts(part.parts, key)}
      </span>
    )
  })
}

// A read-only view of the note exactly as it would be copied, with every @snippet filled in.
export function NotePreview({ text, snippets, highlights, onToggleHighlights, onOpenSnippet, onExit }: NotePreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const parts = useMemo(() => expandSnippetParts(text, snippets), [text, snippets])

  useEscape(onExit)

  useEffect(() => {
    scrollRef.current?.focus({ preventScroll: true })
  }, [])

  function openOnModClick(event: MouseEvent) {
    if (!hasModifier(event) || !(event.target instanceof HTMLElement)) return
    const name = event.target.closest<HTMLElement>('[data-snippet]')?.dataset.snippet
    if (!name) return
    event.preventDefault()
    onOpenSnippet(name)
  }

  return (
    <div className="preview" ref={scrollRef} tabIndex={-1} aria-label="Preview with snippets filled in">
      <div className="preview-inner">
        <div className="preview-head">
          <span className="preview-kicker">
            Preview <span aria-hidden="true">·</span> <span className="preview-summary">{summary(parts)}</span>
          </span>
          <button className="preview-toggle" role="switch" aria-checked={highlights} onClick={onToggleHighlights}>
            <span className="preview-toggle-track" aria-hidden="true" />
            Highlight snippets
          </button>
        </div>
        <div className={`preview-body${highlights ? ' has-highlights' : ''}`} onMouseDown={openOnModClick}>
          {text.trim() === '' ? <span className="preview-empty">Nothing here yet.</span> : renderParts(parts, 'p')}
        </div>
      </div>
    </div>
  )
}
