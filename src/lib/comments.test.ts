import { describe, expect, it } from 'vitest'
import { commentLines, stripComments, toggleCommentLines } from './comments'
import { describeFillIn, fillIn, parseVariables } from './variables'

describe('commentLines', () => {
  it('marks whole lines that start with //', () => {
    expect(commentLines(['// todo', '  // indented', 'text // not a comment', 'https://site.com'])).toEqual([true, true, false, false])
  })

  it('leaves fenced code alone', () => {
    expect(commentLines(['```js', '// code comment', '```', '// note comment'])).toEqual([false, false, false, true])
    expect(commentLines(['~~~', '```', '// still code', '~~~', '// comment'])).toEqual([false, false, false, false, true])
  })
})

describe('stripComments', () => {
  it('returns text without comments unchanged', () => {
    expect(stripComments('a\n\n\nb\n')).toBe('a\n\n\nb\n')
  })

  it('removes comment lines', () => {
    expect(stripComments('one\n// skip me\ntwo')).toBe('one\ntwo')
  })

  it("doesn't leave gaps where comments were", () => {
    expect(stripComments('// header note\n\nBody')).toBe('Body')
    expect(stripComments('a\n\n// note\n\nb')).toBe('a\n\nb')
    expect(stripComments('a\n// note\n\nb')).toBe('a\n\nb')
    expect(stripComments('a\n\n// trailing note')).toBe('a')
  })

  it('keeps comments inside fenced code', () => {
    const text = '// gone\n```ts\n// kept\nconst a = 1\n```'
    expect(stripComments(text)).toBe('```ts\n// kept\nconst a = 1\n```')
  })
})

describe('toggleCommentLines', () => {
  it('comments out the lines a selection touches', () => {
    const text = 'one\ntwo\n\nthree'
    expect(toggleCommentLines(text, 1, text.length)).toEqual({ from: 0, to: text.length, insert: '// one\n// two\n\n// three' })
  })

  it('comments an empty line', () => {
    expect(toggleCommentLines('a\n\nb', 2, 2)).toEqual({ from: 2, to: 2, insert: '// ' })
  })

  it('uncomments when every line is a comment', () => {
    expect(toggleCommentLines('  // one\n//two', 0, 10).insert).toBe('  one\ntwo')
  })

  it('comments a blank first line', () => {
    expect(toggleCommentLines('\nfoo', 0, 0)).toEqual({ from: 0, to: 0, insert: '// ' })
  })

  it("toggles code's own comments inside fenced code", () => {
    const text = '```\n// code\n```'
    expect(toggleCommentLines(text, 4, 4)).toEqual({ from: 4, to: 11, insert: 'code' })
  })

  it('stops before a line the selection only reaches the start of', () => {
    expect(toggleCommentLines('one\ntwo', 0, 4)).toEqual({ from: 0, to: 3, insert: '// one' })
  })
})

describe('copying with comments', () => {
  it('leaves comments in notes and snippets out of the copy', () => {
    const bodies = new Map([['tone', '// keep this short\nBe brief.']])
    expect(fillIn('// draft for Sam\n\nHi @tone\n// remember to attach the file', bodies)).toBe('Hi Be brief.')
  })

  it('leaves comment lines out of a block value too', () => {
    expect(fillIn('$ctx = """\nkeep\n// drop\n"""', new Map())).toBe('keep')
  })

  it("ignores snippets and variables only a comment mentions", () => {
    const bodies = new Map([['tone', 'Be brief.']])
    expect(describeFillIn('Hello\n// maybe add @tone and $x', bodies)).toBe('Copied.')
    expect(parseVariables('// $x{1}\n$y = 2')).toEqual(new Map([['y', '2']]))
  })
})
