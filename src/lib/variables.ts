import { describeExpansion, expandSnippetParts, expandSnippets, type ExpansionPart } from './snippets'

// Variable names follow the snippet rules, but must start with a letter so prices like $5 are left alone.
const NAME = '[a-z](?:[a-z0-9_-]*[a-z0-9])?'

// A definition is a line of its own: "$branch = fix/login-redirect".
const DEFINITION_SOURCE = `^[ \\t]*\\$(${NAME})[ \\t]*=[ \\t]*(.*?)[ \\t]*$`

// "$" not preceded by a word character, "$", or a backslash, so "a$b", "$$x", and "\$x" are left alone.
const REFERENCE_SOURCE = `(?<![\\w$\\\\])\\$(${NAME})`

export function variableReferencePattern(): RegExp {
  return new RegExp(REFERENCE_SOURCE, 'g')
}

export interface VariableDefinition {
  name: string
  value: string
  // Offsets within the line the definition was read from.
  nameFrom: number
  nameTo: number
  valueFrom: number
  valueTo: number
}

export function parseDefinitionLine(line: string): VariableDefinition | null {
  const match = new RegExp(DEFINITION_SOURCE).exec(line)
  if (!match) return null
  const [, name, value] = match
  const nameFrom = line.indexOf('$')
  const valueTo = line.trimEnd().length
  return { name, value, nameFrom, nameTo: nameFrom + name.length + 1, valueFrom: valueTo - value.length, valueTo }
}

export function isVariableDefinition(line: string): boolean {
  return parseDefinitionLine(line) !== null
}

// The raw values written in the text. When a name is set twice, the first one wins.
export function parseVariables(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of text.split('\n')) {
    const definition = parseDefinitionLine(line)
    if (definition && !values.has(definition.name)) values.set(definition.name, definition.value)
  }
  return values
}

// Fills in the variables and snippets each value uses. A variable that would use itself stays as written.
export function resolveVariables(
  raw: ReadonlyMap<string, string>,
  bodies: ReadonlyMap<string, string> = new Map(),
): Map<string, string> {
  const resolve = (name: string, trail: readonly string[]): string =>
    expandSnippets(raw.get(name) ?? '', bodies).replace(variableReferencePattern(), (token, other: string) =>
      raw.has(other) && !trail.includes(other) ? resolve(other, [...trail, other]) : token,
    )
  return new Map([...raw.keys()].map((name) => [name, resolve(name, [name])]))
}

// Definitions are settings for the note, not part of it, so they are left out of what gets copied.
// A blank line that only separated the definitions from the rest goes with them.
export function stripVariableDefinitions(text: string): string {
  const lines = text.split('\n')
  const kept = lines.filter((line) => !isVariableDefinition(line))
  if (kept.length === lines.length) return text
  const firstContent = lines.findIndex((line) => !isVariableDefinition(line) && line.trim() !== '')
  const head = firstContent === -1 ? lines : lines.slice(0, firstContent)
  if (head.some(isVariableDefinition)) while (kept.length > 0 && kept[0].trim() === '') kept.shift()
  return kept.join('\n')
}

export function substituteVariables(text: string, values: ReadonlyMap<string, string>): string {
  return text.replace(variableReferencePattern(), (token, name: string) => values.get(name) ?? token)
}

// The note exactly as it would be copied: definitions removed, snippets expanded, variables filled in.
// Snippet text can use the note's variables too, so one snippet can serve many notes.
export function fillIn(text: string, bodies: ReadonlyMap<string, string>): string {
  const values = resolveVariables(parseVariables(text), bodies)
  return substituteVariables(expandSnippets(stripVariableDefinitions(text), bodies), values)
}

function substituteParts(parts: ExpansionPart[], values: ReadonlyMap<string, string>): ExpansionPart[] {
  return parts.flatMap((part): ExpansionPart[] => {
    if (part.kind === 'snippet') return [{ ...part, parts: substituteParts(part.parts, values) }]
    if (part.kind !== 'text') return [part]
    const split: ExpansionPart[] = []
    let last = 0
    for (const match of part.text.matchAll(variableReferencePattern())) {
      const value = values.get(match[1])
      if (value === undefined) continue
      if (match.index > last) split.push({ kind: 'text', text: part.text.slice(last, match.index) })
      split.push({ kind: 'variable', name: match[1], text: value })
      last = match.index + match[0].length
    }
    if (last < part.text.length) split.push({ kind: 'text', text: part.text.slice(last) })
    return split
  })
}

// The same as fillIn, but keeping track of which text came from which snippet or variable.
export function fillInParts(text: string, bodies: ReadonlyMap<string, string>): ExpansionPart[] {
  const values = resolveVariables(parseVariables(text), bodies)
  return substituteParts(expandSnippetParts(stripVariableDefinitions(text), bodies), values)
}

// The variables the copied text actually uses, including ones used only inside snippets.
export function usedVariableNames(text: string, bodies: ReadonlyMap<string, string>): string[] {
  const defined = parseVariables(text)
  const expanded = expandSnippets(stripVariableDefinitions(text), bodies)
  const names = [...expanded.matchAll(variableReferencePattern())].map((match) => match[1]).filter((name) => defined.has(name))
  return [...new Set(names)]
}

export function describeFillIn(text: string, bodies: ReadonlyMap<string, string>): string {
  return describeExpansion(stripVariableDefinitions(text), bodies, usedVariableNames(text, bodies).length)
}
