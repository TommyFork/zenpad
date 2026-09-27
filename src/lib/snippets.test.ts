import { describe, expect, it } from 'vitest'
import {
  buildSnippetTree,
  countSnippetReferences,
  describeExpansion,
  describeUses,
  extractToSnippet,
  flattenExpansion,
  expandSnippetParts,
  expandSnippets,
  type ExpansionPart,
  isValidSnippetName,
  referencedSnippetNames,
  renameSnippetReferences,
  snippetAncestors,
  snippetParents,
  snippetUsers,
  type SnippetNode,
  sortSnippets,
  suggestSnippetName,
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

describe('flattenExpansion', () => {
  const withEmpty = new Map([...bodies, ['blank', '']])

  it('produces the same text as expandSnippets', () => {
    for (const text of ['Hi. @tone', '@context', 'Ask @nobody', '@loop-a', 'a @blank b']) {
      expect(flattenExpansion(expandSnippetParts(text, withEmpty)).text).toBe(expandSnippets(text, withEmpty))
    }
  })

  it('records where each snippet was filled in, outer before inner', () => {
    expect(flattenExpansion(expandSnippetParts('Go: @context @blank @nobody', withEmpty))).toEqual({
      text: 'Go: Repo: zenpad. Be concise.  @nobody',
      spans: [
        { from: 4, to: 29, name: 'context', kind: 'snippet' },
        { from: 18, to: 29, name: 'tone', kind: 'snippet' },
        { from: 30, to: 30, name: 'blank', kind: 'empty' },
        { from: 31, to: 38, name: 'nobody', kind: 'unresolved' },
      ],
    })
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

describe('countSnippetReferences', () => {
  const notes = [{ body: '@tone and @tone again, plus @context' }, { body: 'Just @tone' }, { body: 'No snippets' }]
  const snippets = [
    { name: 'tone', body: 'Be concise. @tone' },
    { name: 'context', body: 'Repo: zenpad. @tone' },
  ]

  it('counts each note and snippet that mentions a snippet once', () => {
    const counts = countSnippetReferences(notes, snippets)
    expect(counts.get('tone')).toBe(3)
    expect(counts.get('context')).toBe(1)
  })

  it('ignores a snippet mentioning itself', () => {
    expect(countSnippetReferences([], snippets).get('tone')).toBe(1)
  })

  it('leaves unmentioned snippets out', () => {
    expect(countSnippetReferences([{ body: '@tone' }], []).has('context')).toBe(false)
  })
})

describe('sortSnippets', () => {
  const snippets = [
    { name: 'beta', updatedAt: 300 },
    { name: 'alpha', updatedAt: 100 },
    { name: 'gamma', updatedAt: 200 },
    { name: 'delta', updatedAt: 200 },
  ]
  const counts = new Map([
    ['gamma', 5],
    ['alpha', 2],
    ['delta', 2],
  ])
  const names = (list: { name: string }[]) => list.map((snippet) => snippet.name)

  it('sorts by name', () => {
    expect(names(sortSnippets(snippets, 'name', counts))).toEqual(['alpha', 'beta', 'delta', 'gamma'])
  })

  it('sorts by most referenced, breaking ties by name', () => {
    expect(names(sortSnippets(snippets, 'references', counts))).toEqual(['gamma', 'alpha', 'delta', 'beta'])
  })

  it('sorts by last edited, breaking ties by name', () => {
    expect(names(sortSnippets(snippets, 'edited', counts))).toEqual(['beta', 'delta', 'gamma', 'alpha'])
  })

  it('does not change the original list', () => {
    sortSnippets(snippets, 'name', counts)
    expect(names(snippets)).toEqual(['beta', 'alpha', 'gamma', 'delta'])
  })
})

describe('snippetParents', () => {
  const email = { name: 'email', body: '@greeting\n\n@signoff' }
  const greeting = { name: 'greeting', body: 'Hi @first-name,' }
  const firstName = { name: 'first-name', body: 'Sam' }
  const signoff = { name: 'signoff', body: 'Thanks' }

  it('nests a snippet used only by one other snippet', () => {
    const parents = snippetParents([{ body: '@email' }], [email, greeting, firstName, signoff])
    expect(Object.fromEntries(parents)).toEqual({ greeting: 'email', signoff: 'email', 'first-name': 'greeting' })
  })

  it('keeps a snippet at the top level once a note uses it', () => {
    const parents = snippetParents([{ body: '@email' }, { body: '@signoff' }], [email, greeting, firstName, signoff])
    expect(parents.has('signoff')).toBe(false)
  })

  it('keeps a snippet shared by two snippets at the top level', () => {
    const letter = { name: 'letter', body: 'Dear team. @signoff' }
    expect(snippetParents([], [email, letter, signoff]).has('signoff')).toBe(false)
  })

  it('ignores references to snippets that do not exist', () => {
    expect(snippetParents([], [{ name: 'a', body: '@ghost' }]).size).toBe(0)
  })

  it('lifts one snippet out of a loop so the loop stays reachable', () => {
    const parents = snippetParents([], [
      { name: 'loop-b', body: '@loop-a' },
      { name: 'loop-a', body: '@loop-b' },
    ])
    expect(Object.fromEntries(parents)).toEqual({ 'loop-b': 'loop-a' })
  })
})

describe('buildSnippetTree', () => {
  const snippets = [
    { name: 'email', updatedAt: 1 },
    { name: 'signoff', updatedAt: 2 },
    { name: 'greeting', updatedAt: 3 },
    { name: 'notes', updatedAt: 4 },
  ]
  const parents = new Map([
    ['signoff', 'email'],
    ['greeting', 'email'],
  ])
  const shape = (nodes: SnippetNode<{ name: string }>[]): unknown =>
    nodes.map((node) => (node.children.length ? { [node.snippet.name]: shape(node.children) } : node.snippet.name))

  it('nests children under their parent and sorts each level', () => {
    expect(shape(buildSnippetTree(snippets, parents, 'name', new Map()))).toEqual([{ email: ['greeting', 'signoff'] }, 'notes'])
    expect(shape(buildSnippetTree(snippets, parents, 'edited', new Map()))).toEqual(['notes', { email: ['greeting', 'signoff'] }])
  })
})

describe('snippetAncestors', () => {
  it('lists parents from innermost outwards', () => {
    const parents = new Map([
      ['first-name', 'greeting'],
      ['greeting', 'email'],
    ])
    expect(snippetAncestors('first-name', parents)).toEqual(['greeting', 'email'])
    expect(snippetAncestors('email', parents)).toEqual([])
  })
})

describe('suggestSnippetName', () => {
  it('uses the first few words', () => {
    expect(suggestSnippetName('Thanks so much for your time today.')).toBe('thanks-so-much-for')
  })

  it('falls back when the text has no usable characters', () => {
    expect(suggestSnippetName('!!! ???')).toBe('snippet')
  })

  it('keeps the name short', () => {
    expect(suggestSnippetName('Supercalifragilisticexpialidocious-and-more words').length).toBeLessThanOrEqual(32)
  })
})

describe('extractToSnippet', () => {
  it('keeps edge whitespace outside the snippet', () => {
    expect(extractToSnippet(' Best,\nSam\n', 'signoff', 'Thanks.', '')).toEqual({ body: 'Best,\nSam', insert: ' @signoff\n' })
  })

  it('adds a space when the reference would join a word before it', () => {
    expect(extractToSnippet('world', 'place', 'hello', '!').insert).toBe(' @place')
  })

  it('adds a space when the reference would absorb the text after it', () => {
    expect(extractToSnippet('hello', 'greeting', '', 'world').insert).toBe('@greeting ')
  })

  it('leaves punctuation next to the reference alone', () => {
    expect(extractToSnippet('Sam', 'name', '(', ').').insert).toBe('@name')
  })
})

describe('describeUses', () => {
  it('names notes and snippets that use a snippet', () => {
    expect(describeUses(2, 1)).toBe('2 notes and 1 snippet')
    expect(describeUses(1, 0)).toBe('1 note')
    expect(describeUses(0, 3)).toBe('3 snippets')
    expect(describeUses(0, 0)).toBe('')
  })
})

describe('snippetUsers', () => {
  const notes = [
    { id: 'n1', body: 'Uses @tone' },
    { id: 'n2', body: 'Nothing here' },
    { id: 'n3', body: '@tone and @tone again' },
  ]
  const snippets = [
    { name: 'tone', body: 'Mentions @tone itself' },
    { name: 'context', body: 'Repo. @tone' },
    { name: 'other', body: '@context' },
  ]

  it('finds the notes and snippets that mention a snippet directly', () => {
    const users = snippetUsers('tone', notes, snippets)
    expect(users.notes.map((note) => note.id)).toEqual(['n1', 'n3'])
    expect(users.snippets.map((snippet) => snippet.name)).toEqual(['context'])
  })

  it('finds nothing for a snippet no one uses', () => {
    expect(snippetUsers('other', notes, snippets)).toEqual({ notes: [], snippets: [] })
  })
})
