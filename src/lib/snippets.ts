const NAME = '[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?'

// "@" not preceded by a word character, so emails like me@site.com are ignored.
const TOKEN_SOURCE = `(?<![\\w@])@(${NAME})`

export function snippetTokenPattern(): RegExp {
  return new RegExp(TOKEN_SOURCE, 'g')
}

export function isValidSnippetName(name: string): boolean {
  return new RegExp(`^${NAME}$`).test(name)
}

export function toSnippetName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^[_-]+|[_-]+$/g, '')
}

export function expandSnippets(
  text: string,
  bodies: ReadonlyMap<string, string>,
  trail: readonly string[] = [],
): string {
  return text.replace(snippetTokenPattern(), (token, name: string) => {
    const body = bodies.get(name)
    if (body === undefined || trail.includes(name)) return token
    return expandSnippets(body, bodies, [...trail, name])
  })
}

export type ExpansionPart =
  | { kind: 'text'; text: string }
  | { kind: 'snippet'; name: string; parts: ExpansionPart[] }
  // A reference left as written: no snippet has this name, or expanding it would loop.
  | { kind: 'unresolved'; name: string; reason: 'missing' | 'loop' }

// The same expansion as expandSnippets, but keeping track of which text came from which snippet.
export function expandSnippetParts(
  text: string,
  bodies: ReadonlyMap<string, string>,
  trail: readonly string[] = [],
): ExpansionPart[] {
  const parts: ExpansionPart[] = []
  let last = 0
  for (const match of text.matchAll(snippetTokenPattern())) {
    const name = match[1]
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) })
    const body = bodies.get(name)
    if (body === undefined) parts.push({ kind: 'unresolved', name, reason: 'missing' })
    else if (trail.includes(name)) parts.push({ kind: 'unresolved', name, reason: 'loop' })
    else parts.push({ kind: 'snippet', name, parts: expandSnippetParts(body, bodies, [...trail, name]) })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}

export function referencedSnippetNames(text: string): string[] {
  const names = [...text.matchAll(snippetTokenPattern())].map((match) => match[1])
  return [...new Set(names)]
}

export function renameSnippetReferences(text: string, from: string, to: string): string {
  return text.replace(snippetTokenPattern(), (token, name: string) => (name === from ? `@${to}` : token))
}

function listNames(names: string[]): string {
  const tokens = names.map((name) => `@${name}`)
  return tokens.length <= 2 ? tokens.join(' and ') : `${tokens.slice(0, -1).join(', ')}, and ${tokens.at(-1)}`
}

// A short, human summary of what copying this text will do with its snippets.
export function describeExpansion(text: string, bodies: ReadonlyMap<string, string>): string {
  const names = referencedSnippetNames(text)
  const missing = names.filter((name) => !bodies.has(name))
  const empty = names.filter((name) => bodies.get(name)?.trim() === '')
  const filled = names.length - missing.length - empty.length

  const parts = [filled > 0 ? `Copied with ${filled} ${filled === 1 ? 'snippet' : 'snippets'} filled in.` : 'Copied.']
  if (empty.length > 0) parts.push(`${listNames(empty)} ${empty.length === 1 ? 'is' : 'are'} empty.`)
  if (missing.length > 0) parts.push(`${listNames(missing)} ${missing.length === 1 ? "isn't a snippet" : "aren't snippets"} yet.`)
  return parts.join(' ')
}

export type SnippetSort = 'name' | 'references' | 'edited'

// How many notes and other snippets mention each snippet. A document that mentions a snippet twice counts once.
export function countSnippetReferences(
  notes: readonly { body: string }[],
  snippets: readonly { name: string; body: string }[],
): Map<string, number> {
  const counts = new Map<string, number>()
  const tally = (body: string, self?: string) => {
    for (const name of referencedSnippetNames(body)) {
      if (name !== self) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  for (const note of notes) tally(note.body)
  for (const snippet of snippets) tally(snippet.body, snippet.name)
  return counts
}

// Returns a sorted copy. Ties fall back to name order so the list never shuffles.
export function sortSnippets<T extends { name: string; updatedAt: number }>(
  snippets: readonly T[],
  sort: SnippetSort,
  referenceCounts: ReadonlyMap<string, number>,
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name)
  const sorted = [...snippets]
  if (sort === 'references') {
    return sorted.sort((a, b) => (referenceCounts.get(b.name) ?? 0) - (referenceCounts.get(a.name) ?? 0) || byName(a, b))
  }
  if (sort === 'edited') return sorted.sort((a, b) => b.updatedAt - a.updatedAt || byName(a, b))
  return sorted.sort(byName)
}
