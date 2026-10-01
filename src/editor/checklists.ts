import { EditorSelection, Prec, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, keymap, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { parseTaskLine, parseTasks, toggleChecklist, type TaskLine } from '../lib/tasks'

// Where the hidden marker sits: a bullet goes with its box, a number stays in view.
function markerRange(task: TaskLine, lineFrom: number) {
  return { from: lineFrom + (task.ordered ? task.boxFrom : task.markerFrom), to: lineFrom + task.textFrom }
}

function toggleTaskAt(view: EditorView, pos: number): boolean {
  if (view.state.readOnly) return false
  const line = view.state.doc.lineAt(pos)
  const task = parseTaskLine(line.text)
  if (!task) return false
  const at = line.from + task.boxFrom + 1
  view.dispatch({ changes: { from: at, to: at + 1, insert: task.checked ? ' ' : 'x' }, userEvent: 'input.check' })
  return true
}

class CheckboxWidget extends WidgetType {
  readonly checked: boolean
  readonly interactive: boolean

  constructor(checked: boolean, interactive: boolean) {
    super()
    this.checked = checked
    this.interactive = interactive
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.interactive === this.interactive
  }

  toDOM(view: EditorView) {
    const box = document.createElement('span')
    box.className = this.checked ? 'cm-task-box is-checked' : 'cm-task-box'
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', String(this.checked))
    if (!this.interactive) return box
    box.title = this.checked ? 'Mark as not done' : 'Mark as done'
    // Keeps the cursor and focus where they were.
    box.addEventListener('mousedown', (event) => event.preventDefault())
    box.addEventListener('click', (event) => {
      event.preventDefault()
      toggleTaskAt(view, view.posAtDOM(box))
    })
    return box
  }

  ignoreEvent() {
    return true
  }
}

function buildDecorations(state: EditorState, interactive: boolean): DecorationSet {
  const { doc } = state
  const ranges: Range<Decoration>[] = []
  for (const task of parseTasks(doc.toString())) {
    const line = doc.line(task.line + 1)
    const marker = markerRange(task, line.from)
    ranges.push(Decoration.replace({ widget: new CheckboxWidget(task.checked, interactive) }).range(marker.from, marker.to))
    if (task.checked && marker.to < line.to) ranges.push(Decoration.mark({ class: 'cm-task-done' }).range(marker.to, line.to))
  }
  return Decoration.set(ranges, true)
}

// Turns the lines the selection touches into a checklist, or back into plain lines.
export function toggleChecklistLines(view: EditorView): boolean {
  const { state } = view
  if (state.readOnly) return false
  const { from, to, empty, head } = state.selection.main
  const first = state.doc.lineAt(from)
  // A selection ending at the very start of a line doesn't take that line with it.
  const last = !empty && to === state.doc.lineAt(to).from ? state.doc.lineAt(to - 1) : state.doc.lineAt(to)
  const lines = []
  for (let number = first.number; number <= last.number; number++) lines.push(state.doc.line(number))
  const toggled = toggleChecklist(lines.map((line) => line.text))
  // Only the start of each line changes, so the cursor stays with the text it was in.
  const changes = state.changes(
    lines.flatMap((line, index) => {
      const next = toggled[index]
      if (next === line.text) return []
      let same = 0
      while (same < line.text.length && same < next.length && line.text.at(-1 - same) === next.at(-1 - same)) same++
      return [{ from: line.from, to: line.to - same, insert: next.slice(0, next.length - same) }]
    }),
  )
  if (changes.empty) return true
  view.dispatch({
    changes,
    selection: empty
      ? EditorSelection.cursor(changes.mapPos(head, 1))
      : EditorSelection.range(changes.mapPos(from, -1), changes.mapPos(to, 1)),
    scrollIntoView: true,
    userEvent: 'input.checklist',
  })
  return true
}

// The hidden marker of the task on the cursor's line, if there is one.
function markerAtLine(state: EditorState, pos: number) {
  const line = state.doc.lineAt(pos)
  const task = parseTaskLine(line.text)
  return task ? markerRange(task, line.from) : null
}

// Home stops after the box rather than in front of the hidden bullet.
function moveToTaskStart(view: EditorView, extend: boolean): boolean {
  const range = view.state.selection.main
  const marker = markerAtLine(view.state, range.head)
  if (!marker) return false
  const boundary = view.moveToLineBoundary(range, false, true).head
  if (boundary > marker.to) return false
  view.dispatch({
    selection: extend ? EditorSelection.range(range.anchor, marker.to) : EditorSelection.cursor(marker.to),
    scrollIntoView: true,
    userEvent: 'select',
  })
  return true
}

// Backspace on either side of the box removes it. Markdown's own Backspace would leave the bullet's width
// as spaces, and from in front of the box it would join the line above.
function deleteTaskBox(view: EditorView): boolean {
  const range = view.state.selection.main
  if (!range.empty || view.state.selection.ranges.length > 1) return false
  const marker = markerAtLine(view.state, range.head)
  if (!marker || (range.head !== marker.from && range.head !== marker.to)) return false
  view.dispatch({ changes: marker, selection: { anchor: marker.from }, userEvent: 'delete.backward' })
  return true
}

// Checks off the task the cursor is on.
export function toggleTaskAtCursor(view: EditorView): boolean {
  return toggleTaskAt(view, view.state.selection.main.head)
}

export function checklists({ interactive }: { interactive: boolean }) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view.state, interactive)
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.decorations = buildDecorations(update.state, interactive)
      }
    },
    {
      decorations: (value) => value.decorations,
      // The hidden marker moves and deletes as one piece, so backspace at the start of a task removes its box.
      provide: (value) => EditorView.atomicRanges.of((view) => view.plugin(value)?.decorations ?? Decoration.none),
    },
  )
  if (!interactive) return plugin

  // Typing just before a hidden marker would land in front of the bullet and break the task, so it goes after the box.
  const typeAfterBox = EditorView.inputHandler.of((view, from, to, text) => {
    if (from !== to || text.includes('\n')) return false
    const line = view.state.doc.lineAt(from)
    const task = parseTaskLine(line.text)
    if (!task) return false
    const marker = markerRange(task, line.from)
    // A bare `- [ ]` needs a space before its text, or it stops being a task.
    const gap = line.text[task.boxFrom + 3] === undefined ? ' ' : ''
    if (from !== marker.from && !(from === marker.to && gap)) return false
    view.dispatch({
      changes: { from: marker.to, insert: gap + text },
      selection: { anchor: marker.to + gap.length + text.length },
      userEvent: 'input.type',
    })
    return true
  })

  return [
    plugin,
    typeAfterBox,
    // Ahead of the markdown keymap, which has its own Backspace for list markup.
    Prec.highest(
      keymap.of([
        { key: 'Mod-Shift-l', run: toggleChecklistLines },
        { key: 'Mod-Shift-Enter', run: toggleTaskAtCursor },
        { key: 'Home', run: (view) => moveToTaskStart(view, false), shift: (view) => moveToTaskStart(view, true) },
        { mac: 'Cmd-ArrowLeft', run: (view) => moveToTaskStart(view, false), shift: (view) => moveToTaskStart(view, true) },
        { key: 'Backspace', run: deleteTaskBox },
      ]),
    ),
  ]
}
