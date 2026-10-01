import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { codeFolding, foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language'
import { EditorSelection, Facet, RangeSetBuilder, StateField, type EditorState, type StateEffect, type Text } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  hoverTooltip,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { countWords } from '../lib/notes'
import {
  parseBlocks,
  parseDefinitionLine,
  parseVariables,
  resolveVariables,
  variableTokens,
  wrapInBlock,
  type VariableToken,
} from '../lib/variables'
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

interface BlockRange {
  name: string
  // Line numbers of the opening and closing lines.
  openLine: number
  closeLine: number
  // Where the value starts, and what folds away: from the end of the opening line to the closing quotes.
  bodyFrom: number
  foldFrom: number
  foldTo: number
}

function readBlocks(doc: Text): BlockRange[] {
  return parseBlocks(doc.toJSON()).map(({ name, open, close }) => {
    const openLine = doc.line(open + 1)
    const closeLine = doc.line(close + 1)
    return {
      name,
      openLine: openLine.number,
      closeLine: closeLine.number,
      bodyFrom: open + 1 < close ? openLine.to + 1 : closeLine.from,
      foldFrom: openLine.to,
      foldTo: closeLine.from + closeLine.text.indexOf('"""'),
    }
  })
}

const blocksField = StateField.define<readonly BlockRange[]>({
  create: (state) => readBlocks(state.doc),
  update: (blocks, transaction) => (transaction.docChanged ? readBlocks(transaction.newDoc) : blocks),
})

type LineRole = 'open' | 'body' | 'close' | null

function lineRole(state: EditorState, number: number): LineRole {
  const block = state.field(blocksField).find((range) => range.openLine <= number && number <= range.closeLine)
  if (!block) return null
  return number === block.openLine ? 'open' : number === block.closeLine ? 'close' : 'body'
}

function isFolded(state: EditorState, block: BlockRange): boolean {
  let folded = false
  foldedRanges(state).between(block.foldFrom, block.foldFrom, (from) => {
    if (from === block.foldFrom) folded = true
  })
  return folded
}

function foldBlock(state: EditorState, block: BlockRange) {
  const { head } = state.selection.main
  // A fold that holds the cursor would open again straight away.
  const inside = head > block.foldFrom && head < block.foldTo
  return {
    effects: foldEffect.of({ from: block.foldFrom, to: block.foldTo }),
    selection: inside ? { anchor: block.foldFrom } : undefined,
  }
}

// Folds every block the writer didn't leave open, so a note opens with its long values tucked away.
export function foldVariableBlocks(state: EditorState, leftOpen: ReadonlySet<string> = new Set()): StateEffect<unknown>[] {
  return (state.field(blocksField, false) ?? [])
    .filter((block) => !leftOpen.has(block.name))
    .map((block) => foldEffect.of({ from: block.foldFrom, to: block.foldTo }))
}

// The names of the blocks showing their text, to open them the same way next time.
export function openBlockNames(state: EditorState): string[] {
  const blocks = state.field(blocksField, false) ?? []
  return [...new Set(blocks.filter((block) => !isFolded(state, block)).map((block) => block.name))]
}

// Whether selected text can be folded away into a block. Only notes can: a snippet's blocks wouldn't be
// read as definitions in the notes that use it.
export const blockWrapping = Facet.define<boolean, boolean>({ combine: (values) => values.some(Boolean) })

export function canWrapSelection(state: EditorState): boolean {
  const { from, to } = state.selection.main
  return state.facet(blockWrapping) && wrapInBlock(state.doc.toString(), from, to) !== null
}

// Moves the selection into a folded block and selects both copies of its name, so typing renames it.
export function wrapSelectionInBlock(view: EditorView): string | null {
  const { from, to } = view.state.selection.main
  const wrap = view.state.facet(blockWrapping) ? wrapInBlock(view.state.doc.toString(), from, to) : null
  if (!wrap) return null
  view.dispatch({
    changes: [
      { from: wrap.at, insert: wrap.block },
      { from, to, insert: wrap.reference },
    ],
    selection: EditorSelection.create(
      wrap.nameRanges.map((range) => EditorSelection.range(range.from, range.to)),
      1,
    ),
    scrollIntoView: true,
    userEvent: 'input.fold',
  })
  const number = view.state.doc.lineAt(wrap.at).number
  const block = view.state.field(blocksField).find((range) => range.openLine === number)
  if (block) view.dispatch({ effects: foldEffect.of({ from: block.foldFrom, to: block.foldTo }) })
  view.focus()
  return wrap.name
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`
}

// The folded text runs from the end of the opening line to the closing quotes.
function blockSummary(folded: string): string {
  const body = folded.replace(/^\n/, '').replace(/\n[ \t]*$/, '')
  if (body.trim() === '') return 'empty'
  return `${plural(body.split('\n').length, 'line')} · ${plural(countWords(body), 'word')}`
}

const blockFolding = codeFolding({
  preparePlaceholder: (state, range) => blockSummary(state.sliceDoc(range.from, range.to)),
  placeholderDOM(_view, onclick, summary: string) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-variable-fold'
    button.textContent = summary
    button.title = 'Show the text'
    button.setAttribute('aria-label', `Show the folded text, ${summary}`)
    button.addEventListener('click', onclick)
    return button
  },
})

class FoldButton extends WidgetType {
  eq() {
    return true
  }

  toDOM(view: EditorView) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-variable-fold-button'
    button.textContent = 'Fold'
    button.title = 'Fold this text out of the way'
    // Keeps the editor from moving the cursor to the button first.
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => {
      const number = view.state.doc.lineAt(view.posAtDOM(button)).number
      const block = view.state.field(blocksField).find((range) => range.openLine === number)
      if (block) view.dispatch(foldBlock(view.state, block))
    })
    return button
  }

  ignoreEvent() {
    return true
  }
}

const foldButton = Decoration.widget({ widget: new FoldButton(), side: 1 })

const definitionLine = Decoration.line({ class: 'cm-variable-line' })
const blockLine = Decoration.line({ class: 'cm-variable-block-line' })
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
// Inside a block, "$name" uses a variable and nothing is defined.
function lineVariables(text: string, role: LineRole): LineVariable[] {
  if (role === 'close') return []
  if (role === 'body') return variableTokens(text).map((token) => ({ token: { ...token, inline: undefined }, isDefinition: false }))
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
      const role = lineRole(view.state, line.number)
      if (role === 'body') builder.add(line.from, line.from, blockLine)
      else if (role || parseDefinitionLine(line.text)) builder.add(line.from, line.from, definitionLine)
      for (const { token, isDefinition } of lineVariables(line.text, role)) {
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
      if (role === 'open') {
        const block = view.state.field(blocksField).find((range) => range.openLine === line.number)
        if (block && !isFolded(view.state, block)) builder.add(line.to, line.to, foldButton)
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
      const foldsChanged = foldedRanges(update.startState) !== foldedRanges(update.state)
      if (update.docChanged || update.viewportChanged || foldsChanged) this.decorations = buildDecorations(update.view)
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
  for (const { token, isDefinition } of lineVariables(line.text, lineRole(state, line.number))) {
    if (pos < line.from + token.from || pos > line.from + token.to) continue
    if (!state.field(variablesField).has(token.name)) return null
    return { name: token.name, isDefinition, isInline: token.inline !== undefined }
  }
  return null
}

// Where the variable's value is first set, so it can be selected and typed over.
// A block's value can be long, so the cursor goes to its start instead.
function definitionRange(state: EditorState, name: string): { from: number; to: number } | null {
  const blocks = new Map(state.field(blocksField).map((block) => [block.openLine, block]))
  for (let number = 1; number <= state.doc.lines; number++) {
    const block = blocks.get(number)
    if (block?.name === name) return { from: block.bodyFrom, to: block.bodyFrom }
    if (block) {
      number = block.closeLine
      continue
    }
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
    for (const { token, isDefinition } of lineVariables(state.doc.line(number).text, lineRole(state, number))) {
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
    const unfold: StateEffect<unknown>[] = []
    foldedRanges(view.state).between(range.from, range.to, (from, to) => {
      if (from <= range.from && to >= range.to) unfold.push(unfoldEffect.of({ from, to }))
    })
    view.dispatch({ effects: unfold, selection: { anchor: range.from, head: range.to }, scrollIntoView: true })
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

export const noteVariables = [variablesField, blocksField, blockFolding, variableHighlighter, variableTooltip, jumpOnModClick]
