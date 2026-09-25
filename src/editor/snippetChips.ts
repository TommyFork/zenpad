import { Decoration, EditorView, MatchDecorator, ViewPlugin, hoverTooltip, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { snippetTokenPattern } from '../lib/snippets'
import { snippetBodiesField } from './snippetState'

const TOOLTIP_PREVIEW_LENGTH = 480

const linkedChip = Decoration.mark({ class: 'cm-snippet' })
const emptyChip = Decoration.mark({ class: 'cm-snippet cm-snippet-empty' })
const missingChip = Decoration.mark({ class: 'cm-snippet cm-snippet-missing' })

const chipMatcher = new MatchDecorator({
  regexp: snippetTokenPattern(),
  decoration(match, view) {
    const body = view.state.field(snippetBodiesField).get(match[1])
    if (body === undefined) return missingChip
    return body.trim() === '' ? emptyChip : linkedChip
  },
})

const chipHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = chipMatcher.createDeco(view)
    }

    update(update: ViewUpdate) {
      const snippetsChanged = update.startState.field(snippetBodiesField) !== update.state.field(snippetBodiesField)
      this.decorations = snippetsChanged
        ? chipMatcher.createDeco(update.view)
        : chipMatcher.updateDeco(update, this.decorations)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

export function snippetNameAt(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos)
  for (const match of line.text.matchAll(snippetTokenPattern())) {
    const from = line.from + match.index
    if (pos >= from && pos <= from + match[0].length) return match[1]
  }
  return null
}

function tooltipBody(name: string, body: string | undefined): HTMLElement {
  const container = document.createElement('div')
  container.className = 'cm-snippet-tooltip'

  const heading = document.createElement('div')
  heading.className = 'cm-snippet-tooltip-name'
  heading.textContent = `@${name}`
  container.append(heading)

  const text = document.createElement('div')
  text.className = 'cm-snippet-tooltip-body'
  if (body === undefined) {
    text.textContent = 'No snippet with this name yet. It will be copied as written.'
  } else if (body.trim() === '') {
    text.textContent = 'This snippet is empty.'
  } else {
    text.textContent = body.length > TOOLTIP_PREVIEW_LENGTH ? `${body.slice(0, TOOLTIP_PREVIEW_LENGTH)}…` : body
  }
  container.append(text)

  const hint = document.createElement('div')
  hint.className = 'cm-snippet-tooltip-hint'
  hint.textContent = body === undefined ? '⌘ click to create it' : '⌘ click to open'
  container.append(hint)

  return container
}

const chipTooltip = hoverTooltip((view, pos) => {
  const name = snippetNameAt(view, pos)
  if (!name) return null
  const body = view.state.field(snippetBodiesField).get(name)
  return { pos, above: true, create: () => ({ dom: tooltipBody(name, body) }) }
})

export function snippetChips(onOpenSnippet: (name: string) => void) {
  const openOnModClick = EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!(event.metaKey || event.ctrlKey)) return false
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      const name = pos === null ? null : snippetNameAt(view, pos)
      if (!name) return false
      event.preventDefault()
      onOpenSnippet(name)
      return true
    },
  })
  return [chipHighlighter, chipTooltip, openOnModClick]
}
