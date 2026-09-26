import { db, type Note, type Snippet } from './db'
import { createBackup, parseBackup, planMerge, type Backup } from './backup'
import { renameSnippetReferences } from './snippets'
import { WELCOME_NOTE, WELCOME_SNIPPETS } from './welcome'

export async function createNote(body = ''): Promise<Note> {
  const now = Date.now()
  const note: Note = { id: crypto.randomUUID(), body, createdAt: now, updatedAt: now }
  await db.notes.add(note)
  return note
}

export async function saveNoteBody(id: string, body: string): Promise<void> {
  await db.notes.update(id, { body, updatedAt: Date.now() })
}

// Favoriting leaves updatedAt alone so the note keeps its place in the list.
export async function setNoteFavorite(id: string, favorite: boolean): Promise<void> {
  await db.notes.update(id, { favorite })
}

export async function saveSnippetBody(id: string, body: string): Promise<void> {
  await db.snippets.update(id, { body, updatedAt: Date.now() })
}

export async function createSnippet(name: string, body = ''): Promise<Snippet> {
  const now = Date.now()
  const snippet: Snippet = { id: crypto.randomUUID(), name, body, createdAt: now, updatedAt: now }
  await db.snippets.add(snippet)
  return snippet
}

export async function isSnippetNameTaken(name: string, exceptId?: string): Promise<boolean> {
  const existing = await db.snippets.where('name').equals(name).first()
  return existing !== undefined && existing.id !== exceptId
}

export async function uniqueSnippetName(base: string): Promise<string> {
  let candidate = base
  for (let suffix = 2; await isSnippetNameTaken(candidate); suffix++) {
    candidate = `${base}-${suffix}`
  }
  return candidate
}

// Renaming rewrites every @reference so notes keep pointing at the same snippet.
export async function renameSnippet(id: string, from: string, to: string): Promise<void> {
  await db.transaction('rw', db.notes, db.snippets, async () => {
    await db.snippets.update(id, { name: to, updatedAt: Date.now() })
    await db.notes.toCollection().modify((note) => {
      note.body = renameSnippetReferences(note.body, from, to)
    })
    await db.snippets.toCollection().modify((snippet) => {
      snippet.body = renameSnippetReferences(snippet.body, from, to)
    })
  })
}

export async function deleteNote(id: string): Promise<Note | undefined> {
  const note = await db.notes.get(id)
  await db.notes.delete(id)
  return note
}

export async function deleteBlankNotes(): Promise<void> {
  await db.notes.filter((note) => note.body.trim() === '').delete()
}

export async function deleteSnippet(id: string): Promise<Snippet | undefined> {
  const snippet = await db.snippets.get(id)
  await db.snippets.delete(id)
  return snippet
}

export async function restoreNote(note: Note): Promise<void> {
  await db.notes.put(note)
}

export async function restoreSnippet(snippet: Snippet): Promise<void> {
  await db.snippets.put(snippet)
}

export async function exportLibrary(): Promise<Backup> {
  const [notes, snippets] = await Promise.all([db.notes.toArray(), db.snippets.toArray()])
  return createBackup(notes, snippets)
}

export interface ImportResult {
  notes: number
  snippets: number
}

export async function importLibrary(json: string): Promise<ImportResult> {
  const incoming = parseBackup(json)
  return db.transaction('rw', db.notes, db.snippets, async () => {
    const [notes, snippets] = await Promise.all([db.notes.toArray(), db.snippets.toArray()])
    const plan = planMerge({ notes, snippets }, incoming)
    await db.snippets.bulkDelete(plan.replacedSnippetIds)
    await db.notes.bulkPut(plan.notes)
    await db.snippets.bulkPut(plan.snippets)
    return { notes: plan.notes.length, snippets: plan.snippets.length }
  })
}

const SEEDED_KEY = 'seeded'

// Seeds a welcome note on the very first launch only, so clearing the library stays cleared.
export async function seedOnFirstLaunch(): Promise<void> {
  await db.transaction('rw', db.notes, db.snippets, db.meta, async () => {
    if (await db.meta.get(SEEDED_KEY)) return
    await db.meta.put({ key: SEEDED_KEY, value: new Date().toISOString() })
    for (const snippet of WELCOME_SNIPPETS) await createSnippet(snippet.name, snippet.body)
    await createNote(WELCOME_NOTE)
  })
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
