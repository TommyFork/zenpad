import { describe, expect, it } from 'vitest'
import { noteTitle } from './notes'
import type { ExpansionPart } from './snippets'
import {
  describeFillIn,
  fillIn,
  fillInParts,
  parseDefinitionLine,
  parseVariables,
  resolveVariables,
  stripVariableDefinitions,
  usedVariableNames,
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
    expect(parseDefinitionLine('$Upper = no')).toBeNull()
    expect(parseDefinitionLine('$5 = no')).toBeNull()
  })
})

describe('parseVariables', () => {
  it('keeps the first definition of a name', () => {
    expect(parseVariables('$a = one\n$a = two')).toEqual(new Map([['a', 'one']]))
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
    for (const text of [note, 'plain', '$a = 1\n$a$a @missing', '$x = @tone\n$x']) {
      expect(flatten(fillInParts(text, bodies))).toBe(fillIn(text, bodies))
    }
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
})
