import { describe, expect, it } from 'vitest'
import { buildSampleLibrary } from './sampleData'
import { isValidSnippetName, referencedSnippetNames } from './snippets'
import { fillIn, parseBlocks } from './variables'

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

  it('includes folded blocks that fill in where they sit', () => {
    const bodies = new Map(library.snippets.map((snippet) => [snippet.name, snippet.body]))
    const plan = library.notes.find((note) => note.body.includes('# Plan the sync feature'))!
    expect(parseBlocks(plan.body.split('\n')).map((block) => block.name)).toEqual(['background', 'questions'])
    const copied = fillIn(plan.body, bodies)
    expect(copied.split('## 8. Rollout')).toHaveLength(2)
    expect(copied).toContain('Which parts of zenpad need to change first?')
    expect(copied.startsWith('# Plan the sync feature\n\nYou are a senior')).toBe(true)
    expect(copied).not.toContain('"""')
  })

  it('keeps the folded block edge cases behaving as described', () => {
    const edges = library.notes.find((note) => note.body.startsWith('# Folded block edge cases'))!
    const first = '  The first block named $first wins.\n  $inside = not a definition, just text in the block'
    expect(fillIn(edges.body, new Map())).toBe(
      '# Folded block edge cases\n\n' +
        `${first}\n${first}\nIndented quotes still open and close a block.\n\n` +
        `Uses: ${first} / Indented quotes still open and close a block. / $inside\n\n` +
        'This block never closes, so it stays visible, and """ fills in as the quotes.',
    )
  })
})
