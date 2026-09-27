import { useEffect, useId, useRef, useState } from 'react'
import type { DocumentRef } from '../app/documents'
import type { Note, Snippet } from '../lib/db'
import { noteTitle } from '../lib/notes'
import { describeUses, referenceExcerpt, type SnippetUsers } from '../lib/snippets'
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

interface UserItem {
  doc: DocumentRef
  label: string
  body: string
}

interface Peek {
  item: UserItem
  anchor: DOMRect
}

const PEEK_DELAY = 350
const PEEK_WIDTH = 360
const PEEK_GAP = 8
const PEEK_MARGIN = 16

// A read-only glimpse of where a note or snippet mentions this one, shown while hovering its link.
function UserPeek({ peek, name, id }: { peek: Peek; name: string; id: string }) {
  const { item, anchor } = peek
  const excerpt = referenceExcerpt(item.body, name)
  const width = Math.min(PEEK_WIDTH, window.innerWidth - PEEK_MARGIN * 2)
  const left = Math.max(PEEK_MARGIN, Math.min(anchor.left, window.innerWidth - width - PEEK_MARGIN))
  return (
    <div id={id} role="tooltip" className="user-peek" style={{ top: anchor.bottom + PEEK_GAP, left, width }}>
      <div className={`user-peek-title is-${item.doc.kind}`}>
        <Icon name={item.doc.kind === 'note' ? 'note' : 'at'} size={14} />
        <span>{item.label}</span>
      </div>
      {excerpt && (
        <p className="user-peek-body">
          {excerpt.before}
          <mark className="user-peek-chip">@{name}</mark>
          {excerpt.after}
        </p>
      )}
      <div className="user-peek-hint">
        {excerpt && excerpt.count > 1 ? `Mentions @${name} ${excerpt.count} times · ` : ''}Click to open
      </div>
    </div>
  )
}

// Links to every note and snippet that uses this one. Long lists start folded.
function UsedIn({
  name,
  users,
  onOpen,
}: {
  name: string
  users: SnippetUsers<Note, Snippet>
  onOpen: (doc: DocumentRef) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [peek, setPeek] = useState<Peek | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const peekId = useId()
  const items: UserItem[] = [
    ...users.notes.map((note) => ({ doc: { kind: 'note', id: note.id } as DocumentRef, label: noteTitle(note.body), body: note.body })),
    ...users.snippets.map((snippet) => ({
      doc: { kind: 'snippet', id: snippet.id } as DocumentRef,
      label: `@${snippet.name}`,
      body: snippet.body,
    })),
  ]
  const hidden = showAll ? 0 : Math.max(0, items.length - USERS_SHOWN)

  function hidePeek() {
    window.clearTimeout(timer.current)
    setPeek(null)
  }

  function showPeek(item: UserItem, target: HTMLElement, delay: number) {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPeek({ item, anchor: target.getBoundingClientRect() }), delay)
  }

  // The card is positioned against the link, so any scroll would leave it behind.
  useEffect(() => {
    if (!peek) return
    window.addEventListener('scroll', hidePeek, true)
    window.addEventListener('resize', hidePeek)
    return () => {
      window.removeEventListener('scroll', hidePeek, true)
      window.removeEventListener('resize', hidePeek)
    }
  }, [peek])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <>
      <ul className="used-in" aria-label="Used in">
        {items.slice(0, items.length - hidden).map((item) => (
          <li key={item.doc.id}>
            <button
              className={`used-in-item is-${item.doc.kind}`}
              onClick={() => {
                hidePeek()
                onOpen(item.doc)
              }}
              onPointerEnter={(event) => event.pointerType === 'mouse' && showPeek(item, event.currentTarget, PEEK_DELAY)}
              onPointerLeave={hidePeek}
              onFocus={(event) => event.currentTarget.matches(':focus-visible') && showPeek(item, event.currentTarget, 0)}
              onBlur={hidePeek}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || !peek) return
                event.stopPropagation()
                hidePeek()
              }}
              aria-describedby={peek?.item.doc.id === item.doc.id ? peekId : undefined}
            >
              <Icon name={item.doc.kind === 'note' ? 'note' : 'at'} size={14} />
              <span>{item.label}</span>
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
      {peek && <UserPeek peek={peek} name={name} id={peekId} />}
    </>
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
      {!parentName && uses && <UsedIn key={snippet.id} name={snippet.name} users={users} onOpen={onOpen} />}
    </header>
  )
}
