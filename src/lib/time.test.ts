import { describe, expect, it } from 'vitest'
import { dateGroupLabel, formatRelativeTime, groupByDate } from './time'

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

describe('dateGroupLabel', () => {
  it('uses calendar days for recent edits', () => {
    expect(dateGroupLabel(new Date(2026, 8, 24, 0, 5).getTime(), now)).toBe('Today')
    expect(dateGroupLabel(new Date(2026, 8, 23, 23, 55).getTime(), now)).toBe('Yesterday')
    expect(dateGroupLabel(new Date(2026, 8, 18).getTime(), now)).toBe('Previous 7 days')
    expect(dateGroupLabel(new Date(2026, 8, 17).getTime(), now)).toBe('Previous 30 days')
    expect(dateGroupLabel(new Date(2026, 7, 26).getTime(), now)).toBe('Previous 30 days')
  })

  it('falls back to the month this year, then the year', () => {
    const march = new Date(2026, 2, 3).getTime()
    expect(dateGroupLabel(march, now)).toBe(new Date(march).toLocaleDateString(undefined, { month: 'long' }))
    expect(dateGroupLabel(new Date(2024, 11, 31).getTime(), now)).toBe('2024')
  })

  it('treats future timestamps as today', () => {
    expect(dateGroupLabel(now + 86_400_000, now)).toBe('Today')
  })
})

describe('groupByDate', () => {
  it('keeps the order of newest-first items', () => {
    const times = [now, now - 60_000, new Date(2026, 8, 23).getTime(), new Date(2025, 0, 1).getTime(), new Date(2024, 0, 1).getTime()]
    const groups = groupByDate(times, (time) => time, now)
    expect(groups.map((group) => group.label)).toEqual(['Today', 'Yesterday', '2025', '2024'])
    expect(groups[0].items).toEqual([now, now - 60_000])
  })

  it('returns no groups for no items', () => {
    expect(groupByDate([], (time: number) => time, now)).toEqual([])
  })
})
