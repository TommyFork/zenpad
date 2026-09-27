import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, type Note, type Snippet } from '../lib/db'
import { countSnippetReferences, snippetParents } from '../lib/snippets'

const NO_NOTES: Note[] = []
const NO_SNIPPETS: Snippet[] = []

export function useLibrary() {
  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray())
  const snippets = useLiveQuery(() => db.snippets.orderBy('name').toArray())

  const snippetBodies = useMemo(
    () => new Map((snippets ?? NO_SNIPPETS).map((snippet) => [snippet.name, snippet.body])),
    [snippets],
  )
  const referenceCounts = useMemo(() => countSnippetReferences(notes ?? NO_NOTES, snippets ?? NO_SNIPPETS), [notes, snippets])
  const parents = useMemo(() => snippetParents(notes ?? NO_NOTES, snippets ?? NO_SNIPPETS), [notes, snippets])

  return {
    loaded: notes !== undefined && snippets !== undefined,
    notes: notes ?? NO_NOTES,
    snippets: snippets ?? NO_SNIPPETS,
    snippetBodies,
    referenceCounts,
    snippetParents: parents,
  }
}
