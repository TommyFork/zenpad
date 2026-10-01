import { describeExpansion, expandSnippetParts, expandSnippets, type ExpansionPart } from './snippets'

// Names start with a letter, so prices like $5 are left alone. Case matters: $PR and $pr are different.
const NAME = '[A-Za-z](?:[A-Za-z0-9_-]*[A-Za-z0-9])?'

// A definition line sets a value on a line of its own: "$branch = fix/login-redirect".
const DEFINITION_SOURCE = `^[ \\t]*\\$(${NAME})[ \\t]*=[ \\t]*(.*?)[ \\t]*$`

// "$branch" uses a value, and "$branch{fix/login}" sets it inline and shows it in place.
// "$" not preceded by a word character, "$", or a backslash, so "a$b", "$$x", and "\$x" are left alone.
const TOKEN_SOURCE = `(?<![\\w$\\\\])\\$(${NAME})(?:\\{([^}\\n]*)\\})?`

export function variableTokenPattern(): RegExp {
  return new RegExp(TOKEN_SOURCE, 'g')
}

export interface VariableToken {
  name: string
  // Offsets within the line: the whole token, and the end of "$name".
  from: number
  to: number
  nameTo: number
  // Set when the token defines the variable inline: "$name{value}".
  inline?: { value: string; from: number; to: number }
}

