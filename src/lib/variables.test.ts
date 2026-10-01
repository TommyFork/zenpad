import { describe, expect, it } from 'vitest'
import { noteTitle } from './notes'
import { flattenExpansion, type ExpansionPart } from './snippets'
import {
  describeFillIn,
  fillIn,
  fillInParts,
  parseBlocks,
  parseDefinitionLine,
  parseVariables,
  resolveVariables,
  stripVariableDefinitions,
  variableTokens,
  usedVariableNames,
  wrapInBlock,
} from './variables'

const bodies = new Map([
  ['review', 'Review PR $pr on branch $branch.'],
  ['tone', 'Be concise.'],
])

const note = `$pr = 482
$branch = fix/login-redirect

# PR $pr

Checkout: git switch $branch
@review`

describe('parseDefinitionLine', () => {
  it('reads the name, the value, and where each sits', () => {
    const line = '  $branch =  fix/login  '
    const definition = parseDefinitionLine(line)
    expect(definition).toMatchObject({ name: 'branch', value: 'fix/login' })
    expect(line.slice(definition!.nameFrom, definition!.nameTo)).toBe('$branch')
    expect(line.slice(definition!.valueFrom, definition!.valueTo)).toBe('fix/login')
  })

  it('allows an empty value', () => {
    expect(parseDefinitionLine('$pr =')).toMatchObject({ name: 'pr', value: '' })
  })

  it('ignores lines that only mention a variable', () => {
    expect(parseDefinitionLine('Price: $5 = cheap')).toBeNull()
    expect(parseDefinitionLine('if $x == 1')).toBeNull()
    expect(parseDefinitionLine('$5 = no')).toBeNull()
  })
})

describe('parseVariables', () => {
  it('keeps the first definition of a name', () => {
    expect(parseVariables('$a = one\n$a = two')).toEqual(new Map([['a', 'one']]))
  })

  it('reads inline definitions in the order they appear', () => {
    expect(parseVariables('On $branch{fix/login}, PR $PR{482}.\n$branch = later')).toEqual(
      new Map([
        ['branch', 'fix/login'],
        ['PR', '482'],
      ]),
    )
  })

  it('treats names with different case as different variables', () => {
    expect(parseVariables('$PR = 1\n$pr = 2\n$prUrl = 3')).toEqual(
      new Map([
        ['PR', '1'],
        ['pr', '2'],
        ['prUrl', '3'],
      ]),
    )
  })
})

const blockNote = `$context = """
The repo is $repo.
@tone

It has tests.
"""
$repo = zenpad

Use this context:
$context`

describe('parseBlocks', () => {
  it('reads the lines between the opening and closing quotes', () => {
    expect(parseBlocks(blockNote.split('\n'))).toEqual([
      { name: 'context', value: 'The repo is $repo.\n@tone\n\nIt has tests.', open: 0, close: 5 },
    ])
  })

  it('allows indented quotes and an empty block', () => {
    expect(parseBlocks(['  $a =  """  ', '  """'])).toEqual([{ name: 'a', value: '', open: 0, close: 1 }])
  })

  it('ignores an opening line that is never closed', () => {
    expect(parseBlocks(['$a = """', 'text', 'more'])).toEqual([])
  })

  it('ends a block at the first closing line', () => {
    expect(parseBlocks(['$a = """', 'one', '"""', 'two', '"""'])).toEqual([{ name: 'a', value: 'one', open: 0, close: 2 }])
  })
})

