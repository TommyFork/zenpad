import { useCallback, useRef, useState } from 'react'
import type { EditorDocument } from '../editor/Editor'
import { db, type Note, type Snippet } from '../lib/db'
import {
  createNote,
  createSnippet,
  deleteBlankNotes,
  deleteNote,
  deleteSnippet,
  isSnippetNameTaken,
  renameSnippet,
  restoreNote,
  restoreSnippet,
  uniqueSnippetName,
} from '../lib/library'
import { readLastOpened, writeLastOpened } from '../lib/settings'
import { describeExpansion, expandSnippets, isValidSnippetName, toSnippetName } from '../lib/snippets'
import { documentKey, isSameDocument, parseDocumentKey, type DocumentRef } from './documents'
import { useAutosave } from './useAutosave'
import type { ShowToast } from './useToast'

const NEW_SNIPPET_NAME = 'snippet'

interface OpenOptions {
  reload?: boolean
  focusName?: boolean
}

interface Library {
  notes: Note[]
  snippets: Snippet[]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadBody(doc: DocumentRef): Promise<string | undefined> {
  const record = doc.kind === 'note' ? await db.notes.get(doc.id) : await db.snippets.get(doc.id)
  return record?.body
}

export function useWorkspace({ notes, snippets }: Library, showToast: ShowToast) {
  const [openDoc, setOpenDoc] = useState<DocumentRef | null>(null)
  const [editorDocument, setEditorDocument] = useState<EditorDocument | null>(null)
  const [returnToCandidate, setReturnTo] = useState<DocumentRef | null>(null)
  const [text, setText] = useState('')
  const [focusNameFor, setFocusNameFor] = useState<string | null>(null)
  const openDocRef = useRef<DocumentRef | null>(null)
  const returnTo = notes.some((note) => note.id === returnToCandidate?.id) ? returnToCandidate : null
  const textRef = useRef('')
  const creating = useRef(false)

  const autosave = useAutosave((error) => showToast(`Couldn't save: ${errorMessage(error)}`))
  const { flush, schedule } = autosave

  const openDocument = useCallback(
    async (next: DocumentRef, { reload = false, focusName = false }: OpenOptions = {}) => {
      await flush()
      const leaving = openDocRef.current
      const switching = !isSameDocument(leaving, next)
      if (switching && leaving?.kind === 'note' && textRef.current.trim() === '') await deleteNote(leaving.id)

      const body = await loadBody(next)
      if (body === undefined) {
        showToast(`That ${next.kind} no longer exists.`)
        return
      }
      if (switching) setReturnTo(leaving?.kind === 'note' && next.kind === 'snippet' ? leaving : null)
      openDocRef.current = next
      textRef.current = body
      setOpenDoc(next)
      setText(body)
      setFocusNameFor(focusName ? next.id : null)
      setEditorDocument({ key: documentKey(next), text: body, reload, focus: !focusName })
      writeLastOpened(documentKey(next))
    },
    [flush, showToast],
  )

  const handleChange = useCallback(
    (body: string) => {
      const doc = openDocRef.current
      if (!doc) return
      textRef.current = body
      setText(body)
      schedule(doc, body)
    },
    [schedule],
  )

  // Ignores repeat requests while one is in flight, so a double click can't create two documents.
  async function createOnce(create: () => Promise<void>) {
    if (creating.current) return
    creating.current = true
    try {
      await create()
    } finally {
      creating.current = false
    }
  }

  function newNote() {
    return createOnce(async () => {
      const leaving = openDocRef.current
      if (leaving?.kind === 'note' && textRef.current.trim() === '') {
        showToast('You already have a blank note open.')
        return
      }
      const note = await createNote()
      await openDocument({ kind: 'note', id: note.id })
    })
  }

  function newSnippet() {
    return createOnce(async () => {
      const snippet = await createSnippet(await uniqueSnippetName(NEW_SNIPPET_NAME))
      await openDocument({ kind: 'snippet', id: snippet.id }, { focusName: true })
    })
  }

  async function openSnippetByName(name: string) {
    await flush()
    const existing = await db.snippets.where('name').equals(name).first()
    const snippet = existing ?? (await createSnippet(name))
    await openDocument({ kind: 'snippet', id: snippet.id })
    if (!existing) showToast(`Created @${name}. Write it here and it fills in wherever you use it.`)
  }

  // Creates the snippet without leaving the note, so writing isn't interrupted.
  async function createSnippetInBackground(name: string) {
    if (await isSnippetNameTaken(name)) return
    const snippet = await createSnippet(name)
    showToast(`Created @${name}. Fill it in whenever you're ready.`, {
      label: 'Open',
      run: () => void openDocument({ kind: 'snippet', id: snippet.id }),
    })
  }

  async function openMostRecentNote(except?: string) {
    const recent = (await db.notes.orderBy('updatedAt').reverse().toArray()).find((note) => note.id !== except)
    const note = recent ?? (await createNote())
    await openDocument({ kind: 'note', id: note.id })
  }

  async function deleteCurrent() {
    const doc = openDocRef.current
    if (!doc) return
    await flush()
    if (doc.kind === 'note') {
      const note = await deleteNote(doc.id)
      await openMostRecentNote(doc.id)
      if (!note || note.body.trim() === '') return
      showToast('Note deleted.', {
        label: 'Undo',
        run: () => void restoreNote(note).then(() => openDocument({ kind: 'note', id: note.id })),
      })
      return
    }
    const snippet = await deleteSnippet(doc.id)
    if (returnTo) await openDocument(returnTo)
    else await openMostRecentNote()
    if (!snippet) return
    showToast(`Deleted @${snippet.name}.`, {
      label: 'Undo',
      run: () => void restoreSnippet(snippet).then(() => openDocument({ kind: 'snippet', id: snippet.id })),
    })
  }

  // Returns the name that ended up saved, so the name field can show it.
  async function renameOpenSnippet(requested: string): Promise<string> {
    const doc = openDocRef.current
    const snippet = snippets.find((candidate) => candidate.id === doc?.id)
    if (!doc || doc.kind !== 'snippet' || !snippet) return requested
    const name = toSnippetName(requested)
    if (name === snippet.name) return name
    if (!isValidSnippetName(name)) {
      showToast('Snippet names use lowercase letters, numbers, dashes, and underscores.')
      return snippet.name
    }
    if (await isSnippetNameTaken(name, snippet.id)) {
      showToast(`@${name} already exists.`)
      return snippet.name
    }
    setFocusNameFor(null)
    await flush()
    await renameSnippet(snippet.id, snippet.name, name)
    await openDocument(doc, { reload: true })
    return name
  }

  async function copyCurrent() {
    const doc = openDocRef.current
    if (!doc) return
    const bodies = new Map(snippets.map((snippet) => [snippet.name, snippet.body]))
    const openSnippet = doc.kind === 'snippet' ? snippets.find((snippet) => snippet.id === doc.id) : undefined
    if (openSnippet) bodies.set(openSnippet.name, textRef.current)

    const source = textRef.current
    if (source.trim() === '') {
      showToast('Nothing to copy yet.')
      return
    }
    try {
      await navigator.clipboard.writeText(expandSnippets(source, bodies))
    } catch (error) {
      showToast(`Couldn't copy: ${errorMessage(error)}`)
      return
    }
    showToast(describeExpansion(source, bodies))
  }

  async function openInitialDocument() {
    await deleteBlankNotes()
    const lastOpened = parseDocumentKey(readLastOpened() ?? '')
    if (lastOpened && (await loadBody(lastOpened)) !== undefined) {
      await openDocument(lastOpened)
      return
    }
    await openMostRecentNote()
  }

  const openDocRecord =
    openDoc?.kind === 'note'
      ? notes.find((note) => note.id === openDoc.id)
      : snippets.find((snippet) => snippet.id === openDoc?.id)

  return {
    openDoc,
    openDocRecord,
    editorDocument,
    returnTo,
    text,
    focusNameFor,
    saveStatus: autosave.status,
    flush,
    openDocument,
    openInitialDocument,
    handleChange,
    newNote,
    newSnippet,
    openSnippetByName,
    createSnippetInBackground,
    deleteCurrent,
    renameOpenSnippet,
    copyCurrent,
  }
}
