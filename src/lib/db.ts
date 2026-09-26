import Dexie, { type EntityTable } from 'dexie'

export interface Note {
  id: string
  body: string
  createdAt: number
  updatedAt: number
  favorite?: boolean
}

export interface Snippet {
  id: string
  name: string
  body: string
  createdAt: number
  updatedAt: number
}

export interface MetaEntry {
  key: string
  value: string
}

export const db = new Dexie('zenpad') as Dexie & {
  notes: EntityTable<Note, 'id'>
  snippets: EntityTable<Snippet, 'id'>
  meta: EntityTable<MetaEntry, 'key'>
}

db.version(1).stores({
  notes: 'id, updatedAt',
  snippets: 'id, &name, updatedAt',
  meta: 'key',
})
