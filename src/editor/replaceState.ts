import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

// setState leaves layout reads that plugins queued against the old document (an open tooltip, say) pending,
// and they then throw on the new document's shorter positions. EditorView.measure runs them first; it is
// left out of the published types but has long been on the class.
export function replaceState(view: EditorView, state: EditorState) {
  ;(view as EditorView & { measure(): void }).measure()
  view.setState(state)
}
