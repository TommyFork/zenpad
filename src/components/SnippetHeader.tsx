import type { Snippet } from '../lib/db'
import { SnippetNameField } from './SnippetNameField'

interface SnippetHeaderProps {
  snippet: Snippet
  usageCount: number
  focusName: boolean
  onRename: (name: string) => Promise<string>
  onNameDone: () => void
}

function usageLabel(count: number): string {
  if (count === 0) return 'Not used in any notes yet'
  return `Used in ${count} ${count === 1 ? 'note' : 'notes'}`
}

export function SnippetHeader({ snippet, usageCount, focusName, onRename, onNameDone }: SnippetHeaderProps) {
  return (
    <header className="snippet-header">
      <span className="snippet-kicker">Snippet</span>
      <SnippetNameField key={`${snippet.id}:${snippet.name}`} name={snippet.name} autoFocus={focusName} onRename={onRename} onDone={onNameDone} />
      <p className="snippet-meta">
        {usageLabel(usageCount)}. Type <span className="inline-chip">@{snippet.name}</span> in any note to drop this text in.
      </p>
    </header>
  )
}
