import { describe, expect, it } from 'vitest'
import { fold, matchItem, queryTerms, rankItems } from './search'

const item = (label: string, text = label) => ({ label, text })
const rank = (items: { label: string; text: string }[], query: string) =>
  rankItems(items, query, (entry) => entry).map(({ item }) => item.label)

describe('fold', () => {
  it('lowercases and strips accents without shifting indices', () => {
    expect(fold('Café Résumé')).toBe('cafe resume')
    expect(fold('Café').length).toBe('Café'.length)
  })
})

describe('rankItems', () => {
  it('orders by match quality rather than by type', () => {
    const items = [item('Weekly notes', 'Weekly notes about settings'), item('@settings-tone', 'settings-tone'), item('Settings')]
    expect(rank(items, 'settings')).toEqual(['Settings', '@settings-tone', 'Weekly notes'])
  })

  it('ranks prefix, then word start, then substring, then body text', () => {
    const items = [item('Notes', 'Notes on a plan'), item('Explanation'), item('Big plan'), item('Planning')]
    expect(rank(items, 'plan')).toEqual(['Planning', 'Big plan', 'Explanation', 'Notes'])
  })

  it('requires every term to match', () => {
    const items = [item('Export backup'), item('Import backup')]
    expect(rank(items, 'back exp')).toEqual(['Export backup'])
  })

  it('matches letters in order when there is no substring', () => {
    expect(rank([item('Meeting notes'), item('Toggle focus mode')], 'tfm')).toEqual(['Toggle focus mode'])
    expect(rank([item('Theme: Dark mode')], 'darkmode')).toEqual(['Theme: Dark mode'])
  })

  it('does not fuzzy match letters from the middle of words', () => {
    expect(rank([item('A note without a heading becomes the title')], 'meet')).toEqual([])
  })

  it('does not fuzzy match letters scattered through the body', () => {
    expect(rank([item('Groceries', 'milk, then tomatoes, garlic')], 'mtg')).toEqual([])
  })

  it('stays fast on repeated letters', () => {
    const label = Array(40).fill('a').join(' ')
    const start = performance.now()
    expect(rank([item(label)], 'aaaaaaaab')).toEqual([])
    expect(performance.now() - start).toBeLessThan(100)
  })

  it('accepts snippet names typed with or without @', () => {
    const items = [item('@greeting', 'greeting Hello'), item('Greeting card ideas')]
    expect(rank(items, '@greet')).toEqual(['@greeting'])
    expect(rank(items, 'greeting')).toEqual(['@greeting', 'Greeting card ideas'])
  })

  it('keeps the incoming order for ties', () => {
    expect(rank([item('Draft one'), item('Draft two')], 'draft')).toEqual(['Draft one', 'Draft two'])
  })

  it('prefers the label that matches the whole query', () => {
    const items = [item('Theme: Dark mode'), item('Dark')]
    expect(rank(items, 'dark')).toEqual(['Dark', 'Theme: Dark mode'])
  })

  it('ignores accents and case', () => {
    expect(rank([item('Café list')], 'CAFE')).toEqual(['Café list'])
  })
})

describe('matchItem', () => {
  it('reports label indices to highlight, offset past the @', () => {
    expect(matchItem('@sign-off', 'sign-off', queryTerms('off'))?.highlights).toEqual([6, 7, 8])
    expect(matchItem('Toggle focus mode', '', queryTerms('tfm'))?.highlights).toEqual([0, 7, 13])
  })

  it('returns null when nothing matches', () => {
    expect(matchItem('Settings', 'Settings', queryTerms('zebra'))).toBeNull()
  })
})
