export interface SearchMatch {
  score: number
  // Indices into the label of the characters that matched, for highlighting.
  highlights: number[]
}

// How much each kind of hit is worth. A label hit always beats a body hit, so a note titled
// "Ideas" ranks above a note that only mentions ideas somewhere in its text.
const EXACT_LABEL = 120
const LABEL_PREFIX = 80
const LABEL_WORD_START = 60
const LABEL_SUBSTRING = 40
const LABEL_FUZZY_MAX = 30
const LABEL_FUZZY_MIN = 16
const TEXT_WORD_START = 12
const TEXT_SUBSTRING = 6
const WHOLE_QUERY_PREFIX = 40

// Lowercase and drop accents one character at a time, so indices still line up with the original.
export function fold(value: string): string {
  let out = ''
  for (const char of value) {
    const folded = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    out += folded.length === char.length ? folded : char
  }
  return out
}

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true
  const before = text[index - 1]
  const here = text[index]
  if (!/[\p{L}\p{N}]/u.test(before)) return true
  // Letter/digit boundaries, as in "q3" or "v2"
  return /\p{N}/u.test(here) !== /\p{N}/u.test(before)
}

function wordStartIndex(text: string, term: string): number {
  let index = text.indexOf(term)
  while (index !== -1) {
    if (isWordStart(text, index)) return index
    index = text.indexOf(term, index + 1)
  }
  return -1
}

function range(start: number, length: number): number[] {
  return Array.from({ length }, (_, offset) => start + offset)
}

// Letters of the term in order, where each one starts a word or continues the previous match,
// e.g. "tfm" for "Toggle focus mode" or "darkmode" for "Theme: Dark mode". Letters scattered
// through the middle of words don't count, since those matches are mostly noise.
function fuzzyPath(label: string, term: string, at: number, previous: number, dead: Set<number>): number[] | null {
  if (at === term.length) return []
  // Remember dead ends so repeated letters can't make the search blow up.
  const key = at * (label.length + 1) + previous + 1
  if (dead.has(key)) return null
  const char = term[at]
  if (label[previous + 1] === char) {
    const rest = fuzzyPath(label, term, at + 1, previous + 1, dead)
    if (rest) return [previous + 1, ...rest]
  }
  for (let index = label.indexOf(char, previous + 1); index !== -1; index = label.indexOf(char, index + 1)) {
    if (!isWordStart(label, index)) continue
    const rest = fuzzyPath(label, term, at + 1, index, dead)
    if (rest) return [index, ...rest]
  }
  dead.add(key)
  return null
}

function fuzzy(label: string, term: string): SearchMatch | null {
  if (term.length < 2) return null
  const highlights = fuzzyPath(label, term, 0, -1, new Set())
  if (!highlights) return null
  // Fewer separate runs is a tighter match.
  const runs = highlights.filter((index, at) => at === 0 || index !== highlights[at - 1] + 1).length
  return { score: Math.max(LABEL_FUZZY_MAX - 2 * (runs - 1), LABEL_FUZZY_MIN), highlights }
}

function matchTerm(label: string, text: string, term: string): SearchMatch | null {
  if (label === term) return { score: EXACT_LABEL, highlights: range(0, term.length) }
  if (label.startsWith(term)) return { score: LABEL_PREFIX, highlights: range(0, term.length) }
  const wordStart = wordStartIndex(label, term)
  if (wordStart !== -1) return { score: LABEL_WORD_START, highlights: range(wordStart, term.length) }
  const substring = label.indexOf(term)
  if (substring !== -1) return { score: LABEL_SUBSTRING, highlights: range(substring, term.length) }
  const loose = fuzzy(label, term)
  if (loose) return loose
  if (wordStartIndex(text, term) !== -1) return { score: TEXT_WORD_START, highlights: [] }
  if (text.includes(term)) return { score: TEXT_SUBSTRING, highlights: [] }
  return null
}

export function queryTerms(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean)
}

// Scores one item against a query. Every term has to match somewhere; returns null if one doesn't.
export function matchItem(label: string, text: string, terms: string[]): SearchMatch | null {
  if (terms.length === 0) return null
  // Snippet labels start with @, and people may or may not type it.
  const offset = label.startsWith('@') ? 1 : 0
  const foldedLabel = fold(label.slice(offset))
  const foldedText = fold(text)
  const bare = terms.map((term, index) => (index === 0 && offset && term.startsWith('@') ? term.slice(1) : term)).filter(Boolean)
  if (bare.length === 0) return { score: LABEL_PREFIX, highlights: [] }

  let score = 0
  const highlights = new Set<number>()
  for (const term of bare) {
    const match = matchTerm(foldedLabel, foldedText, term)
    if (!match) return null
    score += match.score
    for (const index of match.highlights) highlights.add(index + offset)
  }

  const whole = bare.join(' ')
  if (bare.length > 1 && foldedLabel === whole) score += EXACT_LABEL
  else if (bare.length > 1 && foldedLabel.startsWith(whole)) score += WHOLE_QUERY_PREFIX
  // Among equal hits, the shorter label is the closer match.
  score += 1 / (foldedLabel.length + 1)
  return { score, highlights: [...highlights].sort((a, b) => a - b) }
}

// Ranks items by how well they match. Ties keep their incoming order (notes come most recent first).
export function rankItems<T>(items: T[], query: string, fields: (item: T) => { label: string; text: string }): { item: T; match: SearchMatch }[] {
  const terms = queryTerms(query)
  return items
    .map((item, index) => {
      const { label, text } = fields(item)
      return { item, index, match: matchItem(label, text, terms) }
    })
    .filter((entry): entry is { item: T; index: number; match: SearchMatch } => entry.match !== null)
    .sort((a, b) => b.match.score - a.match.score || a.index - b.index)
    .map(({ item, match }) => ({ item, match }))
}
