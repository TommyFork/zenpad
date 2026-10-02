import { describe, expect, it } from 'vitest'
import { parseTaskLine, parseTasks, progressPercent, taskProgress, toggleChecklist } from './tasks'

describe('parseTaskLine', () => {
  it('reads open and checked tasks', () => {
    expect(parseTaskLine('- [ ] buy milk')).toMatchObject({ checked: false, markerFrom: 0, boxFrom: 2, textFrom: 6, ordered: false })
    expect(parseTaskLine('  * [x] done')).toMatchObject({ checked: true, markerFrom: 2, boxFrom: 4, textFrom: 8 })
    expect(parseTaskLine('+ [X] shouted')?.checked).toBe(true)
  })

  it('reads numbered tasks', () => {
    expect(parseTaskLine('12. [ ] step')).toMatchObject({ ordered: true, boxFrom: 4, textFrom: 8 })
  })

  it('accepts an empty task', () => {
    expect(parseTaskLine('- [ ]')).toMatchObject({ textFrom: 5 })
  })

  it('ignores lines that only look like tasks', () => {
    expect(parseTaskLine('[ ] no bullet')).toBeNull()
    expect(parseTaskLine('- [ ]stuck')).toBeNull()
    expect(parseTaskLine('- [y] other')).toBeNull()
    expect(parseTaskLine('-[ ] tight')).toBeNull()
  })
})

describe('parseTasks', () => {
  it('finds tasks with their line numbers', () => {
    const tasks = parseTasks('# Trip\n- [x] book\n- [ ] pack\nnotes')
    expect(tasks.map((task) => [task.line, task.checked])).toEqual([
      [1, true],
      [2, false],
    ])
  })

  it('works out how deeply each task is nested', () => {
    const depths = (text: string) => parseTasks(text).map((task) => task.depth)
    expect(depths('- [ ] a\n  - [ ] b\n    - [ ] c\n  - [ ] d\n- [ ] e')).toEqual([0, 1, 2, 1, 0])
    expect(depths('- [ ] a\n    - [ ] b\n\n    - [ ] c')).toEqual([0, 1, 1])
    // A paragraph in between starts over, so an indented task under it isn't nested.
    expect(depths('- [ ] a\nnotes\n  - [ ] b')).toEqual([0, 0])
  })

  it('skips fenced code', () => {
    expect(parseTasks('```md\n- [ ] example\n```\n- [ ] real')).toHaveLength(1)
    expect(parseTasks('~~~~\n- [ ] a\n~~~\n- [ ] b\n~~~~\n- [ ] c').map((task) => task.line)).toEqual([5])
  })
})

describe('taskProgress', () => {
  it('counts done and total', () => {
    expect(taskProgress('- [x] a\n- [ ] b\n- [X] c')).toEqual({ done: 2, total: 3 })
  })

  it('is null without tasks', () => {
    expect(taskProgress('- plain\ntext')).toBeNull()
  })

  it('rounds the percentage', () => {
    expect(progressPercent({ done: 1, total: 3 })).toBe(33)
    expect(progressPercent({ done: 0, total: 0 })).toBe(0)
  })
})

describe('toggleChecklist', () => {
  it('turns lines and list items into tasks', () => {
    expect(toggleChecklist(['milk', '', '  - eggs', '2. bread', '- [x] tea'])).toEqual([
      '- [ ] milk',
      '',
      '  - [ ] eggs',
      '2. [ ] bread',
      '- [x] tea',
    ])
  })

  it('turns a checklist back into plain lines', () => {
    expect(toggleChecklist(['- [ ] milk', '', '  * [x] eggs', '3. [ ] bread', '- [ ]'])).toEqual(['milk', '', '  eggs', '3. bread', ''])
  })

  it('starts a checklist on an empty line', () => {
    expect(toggleChecklist([''])).toEqual(['- [ ] '])
    expect(toggleChecklist(['  '])).toEqual(['  - [ ] '])
  })
})
