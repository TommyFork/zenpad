import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { isValidSnippetName } from '../lib/snippets'
import { snippetBodiesField } from './snippetState'

const DETAIL_LENGTH = 60

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

export function snippetCompletion(onCreateSnippet: (name: string) => void) {
  function source(context: CompletionContext): CompletionResult | null {
    const typed = context.matchBefore(/(?<![\w@])@[a-z0-9_-]*/)
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

  return autocompletion({ override: [source], icons: false, closeOnBlur: true, maxRenderedOptions: 40 })
}