describe('wrapInBlock', () => {
  function apply(text: string, from: number, to: number, baseName?: string) {
    const wrap = wrapInBlock(text, from, to, baseName)
    if (!wrap) return null
    const next = text.slice(0, wrap.from) + wrap.insert + text.slice(wrap.to)
    return { wrap, next, name: next.slice(wrap.nameRange.from, wrap.nameRange.to) }
  }

  it('folds whole lines into a block in place and copies the same', () => {
    const text = 'Intro\nLong context\nmore context\nOutro'
    const result = apply(text, text.indexOf('Long'), text.indexOf('Outro'))!
    expect(result.next).toBe('Intro\n$context = """\nLong context\nmore context\n"""\nOutro')
    expect(result.name).toBe('context')
    expect(fillIn(result.next, bodies)).toBe(fillIn(text, bodies))
  })

  it('takes the whole line when only part of it is selected', () => {
    const text = 'Use this: big context here.\nNext'
    const result = apply(text, 10, 26)!
    expect(result.next).toBe('$context = """\nUse this: big context here.\n"""\nNext')
    expect(fillIn(result.next, bodies)).toBe(text)
  })

  it('keeps snippets and variables filling in the same', () => {
    const text = '$pr = 7\nSee PR $pr.\n@tone\nDone'
    const result = apply(text, text.indexOf('See'), text.indexOf('Done'))!
    expect(fillIn(result.next, bodies)).toBe(fillIn(text, bodies))
  })

  it('picks a name the note does not use yet', () => {
    const text = '$context = x\n$context-2 = y\nmore'
    expect(apply(text, text.indexOf('more'), text.length)!.wrap.name).toBe('context-3')
  })

  it('refuses blank text, definitions, closing quotes, and inline definitions', () => {
    expect(wrapInBlock('a\n  \nb', 2, 4)).toBeNull()
    expect(wrapInBlock('$a = 1\ntext', 0, 11)).toBeNull()
    expect(wrapInBlock('$a = """\nin\n"""\nout', 9, 11)).toBeNull()
    expect(wrapInBlock('one\n"""\ntwo', 0, 11)).toBeNull()
    expect(wrapInBlock('On $b{main} today', 0, 5)).toBeNull()
  })
})

describe('variableTokens', () => {
  it('finds uses and inline definitions with their ranges', () => {
    const line = 'Use $a and $B{x y}.'
    const [use, inline] = variableTokens(line)
    expect(use).toMatchObject({ name: 'a', inline: undefined })
    expect(line.slice(inline.from, inline.to)).toBe('$B{x y}')
    expect(line.slice(inline.from, inline.nameTo)).toBe('$B')
    expect(line.slice(inline.inline!.from, inline.inline!.to)).toBe('x y')
  })

  it('leaves shell-style ${NAME} alone', () => {
    expect(variableTokens('echo ${HOME}')).toEqual([])
  })
})

describe('parseVariables with blocks', () => {
  it('reads a block as one value and skips definitions written inside it', () => {
    expect(parseVariables('$a = """\n$b = inside\n"""\n$b = outside')).toEqual(
      new Map([
        ['a', '$b = inside'],
        ['b', 'outside'],
      ]),
    )
  })
})

describe('resolveVariables', () => {
  it('fills in variables that use other variables', () => {
    const raw = parseVariables('$pr = 482\n$url = https://github.com/me/repo/pull/$pr')
    expect(resolveVariables(raw).get('url')).toBe('https://github.com/me/repo/pull/482')
  })

  it('fills in snippets used in a value', () => {
    expect(resolveVariables(new Map([['style', '@tone']]), bodies).get('style')).toBe('Be concise.')
  })

  it('stops at a loop instead of looping forever', () => {
    const resolved = resolveVariables(parseVariables('$a = x $b\n$b = y $a'))
    expect(resolved.get('a')).toBe('x y $a')
  })
})

describe('stripVariableDefinitions', () => {
  it('drops definitions and the blank line after a leading block', () => {
    expect(stripVariableDefinitions('$a = 1\n$b = 2\n\nHello')).toBe('Hello')
  })

  it('keeps blank lines that separate other text', () => {
    expect(stripVariableDefinitions('One\n\n$a = 1\nTwo')).toBe('One\n\nTwo')
  })

  it('leaves a use of the name where each block sits', () => {
    expect(stripVariableDefinitions('$a = """\none\n\ntwo\n"""\n\nHello\n$b = """\nx\n"""\nBye')).toBe('$a\n\nHello\n$b\nBye')
  })

  it('returns text without definitions unchanged', () => {
    expect(stripVariableDefinitions('No vars $here\n\n')).toBe('No vars $here\n\n')
  })
})

