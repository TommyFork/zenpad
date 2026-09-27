import { useEffect, useMemo, useRef } from 'react'
import { markdownLanguage } from '@codemirror/lang-markdown'
import { LanguageSupport } from '@codemirror/language'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, placeholder, WidgetType, type DecorationSet } from '@codemirror/view'
import { hasModifier, MOD_LABEL } from '../app/keys'
import { useEscape } from '../app/useEscape'
import { expandSnippetParts, flattenExpansion, type ExpansionSpan } from '../lib/snippets'
import { zenAppearance } from '../editor/theme'

interface NotePreviewProps {
  text: string
  snippets: ReadonlyMap<string, string>
  highlights: boolean
  onOpenSnippet: (name: string) => void
  onExit: () => void
}

// Empty snippets copy as nothing, so they only show up as a chip while highlighting.
class EmptyChip extends WidgetType {
  readonly name: string

  constructor(name: string) {
    super()
    this.name = name
  }

  eq(other: EmptyChip) {
    return other.name === this.name
  }

  toDOM() {
    const chip = document.createElement('span')
    chip.className = 'cm-snippet cm-snippet-empty'
    chip.dataset.snippet = this.name
    chip.title = `@${this.name} is empty, so it copies as nothing`
    chip.textContent = `@${this.name}`
    return chip
  }
}

// Filled-in text is always marked so ⌘ click works; the tint and chips follow the highlight setting.
function spanDecorations(spans: ExpansionSpan[], highlights: boolean): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  // Spans arrive outer first, so equal starts are already in the order RangeSetBuilder needs.
  const sorted = [...spans].sort((a, b) => a.from - b.from)
  for (const span of sorted) {
    if (!highlights && span.kind !== 'snippet') continue
    if (span.kind === 'empty') {
      builder.add(span.from, span.to, Decoration.widget({ widget: new EmptyChip(span.name), side: 1 }))
    } else if (span.kind === 'unresolved') {
      const reason = "Isn't a snippet yet, so it's copied as written"
      builder.add(span.from, span.to, Decoration.mark({ class: 'cm-snippet cm-snippet-missing', attributes: { 'data-snippet': span.name, title: `@${span.name}: ${reason}` } }))
    } else {
      builder.add(span.from, span.to, Decoration.mark({ class: 'cm-preview-snippet', attributes: { 'data-snippet': span.name, title: `@${span.name}  ·  ${MOD_LABEL} click to open` } }))
    }
  }
  return builder.finish()
}

// A read-only view of the note exactly as it would be copied, with every @snippet filled in.
// It uses the editor's own layout and markdown styling so switching to it doesn't move the page.
export function NotePreview({ text, snippets, highlights, onOpenSnippet, onExit }: NotePreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const openRef = useRef(onOpenSnippet)
  const expansion = useMemo(() => flattenExpansion(expandSnippetParts(text, snippets)), [text, snippets])

  useEscape(onExit)

  useEffect(() => {
    openRef.current = onOpenSnippet
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({ parent: host })
    viewRef.current = view
    view.scrollDOM.tabIndex = -1
    view.scrollDOM.focus({ preventScroll: true })
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const scrollTop = view.scrollDOM.scrollTop
    view.setState(
      EditorState.create({
        doc: expansion.text,
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          new LanguageSupport(markdownLanguage),
          EditorView.contentAttributes.of({ 'aria-label': 'Preview with snippets filled in' }),
          EditorView.decorations.of(spanDecorations(expansion.spans, highlights)),
          placeholder('Nothing here yet.'),
          EditorView.domEventHandlers({
            mousedown(event) {
              if (!hasModifier(event) || !(event.target instanceof HTMLElement)) return false
              const name = event.target.closest<HTMLElement>('[data-snippet]')?.dataset.snippet
              if (!name) return false
              event.preventDefault()
              openRef.current(name)
              return true
            },
          }),
          zenAppearance,
        ],
      }),
    )
    view.scrollDOM.scrollTop = scrollTop
  }, [expansion, highlights])

  return <div className={`editor-host preview-host${highlights ? ' has-highlights' : ''}`} ref={hostRef} />
}
