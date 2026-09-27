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

// Keeps a name field to the characters a snippet name can use while the user types.
export function typedSnippetName(input: string): string {
  return input.toLowerCase().replace(/\s/g, '-').replace(/[^a-z0-9_-]/g, '')
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

// A snippet used only inside one other snippet, and by no notes, is a building block of that snippet.
// It nests under it in the sidebar. Once anything else uses it, it goes back to the top level.
export function snippetParents(
  notes: readonly { body: string }[],
  snippets: readonly { name: string; body: string }[],
): Map<string, string> {
  const usedByNote = new Set(notes.flatMap((note) => referencedSnippetNames(note.body)))
  const usedBy = new Map<string, string[]>()
  for (const snippet of snippets) {
    for (const name of referencedSnippetNames(snippet.body)) {
      if (name !== snippet.name) usedBy.set(name, [...(usedBy.get(name) ?? []), snippet.name])
    }
  }
  const exists = new Set(snippets.map((snippet) => snippet.name))
  const parents = new Map<string, string>()
  for (const [name, users] of usedBy) {
    if (exists.has(name) && users.length === 1 && !usedByNote.has(name)) parents.set(name, users[0])
  }

  // Snippets that only use each other form a loop with no way in from the top.
  // Lift one member of each loop to the top level, taking the first by name so the choice is stable.
  const reachable = new Set<string>()
  const children = new Map<string, string[]>()
  for (const [child, parent] of parents) children.set(parent, [...(children.get(parent) ?? []), child])
  const visit = (name: string) => {
    if (reachable.has(name)) return
    reachable.add(name)
    for (const child of children.get(name) ?? []) visit(child)
  }
  for (const name of [...exists].sort()) if (!parents.has(name)) visit(name)
  for (const name of [...exists].sort()) {
    if (reachable.has(name)) continue
    parents.delete(name)
    visit(name)
  }
  return parents
}

export interface SnippetNode<T> {
  snippet: T
  children: SnippetNode<T>[]
}

export function buildSnippetTree<T extends { name: string; updatedAt: number }>(
  snippets: readonly T[],
  parents: ReadonlyMap<string, string>,
  sort: SnippetSort,
  referenceCounts: ReadonlyMap<string, number>,
): SnippetNode<T>[] {
  const sorted = sortSnippets(snippets, sort, referenceCounts)
  const nodes = new Map(sorted.map((snippet) => [snippet.name, { snippet, children: [] as SnippetNode<T>[] }]))
  const roots: SnippetNode<T>[] = []
  for (const node of nodes.values()) {
    const parent = nodes.get(parents.get(node.snippet.name) ?? '')
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

// The names of the snippets a snippet is nested inside, innermost first.
export function snippetAncestors(name: string, parents: ReadonlyMap<string, string>): string[] {
  const ancestors: string[] = []
  for (let parent = parents.get(name); parent && !ancestors.includes(parent); parent = parents.get(parent)) {
    ancestors.push(parent)
  }
  return ancestors
}

const MAX_SUGGESTED_NAME_LENGTH = 32

// Suggests a name for a new snippet from the first few words of its text.
export function suggestSnippetName(text: string): string {
  const words = toSnippetName(text.replace(/@/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4).join(' '))
  const name = words.slice(0, MAX_SUGGESTED_NAME_LENGTH).replace(/[_-]+$/, '')
  return isValidSnippetName(name) ? name : 'snippet'
}

export interface Extraction {
  // The text the new snippet holds.
  body: string
  // What replaces the selection, so the reference still reads as a reference.
  insert: string
}

// Moves selected text into a snippet. Whitespace at the edges of the selection stays where it was,
// and a space is added where the reference would otherwise run into the surrounding text.
export function extractToSnippet(selected: string, name: string, before: string, after: string): Extraction {
  const lead = selected.match(/^\s*/)?.[0] ?? ''
  const trail = selected.slice(lead.length).match(/\s*$/)?.[0] ?? ''
  const body = selected.slice(lead.length, selected.length - trail.length)
  const spaceBefore = lead === '' && /[\w@]$/.test(before) ? ' ' : ''
  const spaceAfter = trail === '' && /^[a-z0-9_-]/.test(after) ? ' ' : ''
  return { body, insert: `${lead}${spaceBefore}@${name}${spaceAfter}${trail}` }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

// "2 notes and 1 snippet", or an empty string when nothing uses it.
export function describeUses(noteUses: number, snippetUses: number): string {
  const parts = [noteUses > 0 ? plural(noteUses, 'note') : '', snippetUses > 0 ? plural(snippetUses, 'snippet') : '']
  return parts.filter(Boolean).join(' and ')
}

export interface SnippetUsers<N, S> {
  notes: N[]
  snippets: S[]
}

// The notes and other snippets that mention a snippet directly, in the order they were given.
export function snippetUsers<N extends { body: string }, S extends { name: string; body: string }>(
  name: string,
  notes: readonly N[],
  snippets: readonly S[],
): SnippetUsers<N, S> {
  const uses = (body: string) => referencedSnippetNames(body).includes(name)
  return {
    notes: notes.filter((note) => uses(note.body)),
    snippets: snippets.filter((snippet) => snippet.name !== name && uses(snippet.body)),
  }
}
