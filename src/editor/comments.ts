import { EditorSelection, Prec, RangeSetBuilder, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view'
import { commentLines, toggleCommentLines } from '../lib/comments'

const commentLine = Decoration.line({ class: 'cm-comment-line', attributes: { title: "A comment, left out when you copy" } })

function buildDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const marks = commentLines(state.doc.toJSON())
  for (const [index, isComment] of marks.entries()) {
    if (isComment) builder.add(state.doc.line(index + 1).from, state.doc.line(index + 1).from, commentLine)
  }
  return builder.finish()
}

// A field rather than a view plugin, since a fence far above the viewport decides what counts as a comment.
const commentField = StateField.define<DecorationSet>({
  create: buildDecorations,
  update: (decorations, transaction) => (transaction.docChanged ? buildDecorations(transaction.state) : decorations),
  provide: (field) => EditorView.decorations.from(field),
})

export function toggleComment(view: EditorView): boolean {
  if (view.state.readOnly) return false
  const { from, to, head, anchor } = view.state.selection.main
  const toggle = toggleCommentLines(view.state.doc.toString(), from, to)
  const changes = view.state.changes({ from: toggle.from, to: toggle.to, insert: toggle.insert })
  view.dispatch({
    changes,
    selection: EditorSelection.single(changes.mapPos(anchor, 1), changes.mapPos(head, 1)),
    userEvent: 'input.comment',
  })
  return true
}

export const comments = [commentField, Prec.high(keymap.of([{ key: 'Mod-/', run: toggleComment }]))]
