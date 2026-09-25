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
