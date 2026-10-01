// Markdown task lists: `- [ ] to do` and `- [x] done`, as GitHub writes them.

export interface TaskLine {
  // Index of the line in the text.
  line: number
  checked: boolean
  // Offsets within the line: the list marker (`-`, `*`, `+`, or `1.`), and the `[ ]` box.
  markerFrom: number
  boxFrom: number
  // Where the item's text starts, after the box and one space.
  textFrom: number
  ordered: boolean
}

export interface TaskProgress {
  done: number
  total: number
}

const TASK_LINE = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)\[([ xX])\](?=\s|$)/
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+/
const FENCE = /^\s{0,3}(`{3,}|~{3,})/

export function parseTaskLine(text: string, line = 0): TaskLine | null {
  const match = TASK_LINE.exec(text)
  if (!match) return null
  const [whole, indent, marker, gap, mark] = match
  const boxFrom = indent.length + marker.length + gap.length
  return {
    line,
    checked: mark !== ' ',
    markerFrom: indent.length,
    boxFrom,
    textFrom: Math.min(text.length, whole.length + 1),
    ordered: /\d/.test(marker),
  }
}

// Every task in the text, leaving out lines inside fenced code blocks.
export function parseTasks(text: string): TaskLine[] {
  const tasks: TaskLine[] = []
  let fence: string | null = null
  text.split('\n').forEach((line, index) => {
    const opener = FENCE.exec(line)?.[1]
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length && line.trim() === opener) fence = null
      return
    }
    if (opener) {
      fence = opener
      return
    }
    const task = parseTaskLine(line, index)
    if (task) tasks.push(task)
  })
  return tasks
}

export function taskProgress(text: string): TaskProgress | null {
  const tasks = parseTasks(text)
  if (tasks.length === 0) return null
  return { done: tasks.filter((task) => task.checked).length, total: tasks.length }
}

export function progressLabel({ done, total }: TaskProgress): string {
  return `${done} of ${total} done`
}

export function progressPercent({ done, total }: TaskProgress): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

// Turns lines into a checklist, or back into plain lines when every one is already a task.
// Blank lines among others are left alone, and list items keep their bullet or number.
export function toggleChecklist(lines: readonly string[]): string[] {
  const filled = lines.filter((line) => line.trim() !== '')
  // An empty line starts a new checklist.
  if (filled.length === 0) return lines.map((line) => `${line}- [ ] `)
  const allTasks = filled.every((line) => parseTaskLine(line))
  return lines.map((line) => {
    if (line.trim() === '') return line
    if (allTasks) {
      const task = parseTaskLine(line)!
      // Numbered items keep their number. Bullets go too, since making a checklist adds them.
      return line.slice(0, task.ordered ? task.boxFrom : task.markerFrom) + line.slice(task.textFrom)
    }
    if (parseTaskLine(line)) return line
    const item = LIST_ITEM.exec(line)
    if (item) return `${item[0]}[ ] ${line.slice(item[0].length)}`
    const indent = /^\s*/.exec(line)![0]
    return `${indent}- [ ] ${line.slice(indent.length)}`
  })
}
