import { describe, expect, it } from 'vitest'
import {
  describeExpansion,
  expandSnippetParts,
  expandSnippets,
  type ExpansionPart,
  isValidSnippetName,
  referencedSnippetNames,
  renameSnippetReferences,
  toSnippetName,
} from './snippets'

const bodies = new Map([
  ['tone', 'Be concise.'],
  ['context', 'Repo: zenpad. @tone'],
  ['loop-a', 'A then @loop-b'],
  ['loop-b', 'B then @loop-a'],
])

describe('expandSnippets', () => {
  it('replaces a known snippet with its body', () => {
    expect(expandSnippets('Hi. @tone', bodies)).toBe('Hi. Be concise.')
  })

  it('expands snippets nested inside snippets', () => {
    expect(expandSnippets('@context', bodies)).toBe('Repo: zenpad. Be concise.')
  })

  it('leaves unknown snippets as written', () => {
    expect(expandSnippets('Ask @nobody', bodies)).toBe('Ask @nobody')
  })

  it('stops at a cycle instead of looping forever', () => {
    expect(expandSnippets('@loop-a', bodies)).toBe('A then B then @loop-a')
  })

  it('ignores email addresses', () => {
    expect(expandSnippets('mail me@tone.com', bodies)).toBe('mail me@tone.com')
  })

  it('does not include trailing punctuation in the name', () => {
    expect(expandSnippets('Use @tone.', bodies)).toBe('Use Be concise..')
    expect(expandSnippets('(@tone)', bodies)).toBe('(Be concise.)')
  })

  it('does not treat a trailing dash as part of the name', () => {
    expect(expandSnippets('@tone- next', bodies)).toBe('Be concise.- next')
  })
})

describe('expandSnippetParts', () => {
  function flatten(parts: ExpansionPart[]): string {
    return parts
      .map((part) => (part.kind === 'text' ? part.text : part.kind === 'snippet' ? flatten(part.parts) : `@${part.name}`))
      .join('')
  }

  it('produces the same text as expandSnippets', () => {
    for (const text of ['Hi. @tone', '@context', 'Ask @nobody', '@loop-a', 'mail me@tone.com', '(@tone) @tone-']) {
      expect(flatten(expandSnippetParts(text, bodies))).toBe(expandSnippets(text, bodies))
    }
  })

  it('nests snippets inside the snippets that use them', () => {
    expect(expandSnippetParts('Go: @context', bodies)).toEqual([
      { kind: 'text', text: 'Go: ' },
      {
        kind: 'snippet',
        name: 'context',
        parts: [
          { kind: 'text', text: 'Repo: zenpad. ' },
          { kind: 'snippet', name: 'tone', parts: [{ kind: 'text', text: 'Be concise.' }] },
        ],
      },
    ])
  })

  it('marks unknown snippets and loops as unresolved', () => {
    expect(expandSnippetParts('@nobody', bodies)).toEqual([{ kind: 'unresolved', name: 'nobody', reason: 'missing' }])
    const loop = expandSnippetParts('@loop-a', bodies)
    const inner = loop[0].kind === 'snippet' && loop[0].parts[1].kind === 'snippet' ? loop[0].parts[1].parts : []
    expect(inner.at(-1)).toEqual({ kind: 'unresolved', name: 'loop-a', reason: 'loop' })
  })
})

describe('snippet names', () => {
  it('accepts lowercase names with dashes and underscores inside', () => {
    expect(isValidSnippetName('repo-context_2')).toBe(true)
    expect(isValidSnippetName('-lead')).toBe(false)
    expect(isValidSnippetName('Upper')).toBe(false)
    expect(isValidSnippetName('')).toBe(false)
  })

  it('normalizes free text into a valid name', () => {
    expect(toSnippetName('  My Repo Context! ')).toBe('my-repo-context')
    expect(toSnippetName('@tone')).toBe('tone')
    expect(toSnippetName('---')).toBe('')
  })
})

describe('references', () => {
  it('lists each referenced name once', () => {
    expect(referencedSnippetNames('@a and @b and @a again')).toEqual(['a', 'b'])
  })

  it('renames only exact matches', () => {
    expect(renameSnippetReferences('@tone @tone-2 @tones me@tone', 'tone', 'voice')).toBe('@voice @tone-2 @tones me@tone')
  })
})

describe('describeExpansion', () => {
  const library = new Map([
    ['tone', 'Be concise.'],
    ['blank', ''],
    ['other', 'text'],
  ])

  it('counts filled snippets', () => {
    expect(describeExpansion('@tone @other', library)).toBe('Copied with 2 snippets filled in.')
  })

  it('says plainly when there are no snippets', () => {
    expect(describeExpansion('just text', library)).toBe('Copied.')
  })

  it('calls out empty and unknown snippets', () => {
    expect(describeExpansion('@tone @blank @nope @nada', library)).toBe(
      "Copied with 1 snippet filled in. @blank is empty. @nope and @nada aren't snippets yet.",
    )
  })
})
