// A comment is a line that starts with "//", like in code. It stays in the note but is never copied.
// Only whole lines count, so URLs like https://site.com and text such as "a // b" are left alone.
const COMMENT = /^[ \t]*\/\//
// Fenced code is copied as written, so code that has its own // comments survives.
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/

export function isCommentLine(line: string): boolean {
  return COMMENT.test(line)
}

// Which lines are comments, skipping lines inside fenced code.
export function commentLines(lines: readonly string[]): boolean[] {
  let fence: string | null = null
  return lines.map((line) => {
    const marker = FENCE.exec(line)?.[1]
    if (marker && (fence === null || (marker[0] === fence[0] && marker.length >= fence.length))) {
      fence = fence === null ? marker : null
      return false
    }
    return fence === null && isCommentLine(line)
  })
}

export function hasComments(text: string): boolean {
  return commentLines(text.split('\n')).includes(true)
}

// Removes comment lines. A blank line that only separated a comment from the text around it goes too,
// so the copy doesn't pick up gaps where the comments were.
export function stripComments(text: string): string {
  const lines = text.split('\n')
  const marks = commentLines(lines)
  if (!marks.includes(true)) return text
  const kept: string[] = []
  let removed = false
  for (const [index, line] of lines.entries()) {
    if (marks[index]) {
      removed = true
      continue
    }
    const blank = line.trim() === ''
    if (removed && blank && (kept.length === 0 || kept.at(-1)?.trim() === '')) continue
    if (!blank) removed = false
    kept.push(line)
  }
  while (removed && kept.length > 0 && kept.at(-1)?.trim() === '') kept.pop()
  return kept.join('\n')
}

export function stripSnippetComments(bodies: ReadonlyMap<string, string>): Map<string, string> {
  return new Map([...bodies].map(([name, body]) => [name, stripComments(body)]))
}

export interface CommentToggle {
  from: number
  to: number
  insert: string
}

// Comments out the lines a selection touches, or uncomments them when every non-blank one is already a comment.
export function toggleCommentLines(text: string, from: number, to: number): CommentToggle {
  const start = text.lastIndexOf('\n', from - 1) + 1
  // A selection that ends at the start of a line doesn't take that line.
  const last = to > from && text.charAt(to - 1) === '\n' ? to - 1 : to
  const lineEnd = text.indexOf('\n', last)
  const end = lineEnd === -1 ? text.length : lineEnd
  const lines = text.slice(start, end).split('\n')
  const filled = lines.filter((line) => line.trim() !== '')
  const uncomment = filled.length > 0 && filled.every(isCommentLine)
  const next = lines.map((line) => {
    if (uncomment) return line.replace(/^([ \t]*)\/\/ ?/, '$1')
    if (filled.length > 0 && line.trim() === '') return line
    return line.replace(/^([ \t]*)/, '$1// ')
  })
  return { from: start, to: end, insert: next.join('\n') }
}
