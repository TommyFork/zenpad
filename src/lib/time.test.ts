import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './time'

const now = new Date(2026, 8, 24, 12, 0).getTime()

describe('formatRelativeTime', () => {
  it('uses compact units for recent edits', () => {
    expect(formatRelativeTime(now - 10_000, now)).toBe('now')
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m')
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3h')
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2d')
  })

  it('falls back to a date after a week', () => {
    expect(formatRelativeTime(new Date(2026, 7, 1).getTime(), now)).toMatch(/Aug/)
  })

  it('treats future timestamps as now', () => {
    expect(formatRelativeTime(now + 60_000, now)).toBe('now')
  })
})
