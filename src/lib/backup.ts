import type { Note, Snippet } from './db'
import { isValidSnippetName } from './snippets'

export const BACKUP_FORMAT = 'zenpad-backup'
export const BACKUP_VERSION = 1

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: number
  notes: Note[]
  snippets: Snippet[]
}

export class BackupError extends Error {}

export function createBackup(notes: Note[], snippets: Snippet[], now = Date.now()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, notes, snippets }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasDocumentFields(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === 'string' &&
    typeof value.body === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  )
}

function toNote(value: unknown, index: number): Note {
  if (!isRecord(value) || !hasDocumentFields(value)) {
    throw new BackupError(`Note #${index + 1} is malformed.`)
  }
  const { id, body, createdAt, updatedAt } = value as unknown as Note
  return value.favorite === true ? { id, body, createdAt, updatedAt, favorite: true } : { id, body, createdAt, updatedAt }
}

function toSnippet(value: unknown, index: number): Snippet {
  if (!isRecord(value) || !hasDocumentFields(value) || typeof value.name !== 'string') {
    throw new BackupError(`Snippet #${index + 1} is malformed.`)
  }
  const { id, name, body, createdAt, updatedAt } = value as unknown as Snippet
  if (!isValidSnippetName(name)) throw new BackupError(`Snippet name "@${name}" is not valid.`)
  return { id, name, body, createdAt, updatedAt }
}

export function parseBackup(json: string): Backup {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new BackupError('This file is not valid JSON.')
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) {
    throw new BackupError('This file is not a Zenpad backup.')
  }
  if (parsed.version !== BACKUP_VERSION) {
    throw new BackupError(`Unsupported backup version: ${String(parsed.version)}.`)
  }
  if (!Array.isArray(parsed.notes) || !Array.isArray(parsed.snippets)) {
    throw new BackupError('This backup is missing its notes or snippets.')
  }
  return createBackup(
    parsed.notes.map(toNote),
    parsed.snippets.map(toSnippet),
    typeof parsed.exportedAt === 'number' ? parsed.exportedAt : Date.now(),
  )
}

export interface MergePlan {
  notes: Note[]
  snippets: Snippet[]
  replacedSnippetIds: string[]
}

// Newer edits win. Notes match by id, snippets match by name since names are unique.
export function planMerge(current: { notes: Note[]; snippets: Snippet[] }, incoming: Backup): MergePlan {
  const notesById = new Map(current.notes.map((note) => [note.id, note]))
  const notes = incoming.notes.filter((note) => {
    const existing = notesById.get(note.id)
    return !existing || note.updatedAt > existing.updatedAt
  })

  const snippetsByName = new Map(current.snippets.map((snippet) => [snippet.name, snippet]))
  const snippets: Snippet[] = []
  const replacedSnippetIds: string[] = []
  for (const snippet of incoming.snippets) {
    const existing = snippetsByName.get(snippet.name)
    if (existing && snippet.updatedAt <= existing.updatedAt) continue
    if (existing && existing.id !== snippet.id) replacedSnippetIds.push(existing.id)
    snippets.push(snippet)
  }

  return { notes, snippets, replacedSnippetIds }
}
