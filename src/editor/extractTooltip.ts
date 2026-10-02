import { StateField, type EditorState } from '@codemirror/state'
import { showTooltip, type EditorView, type Tooltip } from '@codemirror/view'
import { canWrapSelection, wrapSelectionInBlock } from './noteVariables'

function tooltipButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.title = title
  // Keeps the selection while the button is pressed.
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('click', onClick)
  return button
}

function selectionTooltip(state: EditorState, onExtract: () => void, onFolded: (name: string) => void): Tooltip | null {
  const range = state.selection.main
  // Several ranges are selected while a folded block's name is being typed, which isn't a time for buttons.
  if (state.selection.ranges.length > 1) return null
  if (range.empty || state.sliceDoc(range.from, range.to).trim() === '') return null
  const foldable = canWrapSelection(state)
  return {
    pos: range.from,
    above: true,
    create(view: EditorView) {
      const dom = document.createElement('div')
      dom.className = 'cm-extract-tooltip'
      dom.append(tooltipButton('Make a snippet', 'Move the selected text into a new snippet', onExtract))
      if (foldable) {
        const fold = () => {
          const name = wrapSelectionInBlock(view)
          if (name) onFolded(name)
        }
        dom.append(tooltipButton('Fold away', 'Fold the selected lines into a $variable block, right where they are', fold))
      }
      return { dom, offset: { x: 0, y: 6 } }
    },
  }
}

// Offers to turn the selected text into a snippet, or to fold it away in the note, with small buttons above it.
export function extractTooltip(onExtract: () => void, onFolded: (name: string) => void) {
  return StateField.define<Tooltip | null>({
    create: (state) => selectionTooltip(state, onExtract, onFolded),
    update(tooltip, transaction) {
      if (!transaction.docChanged && !transaction.selection) return tooltip
      return selectionTooltip(transaction.state, onExtract, onFolded)
    },
    provide: (field) => showTooltip.from(field),
  })
}
