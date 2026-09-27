import { useState } from 'react'
import type { DocumentRef } from '../app/documents'
import type { Note, Snippet } from '../lib/db'
import { noteTitle } from '../lib/notes'
import { describeUses, type SnippetUsers } from '../lib/snippets'
import { Icon } from './Icon'
import { SnippetNameField } from './SnippetNameField'

const USERS_SHOWN = 6

interface SnippetHeaderProps {
  snippet: Snippet
  users: SnippetUsers<Note, Snippet>
  // The snippet this one is nested inside, when it is only used there.
  parentName: string | undefined
  focusName: boolean
  onRename: (name: string) => Promise<string>
  onNameDone: () => void
  onOpenSnippet: (name: string) => void
  onOpen: (doc: DocumentRef) => void
  onShowMap: () => void
}

// Links to every note and snippet that uses this one. Long lists start folded.
function UsedIn({ users, onOpen }: { users: SnippetUsers<Note, Snippet>; onOpen: (doc: DocumentRef) => void }) {
  const [showAll, setShowAll] = useState(false)
  const items = [
    ...users.notes.map((note) => ({ doc: { kind: 'note', id: note.id } as DocumentRef, label: noteTitle(note.body) })),
    ...users.snippets.map((snippet) => ({ doc: { kind: 'snippet', id: snippet.id } as DocumentRef, label: `@${snippet.name}` })),
  ]
  const hidden = showAll ? 0 : Math.max(0, items.length - USERS_SHOWN)
  return (
    <ul className="used-in" aria-label="Used in">
      {items.slice(0, items.length - hidden).map(({ doc, label }) => (
        <li key={doc.id}>
          <button className={`used-in-item is-${doc.kind}`} onClick={() => onOpen(doc)} title={`Open ${doc.kind === 'note' ? `“${label}”` : label}`}>
            <Icon name={doc.kind === 'note' ? 'note' : 'at'} size={14} />
            <span>{label}</span>
          </button>
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button className="used-in-item is-more" onClick={() => setShowAll(true)}>
            {hidden} more
          </button>
        </li>
      )}
    </ul>
  )
}

export function SnippetHeader({
  snippet,
  users,
  parentName,
  focusName,
  onRename,
  onNameDone,
  onOpenSnippet,
  onOpen,
  onShowMap,
}: SnippetHeaderProps) {
  const uses = describeUses(users.notes.length, users.snippets.length)
  return (
    <header className="snippet-header">
      <div className="snippet-kicker-row">
        <span className="snippet-kicker">Snippet</span>
        <button className="map-link" onClick={onShowMap} title="See how your snippets connect">
          <Icon name="map" size={14} />
          <span>Map</span>
        </button>
      </div>
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
      {!parentName && uses && <UsedIn key={snippet.id} users={users} onOpen={onOpen} />}
    </header>
  )
}
