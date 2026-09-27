import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { RangeSetBuilder, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, hoverTooltip, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { parseDefinitionLine, parseVariables, resolveVariables, variableTokens, type VariableToken } from '../lib/variables'
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
const inlineBrace = Decoration.mark({ class: 'cm-variable-brace' })
const inlineValue = Decoration.mark({ class: 'cm-variable-value' })

interface LineVariable {
  token: VariableToken
  // A definition line's "$name", or an inline "$name{value}".
  isDefinition: boolean
}

// The variables on a line. A definition line's value is skipped, since it isn't part of the note.
function lineVariables(text: string): LineVariable[] {
  const definition = parseDefinitionLine(text)
  return variableTokens(text).flatMap((token) => {
    if (!definition) return [{ token, isDefinition: token.inline !== undefined }]
    return token.from === definition.nameFrom ? [{ token, isDefinition: true }] : token.from >= definition.valueFrom ? [{ token, isDefinition: false }] : []
  })
}

function buildDecorations(view: EditorView): DecorationSet {
  const values = view.state.field(variablesField)
  const builder = new RangeSetBuilder<Decoration>()
  if (values.size === 0) return builder.finish()
  let done = -1
  for (const { from, to } of view.visibleRanges) {
    for (let pos = Math.max(from, done + 1); pos <= to; ) {
      const line = view.state.doc.lineAt(pos)
      if (parseDefinitionLine(line.text)) builder.add(line.from, line.from, definitionLine)
      for (const { token, isDefinition } of lineVariables(line.text)) {
        const at = (offset: number) => line.from + offset
        if (token.inline) {
          builder.add(at(token.from), at(token.nameTo), definitionName)
          builder.add(at(token.nameTo), at(token.inline.from), inlineBrace)
          if (token.inline.to > token.inline.from) builder.add(at(token.inline.from), at(token.inline.to), inlineValue)
          builder.add(at(token.inline.to), at(token.to), inlineBrace)
        } else if (values.has(token.name)) {
          builder.add(at(token.from), at(token.to), isDefinition ? definitionName : referenceChip)
        }
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
  isInline: boolean
}

function variableAt(state: EditorState, pos: number): VariableAt | null {
  const line = state.doc.lineAt(pos)
  for (const { token, isDefinition } of lineVariables(line.text)) {
    if (pos < line.from + token.from || pos > line.from + token.to) continue
    if (!state.field(variablesField).has(token.name)) return null
    return { name: token.name, isDefinition, isInline: token.inline !== undefined }
  }
  return null
}

// Where the variable's value is first set, so it can be selected and typed over.
function definitionRange(state: EditorState, name: string): { from: number; to: number } | null {
  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number)
    const definition = parseDefinitionLine(line.text)
    if (definition?.name === name) return { from: line.from + definition.valueFrom, to: line.from + definition.valueTo }
    if (definition) continue
    const inline = variableTokens(line.text).find((token) => token.name === name && token.inline)?.inline
    if (inline) return { from: line.from + inline.from, to: line.from + inline.to }
  }
  return null
}

function countReferences(state: EditorState, name: string): number {
  let count = 0
  for (let number = 1; number <= state.doc.lines; number++) {
    for (const { token, isDefinition } of lineVariables(state.doc.line(number).text)) {
      if (token.name === name && !isDefinition) count++
    }
  }
  return count
}

function tooltipBody(state: EditorState, { name, isDefinition, isInline }: VariableAt): HTMLElement {
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
    hint.textContent =
      uses === 0
        ? `Not used ${isInline ? 'anywhere else ' : ''}yet. Type $${name} to use it.`
        : `Used ${uses} ${isInline ? 'more ' : ''}${uses === 1 ? 'time' : 'times'}. Change it here to change them all.`
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
  const typed = context.matchBefore(/(?<![\w$\\])\$[A-Za-z0-9_-]*/)
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
