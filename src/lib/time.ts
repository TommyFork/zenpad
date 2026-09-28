const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < MINUTE) return 'now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d`
  const date = new Date(timestamp)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', year: 'numeric' })
}

export interface DateGroup<T> {
  label: string
  items: T[]
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// Calendar days, not 24-hour spans, so a note from 11pm last night is "Yesterday". Rounding absorbs DST shifts.
function daysAgo(timestamp: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY)
}

export function dateGroupLabel(timestamp: number, now = Date.now()): string {
  const days = daysAgo(timestamp, now)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'Previous 7 days'
  if (days < 30) return 'Previous 30 days'
  const date = new Date(timestamp)
  if (date.getFullYear() === new Date(now).getFullYear()) return date.toLocaleDateString(undefined, { month: 'long' })
  return String(date.getFullYear())
}

// Expects items newest first, so each label forms one run and groups come out in order.
export function groupByDate<T>(items: T[], getTime: (item: T) => number, now = Date.now()): DateGroup<T>[] {
  const groups: DateGroup<T>[] = []
  for (const item of items) {
    const label = dateGroupLabel(getTime(item), now)
    const last = groups.at(-1)
    if (last?.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}
