import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { RangeSetBuilder, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, hoverTooltip, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { parseDefinitionLine, parseVariables, resolveVariables, variableReferencePattern } from '../lib/variables'
import { snippetBodiesField } from './snippetState'

const TOOLTIP_PREVIEW_LENGTH = 480
const DETAIL_LENGTH = 60

// The raw values of the variables the open document defines, re-read whenever it changes.
const variablesField = StateField.define<ReadonlyMap<string, string>>({
  create: (state) => parseVariables(state.doc.toString()),
  update(values, transaction) {
    if (!transaction.docChanged) return values
    const next = parseVariables(transaction.newDoc.toString())
    const same = next.size === values.size && [...next].every(([name, value]) => values.get(name) === value)
    return same ? values : next
  },
})

const definitionLine = Decoration.line({ class: 'cm-variable-line' })
const definitionName = Decoration.mark({ class: 'cm-variable cm-variable-def' })
const referenceChip = Decoration.mark({ class: 'cm-variable' })

function buildDecorations(view: EditorView): DecorationSet {
  const values = view.state.field(variablesField)
  const builder = new RangeSetBuilder<Decoration>()
  if (values.size === 0) return builder.finish()
  let done = -1
  for (const { from, to } of view.visibleRanges) {
    for (let pos = Math.max(from, done + 1); pos <= to; ) {
      const line = view.state.doc.lineAt(pos)
      const definition = parseDefinitionLine(line.text)
      if (definition) {
        builder.add(line.from, line.from, definitionLine)
        builder.add(line.from + definition.nameFrom, line.from + definition.nameTo, definitionName)
      }
      for (const match of line.text.matchAll(variableReferencePattern())) {
        if (definition && match.index === definition.nameFrom) continue
        if (!values.has(match[1])) continue
        builder.add(line.from + match.index, line.from + match.index + match[0].length, referenceChip)
      }
      done = line.to
      pos = line.to + 1
    }
  }
  return builder.finish()
}

const variableHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = buildDecorations(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

interface VariableAt {
  name: string
  isDefinition: boolean
}

function variableAt(state: EditorState, pos: number): VariableAt | null {
  const line = state.doc.lineAt(pos)
  const definition = parseDefinitionLine(line.text)
  for (const match of line.text.matchAll(variableReferencePattern())) {
    const from = line.from + match.index
    if (pos < from || pos > from + match[0].length) continue
    if (!state.field(variablesField).has(match[1])) return null
    return { name: match[1], isDefinition: definition?.nameFrom === match.index }
  }
  return null
}

// Where the variable's value is written, so it can be selected and typed over.
function definitionRange(state: EditorState, name: string): { from: number; to: number } | null {
  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number)
    const definition = parseDefinitionLine(line.text)
    if (definition?.name === name) return { from: line.from + definition.valueFrom, to: line.from + definition.valueTo }
  }
  return null
}

function countReferences(state: EditorState, name: string): number {
  let count = 0
  for (const match of state.doc.toString().matchAll(variableReferencePattern())) if (match[1] === name) count++
  return count - 1
}

function tooltipBody(state: EditorState, { name, isDefinition }: VariableAt): HTMLElement {
  const value = resolveVariables(state.field(variablesField), state.field(snippetBodiesField)).get(name) ?? ''
  const container = document.createElement('div')
  container.className = 'cm-snippet-tooltip'

  const heading = document.createElement('div')
  heading.className = 'cm-snippet-tooltip-name cm-variable-tooltip-name'
  heading.textContent = `$${name}`
  container.append(heading)

  const text = document.createElement('div')
  text.className = 'cm-snippet-tooltip-body'
  if (value.trim() === '') text.textContent = 'This variable is empty.'
  else text.textContent = value.length > TOOLTIP_PREVIEW_LENGTH ? `${value.slice(0, TOOLTIP_PREVIEW_LENGTH)}…` : value
  container.append(text)

  const hint = document.createElement('div')
  hint.className = 'cm-snippet-tooltip-hint'
  if (isDefinition) {
    const uses = countReferences(state, name)
    hint.textContent = uses === 0 ? `Not used yet. Type $${name} to use it.` : `Used ${uses} ${uses === 1 ? 'time' : 'times'}. Change it here to change them all.`
  } else {
    hint.textContent = '⌘ click to change it'
  }
  container.append(hint)
  return container
}

const variableTooltip = hoverTooltip((view, pos) => {
  const variable = variableAt(view.state, pos)
  if (!variable) return null
  return { pos, above: true, create: () => ({ dom: tooltipBody(view.state, variable) }) }
})

const jumpOnModClick = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey)) return false
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    const variable = pos === null ? null : variableAt(view.state, pos)
    const range = variable && !variable.isDefinition ? definitionRange(view.state, variable.name) : null
    if (!range) return false
    event.preventDefault()
    view.dispatch({ selection: { anchor: range.from, head: range.to }, scrollIntoView: true })
    view.focus()
    return true
  },
})

// Suggests the variables this note defines after a "$".
export function variableCompletionSource(context: CompletionContext): CompletionResult | null {
  const typed = context.matchBefore(/(?<![\w$\\])\$[a-z0-9_-]*/)
  if (!typed) return null
  const line = context.state.doc.lineAt(typed.from)
  // Starting a new definition, not using one.
  if (line.text.slice(0, typed.from - line.from).trim() === '') return null
  const values = context.state.field(variablesField)
  if (values.size === 0) return null
  const options: Completion[] = [...values].map(([name, value]) => ({
    label: `$${name}`,
    detail: value.length > DETAIL_LENGTH ? `${value.slice(0, DETAIL_LENGTH)}…` : value,
    type: 'variable',
    section: { name: 'Variables', rank: 2 },
  }))
  return { from: typed.from, options }
}

export const noteVariables = [variablesField, variableHighlighter, variableTooltip, jumpOnModClick]
