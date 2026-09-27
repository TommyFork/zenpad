import { isVariableDefinition, parseVariables, resolveVariables, substituteVariables } from './variables'

const TITLE_LENGTH = 80
const PREVIEW_LENGTH = 120

function meaningfulLines(body: string): string[] {
  // Variable definitions usually sit at the top of a note, but they aren't what it's about.
  const values = resolveVariables(parseVariables(body))
  return body
    .split('\n')
    .filter((line) => !isVariableDefinition(line))
    .map((line) => substituteVariables(line, values))
    .map((line) => line.replace(/^\s*(#{1,6}\s+|[-*>]\s+)/, '').trim())
    .filter((line) => line.length > 0)
}

export function noteTitle(body: string): string {
  const [first] = meaningfulLines(body)
  return first ? first.slice(0, TITLE_LENGTH) : 'Untitled'
}

export function notePreview(body: string): string {
  return meaningfulLines(body).slice(1).join(' ').slice(0, PREVIEW_LENGTH)
}

export function countWords(text: string): number {
  return text.match(/\S+/g)?.length ?? 0
}

// Rough rule of thumb for English text with modern LLM tokenizers.
const CHARS_PER_TOKEN = 4

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}
