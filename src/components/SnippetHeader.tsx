import type { Snippet } from '../lib/db'
import { describeUses } from '../lib/snippets'
import { SnippetNameField } from './SnippetNameField'

interface SnippetHeaderProps {
  snippet: Snippet
  noteUses: number
  snippetUses: number
  // The snippet this one is nested inside, when it is only used there.
  parentName: string | undefined
  focusName: boolean
  onRename: (name: string) => Promise<string>
  onNameDone: () => void
  onOpenSnippet: (name: string) => void
}

export function SnippetHeader({
  snippet,
  noteUses,
  snippetUses,
  parentName,
  focusName,
  onRename,
  onNameDone,
  onOpenSnippet,
}: SnippetHeaderProps) {
  const uses = describeUses(noteUses, snippetUses)
  return (
    <header className="snippet-header">
      <span className="snippet-kicker">Snippet</span>
      <SnippetNameField key={`${snippet.id}:${snippet.name}`} name={snippet.name} autoFocus={focusName} onRename={onRename} onDone={onNameDone} />
      <p className="snippet-meta">
        {parentName ? (
          <>
            Part of{' '}
            <button className="inline-chip" onClick={() => onOpenSnippet(parentName)} title={`Open @${parentName}`}>
              @{parentName}
            </button>
          </>
        ) : uses ? (
          `Used in ${uses}`
        ) : (
          'Not used anywhere yet'
        )}
        . Type <span className="inline-chip">@{snippet.name}</span> in any note to drop this text in.
      </p>
    </header>
  )
}
