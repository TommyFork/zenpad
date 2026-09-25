import { describe, expect, it } from 'vitest'
import { countWords, estimateTokens, notePreview, noteTitle } from './notes'

describe('noteTitle', () => {
  it('uses the first non-empty line without markdown markers', () => {
    expect(noteTitle('\n\n# Refactor plan\nsteps')).toBe('Refactor plan')
  })

  it('falls back to Untitled for empty notes', () => {
    expect(noteTitle('   \n ')).toBe('Untitled')
  })
})

describe('notePreview', () => {
  it('joins the lines after the title', () => {
    expect(notePreview('Title\n- first\n\nsecond')).toBe('first second')
  })
})

describe('counts', () => {
  it('counts words across whitespace', () => {
    expect(countWords('  one two\nthree ')).toBe(3)
    expect(countWords('')).toBe(0)
  })

  it('estimates tokens from length', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })
})