export function variableTokens(line: string): VariableToken[] {
  return [...line.matchAll(variableTokenPattern())].map((match) => {
    const [token, name, value] = match
    const nameTo = match.index + name.length + 1
    const inline = value === undefined ? undefined : { value, from: nameTo + 1, to: nameTo + 1 + value.length }
    return { name, from: match.index, to: match.index + token.length, nameTo, inline }
  })
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

// A block holds a longer value over several lines, between '$context = """' and a line of just '"""'.
const BLOCK_OPEN_SOURCE = `^[ \\t]*\\$(${NAME})[ \\t]*=[ \\t]*"""[ \\t]*$`
const BLOCK_CLOSE = /^[ \t]*"""[ \t]*$/

export interface VariableBlock {
  name: string
  value: string
  // Indexes of the opening and closing lines.
  open: number
  close: number
}

// An opening line with no closing line after it isn't a block, so text below it is never swallowed.
export function parseBlocks(lines: readonly string[]): VariableBlock[] {
  const blocks: VariableBlock[] = []
  const openPattern = new RegExp(BLOCK_OPEN_SOURCE)
  for (let open = 0; open < lines.length; open++) {
    const name = openPattern.exec(lines[open])?.[1]
    if (!name) continue
    const close = lines.findIndex((line, index) => index > open && BLOCK_CLOSE.test(line))
    if (close === -1) break
    blocks.push({ name, value: lines.slice(open + 1, close).join('\n'), open, close })
    open = close
  }
  return blocks
}

// Which lines set variables rather than being part of the note: definition lines and whole blocks.
export function definitionLines(lines: readonly string[]): boolean[] {
  const marks = lines.map(isVariableDefinition)
  for (const { open, close } of parseBlocks(lines)) marks.fill(true, open, close + 1)
  return marks
}

export interface BlockWrap {
  name: string
  // Where the block goes: the start of the line the selection starts on.
  at: number
  block: string
  // What replaces the selection.
  reference: string
  // Where the name sits once both are in, in the new text: in the opening line, then in the reference.
  nameRanges: [{ from: number; to: number }, { from: number; to: number }]
}

// After "$name", a name character would lengthen the name, and "{" would make it an inline definition.
const NAME_CHAR_AFTER = /[A-Za-z0-9_{-]/
const NAME_CHAR_BEFORE = /[\w$\\]/

// Moves the selected text into a block above it and leaves "$name" in its place, so the note copies the same.
// Returns null when moving the text would change what it means: blank text, text holding definitions,
// or a line of just """ that would end the block early.
export function wrapInBlock(text: string, from: number, to: number, baseName = 'context'): BlockWrap | null {
  const selected = text.slice(from, to)
  if (selected.trim() === '') return null
  const value = selected.endsWith('\n') ? selected.slice(0, -1) : selected
  if (value.split('\n').some((line) => BLOCK_CLOSE.test(line))) return null

  const lines = text.split('\n')
  const first = text.slice(0, from).split('\n').length - 1
  const last = first + value.split('\n').length - 1
  if (definitionLines(lines).slice(first, last + 1).includes(true)) return null

  const taken = parseVariables(text)
  let name = baseName
  for (let count = 2; taken.has(name); count++) name = `${baseName}-${count}`

  // Spaces keep "$name" from running into the text around it.
  const before = NAME_CHAR_BEFORE.test(text.charAt(from - 1)) ? ' ' : ''
  const lineBreak = selected.endsWith('\n') ? '\n' : ''
  const after = !lineBreak && NAME_CHAR_AFTER.test(text.charAt(to)) ? ' ' : ''
  const at = text.slice(0, from).lastIndexOf('\n') + 1
  const block = `$${name} = """\n${value}\n"""\n`
  const reference = `${before}$${name}${after}${lineBreak}`
  const referenceName = from + block.length + before.length + 1
  return {
    name,
    at,
    block,
    reference,
    nameRanges: [
      { from: at + 1, to: at + 1 + name.length },
      { from: referenceName, to: referenceName + name.length },
    ],
  }
}

// The raw values written in the text, from definition lines, blocks, and inline definitions.
// When a name is set twice, the first one in the text wins.
export function parseVariables(text: string): Map<string, string> {
  const values = new Map<string, string>()
  const define = (name: string, value: string) => {
    if (!values.has(name)) values.set(name, value)
  }
  const lines = text.split('\n')
  const blocks = new Map(parseBlocks(lines).map((block) => [block.open, block]))
  for (let index = 0; index < lines.length; index++) {
    const block = blocks.get(index)
    if (block) {
      define(block.name, block.value)
      index = block.close
      continue
    }
    const definition = parseDefinitionLine(lines[index])
    if (definition) define(definition.name, definition.value)
    else for (const token of variableTokens(lines[index])) if (token.inline) define(token.name, token.inline.value)
  }
  return values
}

// Fills in the variables and snippets each value uses. A variable that would use itself stays as written.
export function resolveVariables(
  raw: ReadonlyMap<string, string>,
  bodies: ReadonlyMap<string, string> = new Map(),
): Map<string, string> {
  const resolve = (name: string, trail: readonly string[]): string =>
    expandSnippets(raw.get(name) ?? '', bodies).replace(variableTokenPattern(), (token, other: string) =>
      raw.has(other) && !trail.includes(other) ? resolve(other, [...trail, other]) : token,
    )
  return new Map([...raw.keys()].map((name) => [name, resolve(name, [name])]))
}

// Definition lines and blocks are settings for the note, not part of it, so they are left out of what gets copied.
// Inline definitions stay, and are filled in like any other use.
// A blank line that only separated the definitions from the rest goes with them.
export function stripVariableDefinitions(text: string): string {
  const lines = text.split('\n')
  const marks = definitionLines(lines)
  if (!marks.includes(true)) return text
  const kept = lines.filter((_, index) => !marks[index])
  const firstContent = lines.findIndex((line, index) => !marks[index] && line.trim() !== '')
  const head = firstContent === -1 ? marks : marks.slice(0, firstContent)
  if (head.includes(true)) while (kept.length > 0 && kept[0].trim() === '') kept.shift()
  return kept.join('\n')
}

export function substituteVariables(text: string, values: ReadonlyMap<string, string>): string {
  return text.replace(variableTokenPattern(), (token, name: string) => values.get(name) ?? token)
}

// Inline definitions become plain uses before snippets are filled in, so a snippet named in a value can't
// split the definition apart. The marker keeps "$pr{1}-fix" from reading as "$pr-fix", and is dropped at the end.
const USE_END = '\u0000'

function prepare(text: string): string {
  return stripVariableDefinitions(text).replace(variableTokenPattern(), (token, name: string, value?: string) =>
    value === undefined ? token : `$${name}${USE_END}`,
  )
}

// The note exactly as it would be copied: definition lines removed, snippets expanded, variables filled in.
// Snippet text can use the note's variables too, so one snippet can serve many notes.
export function fillIn(text: string, bodies: ReadonlyMap<string, string>): string {
  const values = resolveVariables(parseVariables(text), bodies)
  return substituteVariables(expandSnippets(prepare(text), bodies), values).replaceAll(USE_END, '')
}

function substituteParts(parts: ExpansionPart[], values: ReadonlyMap<string, string>): ExpansionPart[] {
  return parts.flatMap((part): ExpansionPart[] => {
    if (part.kind === 'snippet') return [{ ...part, parts: substituteParts(part.parts, values) }]
    if (part.kind !== 'text') return [part]
    const split: ExpansionPart[] = []
    const pushText = (text: string) => {
      const clean = text.replaceAll(USE_END, '')
      if (clean) split.push({ kind: 'text', text: clean })
    }
    let last = 0
    for (const match of part.text.matchAll(variableTokenPattern())) {
      const value = values.get(match[1])
      if (value === undefined) continue
      pushText(part.text.slice(last, match.index))
      split.push({ kind: 'variable', name: match[1], text: value })
      last = match.index + match[0].length
    }
    pushText(part.text.slice(last))
    return split
  })
}

// The same as fillIn, but keeping track of which text came from which snippet or variable.
export function fillInParts(text: string, bodies: ReadonlyMap<string, string>): ExpansionPart[] {
  const values = resolveVariables(parseVariables(text), bodies)
  return substituteParts(expandSnippetParts(prepare(text), bodies), values)
}

// The variables the copied text actually uses, including ones used only inside snippets.
export function usedVariableNames(text: string, bodies: ReadonlyMap<string, string>): string[] {
  const defined = parseVariables(text)
  const expanded = expandSnippets(prepare(text), bodies)
  const names = [...expanded.matchAll(variableTokenPattern())].map((match) => match[1]).filter((name) => defined.has(name))
  return [...new Set(names)]
}

export function describeFillIn(text: string, bodies: ReadonlyMap<string, string>): string {
  return describeExpansion(stripVariableDefinitions(text), bodies, usedVariableNames(text, bodies).length)
}
