import { describe, expect, it } from 'vitest'
import { buildSampleLibrary } from './sampleData'
import { isValidSnippetName, referencedSnippetNames } from './snippets'

describe('buildSampleLibrary', () => {
  const now = Date.UTC(2026, 0, 1)
  const library = buildSampleLibrary(now)

  it('gives every note and snippet a unique id', () => {
    const ids = [...library.notes, ...library.snippets].map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses valid, unique snippet names', () => {
    const names = library.snippets.map((snippet) => snippet.name)
    expect(names.every(isValidSnippetName)).toBe(true)
    expect(new Set(names).size).toBe(names.length)
  })

  it('dates everything in the past', () => {
    for (const item of [...library.notes, ...library.snippets]) {
      expect(item.updatedAt).toBeLessThan(now)
      expect(item.createdAt).toBe(item.updatedAt)
    }
  })

  it('only leaves the one deliberately missing reference dangling', () => {
    const names = new Set(library.snippets.map((snippet) => snippet.name))
    const referenced = [...library.notes, ...library.snippets].flatMap((item) => referencedSnippetNames(item.body))
    expect([...new Set(referenced.filter((name) => !names.has(name)))]).toEqual(['not-written-yet'])
  })
})
