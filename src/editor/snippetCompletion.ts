import {
  autocompletion,
  closeCompletion,
  completionStatus,
  selectedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { Prec } from '@codemirror/state'
import { keymap, type EditorView } from '@codemirror/view'
import { isValidSnippetName } from '../lib/snippets'
import { variableCompletionSource } from './noteVariables'
import { snippetBodiesField } from './snippetState'

const DETAIL_LENGTH = 60
const TYPED_SNIPPET = /(?<![\w@])@[a-z0-9_-]*/
const PASTE_HINT = '⇧ ↵ paste text'

// Sections keep "create" below every existing snippet, even when the typed text matches it exactly.
const EXISTING_SECTION = { name: 'Snippets', rank: 0 }
const CREATE_SECTION = { name: 'Create', rank: 1 }

function firstLine(body: string): string {
  const line = body.trim().split('\n')[0] ?? ''
  return line.length > DETAIL_LENGTH ? `${line.slice(0, DETAIL_LENGTH)}…` : line
}

function createOption(name: string, onCreateSnippet: (name: string) => void): Completion {
  return {
    label: `@${name}`,
    detail: 'create new snippet',
    type: 'create',
    section: CREATE_SECTION,
    apply(view: EditorView, _completion, from, to) {
      view.dispatch({ changes: { from, to, insert: `@${name}` }, selection: { anchor: from + name.length + 1 } })
      onCreateSnippet(name)
    },
  }
}

// Shift Enter on a suggested snippet pastes a copy of its text instead of the linked @reference.
// Nested @snippets and $variables are pasted as written, so they stay live.
function pasteSelectedSnippet(view: EditorView): boolean {
  if (completionStatus(view.state) !== 'active') return false
  const completion = selectedCompletion(view.state)
  if (completion?.type !== 'snippet') return false
  const body = view.state.field(snippetBodiesField).get(completion.label.slice(1))
  const { head } = view.state.selection.main
  const line = view.state.doc.lineAt(head)
  const typed = new RegExp(`${TYPED_SNIPPET.source}$`).exec(line.text.slice(0, head - line.from))
  if (body === undefined || !typed) return false
  const from = line.from + typed.index
  closeCompletion(view)
  view.dispatch({
    changes: { from, to: head, insert: body },
    selection: { anchor: from + body.length },
    scrollIntoView: true,
    userEvent: 'input.paste',
  })
  return true
}

export function snippetCompletion(onCreateSnippet: (name: string) => void) {
  function source(context: CompletionContext): CompletionResult | null {
    const typed = context.matchBefore(TYPED_SNIPPET)
    if (!typed) return null

    const bodies = context.state.field(snippetBodiesField)
    const options: Completion[] = [...bodies].map(([name, body]) => ({
      label: `@${name}`,
      detail: firstLine(body),
      type: 'snippet',
      section: EXISTING_SECTION,
    }))

    const name = typed.text.slice(1)
    if (isValidSnippetName(name) && !bodies.has(name)) options.push(createOption(name, onCreateSnippet))
    if (options.length === 0) return null

    return { from: typed.from, options }
  }

  return [
    autocompletion({
      override: [source, variableCompletionSource],
      optionClass: (completion) => (completion.type ? `cm-completion-${completion.type}` : ''),
      // Shown on the highlighted snippet only, so the list stays quiet.
      addToOptions: [
        {
          position: 90,
          render(completion) {
            if (completion.type !== 'snippet') return null
            const hint = document.createElement('kbd')
            hint.className = 'cm-completionPaste'
            hint.textContent = PASTE_HINT
            return hint
          },
        },
      ],
      icons: false,
      closeOnBlur: true,
      maxRenderedOptions: 40,
    }),
    Prec.highest(keymap.of([{ key: 'Shift-Enter', run: pasteSelectedSnippet }])),
  ]
}