describe('fillIn', () => {
  it('fills in variables in the note and in the snippets it uses', () => {
    expect(fillIn(note, bodies)).toBe('# PR 482\n\nCheckout: git switch fix/login-redirect\nReview PR 482 on branch fix/login-redirect.')
  })

  it('leaves unknown variables, prices, and escaped dollars alone', () => {
    expect(fillIn('$a = 1\nCosts $5, uses $HOME and $b, \\$a, a$a', bodies)).toBe('Costs $5, uses $HOME and $b, \\$a, a$a')
  })

  it('fills in an inline definition in place, and every other use', () => {
    expect(fillIn('Working on $branch{fix/login} today. Rebase $branch first.', bodies)).toBe(
      'Working on fix/login today. Rebase fix/login first.',
    )
  })

  it('keeps an inline definition whole when its value names a snippet or is followed by name characters', () => {
    expect(fillIn('$style{@tone}-ish and $style', bodies)).toBe('Be concise.-ish and Be concise.')
  })

  it('fills in capitalized names', () => {
    expect(fillIn('$PR = 482\nPR $PR, not $pr', bodies)).toBe('PR 482, not $pr')
  })

  it('fills in a block where it sits and where it is used again, with its variables and snippets', () => {
    const context = 'The repo is zenpad.\nBe concise.\n\nIt has tests.'
    expect(fillIn(blockNote, bodies)).toBe(`${context}\n\nUse this context:\n${context}`)
  })

  it('matches the longest name', () => {
    expect(fillIn('$pr = 1\n$pr-url = u\n$pr-url and $pr-', bodies)).toBe('u and 1-')
  })
})

describe('fillInParts', () => {
  function flatten(parts: ExpansionPart[]): string {
    return parts
      .map((part) => (part.kind === 'snippet' ? flatten(part.parts) : part.kind === 'unresolved' ? `@${part.name}` : part.text))
      .join('')
  }

  it('produces the same text as fillIn', () => {
    for (const text of [note, blockNote, 'plain', '$a = 1\n$a$a @missing', '$x = @tone\n$x', 'On $b{x}-y, $b @review $c{@tone}']) {
      expect(flatten(fillInParts(text, bodies))).toBe(fillIn(text, bodies))
    }
  })

  it('keeps the range each variable filled when flattened for the preview', () => {
    const { text, spans } = flattenExpansion(fillInParts('$pr = 7\n\nPR $pr', bodies))
    expect(text).toBe(fillIn('$pr = 7\n\nPR $pr', bodies))
    expect(spans).toEqual([{ from: 3, to: 4, name: 'pr', kind: 'variable' }])
  })

  it('marks filled-in variables, including inside snippets', () => {
    const parts = fillInParts('$pr = 7\n$branch = main\n\n@review', bodies)
    expect(parts).toEqual([
      {
        kind: 'snippet',
        name: 'review',
        parts: [
          { kind: 'text', text: 'Review PR ' },
          { kind: 'variable', name: 'pr', text: '7' },
          { kind: 'text', text: ' on branch ' },
          { kind: 'variable', name: 'branch', text: 'main' },
          { kind: 'text', text: '.' },
        ],
      },
    ])
  })
})

describe('describeFillIn', () => {
  it('counts the variables used, not just defined', () => {
    expect(usedVariableNames('$a = 1\n$b = 2\n$a @review', bodies)).toEqual(['a'])
    expect(describeFillIn(note, bodies)).toBe('Copied with 1 snippet and 2 variables filled in.')
  })
})

describe('noteTitle', () => {
  it('skips variable definitions and fills in the rest', () => {
    expect(noteTitle(note)).toBe('PR 482')
  })

  it('skips blocks', () => {
    expect(noteTitle(blockNote)).toBe('Use this context:')
  })
})
