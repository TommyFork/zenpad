import { StateField, type EditorState } from '@codemirror/state'
import { showTooltip, type Tooltip } from '@codemirror/view'

function selectionTooltip(state: EditorState, onExtract: () => void): Tooltip | null {
  const range = state.selection.main
  if (range.empty || state.sliceDoc(range.from, range.to).trim() === '') return null
  return {
    pos: range.from,
    above: true,
    create() {
      const dom = document.createElement('div')
      dom.className = 'cm-extract-tooltip'
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'Make a snippet'
      button.title = 'Move the selected text into a new snippet'
      // Keeps the selection while the button is pressed.
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', onExtract)
      dom.append(button)
      return { dom, offset: { x: 0, y: 6 } }
    },
  }
}

// Offers to turn the selected text into a snippet, with a small button above the selection.
export function extractTooltip(onExtract: () => void) {
  return StateField.define<Tooltip | null>({
    create: (state) => selectionTooltip(state, onExtract),
    update(tooltip, transaction) {
      if (!transaction.docChanged && !transaction.selection) return tooltip
      return selectionTooltip(transaction.state, onExtract)
    },
    provide: (field) => showTooltip.from(field),
  })
}
