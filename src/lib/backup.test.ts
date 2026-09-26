import { describe, expect, it } from 'vitest'
import { BackupError, createBackup, parseBackup, planMerge } from './backup'
import type { Note, Snippet } from './db'

function note(id: string, updatedAt: number): Note {
  return { id, body: `note ${id}`, createdAt: 0, updatedAt }
}

function snippet(id: string, name: string, updatedAt: number): Snippet {
  return { id, name, body: `snippet ${name}`, createdAt: 0, updatedAt }
}

describe('parseBackup', () => {
  it('round-trips an exported backup', () => {
    const backup = createBackup([note('n1', 1)], [snippet('s1', 'tone', 1)], 42)
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup)
  })

  it('keeps favorites', () => {
    const backup = createBackup([{ ...note('n1', 1), favorite: true }, note('n2', 1)], [], 42)
    expect(parseBackup(JSON.stringify(backup)).notes).toEqual(backup.notes)
  })

  it('rejects files that are not JSON', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError)
  })

  it('rejects JSON that is not a Zenpad backup', () => {
    expect(() => parseBackup('{"notes": []}')).toThrow('not a Zenpad backup')
  })

  it('rejects malformed records', () => {
    const backup = { ...createBackup([], []), notes: [{ id: 1 }] }
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('Note #1 is malformed')
  })

  it('rejects invalid snippet names', () => {
    const backup = createBackup([], [snippet('s1', 'Bad Name', 1)])
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('not valid')
  })
})

describe('planMerge', () => {
  it('keeps the newer version of each note', () => {
    const current = { notes: [note('a', 5), note('b', 5)], snippets: [] }
    const incoming = createBackup([note('a', 9), note('b', 1), note('c', 1)], [])
    expect(planMerge(current, incoming).notes.map((n) => n.id)).toEqual(['a', 'c'])
  })

  it('matches snippets by name and replaces the older one', () => {
    const current = { notes: [], snippets: [snippet('old', 'tone', 1), snippet('keep', 'voice', 9)] }
    const incoming = createBackup([], [snippet('new', 'tone', 5), snippet('other', 'voice', 2)])
    const plan = planMerge(current, incoming)
    expect(plan.snippets.map((s) => s.id)).toEqual(['new'])
    expect(plan.replacedSnippetIds).toEqual(['old'])
  })
})
