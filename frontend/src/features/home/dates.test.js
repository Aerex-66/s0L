import { describe, expect, it } from 'vitest'
import { daysBetween, toLocalDate } from './dates'

describe('dates', () => {
  it('reads a YYYY-MM-DD value as that local day', () => {
    const day = toLocalDate('2026-10-27')
    expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours()]).toEqual([2026, 9, 27, 0])
    expect(toLocalDate('')).toBeNull()
    expect(toLocalDate('not a date')).toBeNull()
  })

  it('counts calendar days, whatever the time of day', () => {
    expect(daysBetween('2026-10-27', new Date(2026, 9, 29, 23, 30))).toBe(2)
    expect(daysBetween('2026-10-29', new Date(2026, 9, 29, 8))).toBe(0)
    expect(daysBetween(new Date(2026, 9, 29), '2026-11-06')).toBe(8)
  })

  it('never goes negative and has no answer without a start', () => {
    expect(daysBetween('2026-11-06', new Date(2026, 9, 29))).toBe(0)
    expect(daysBetween(null)).toBeNull()
  })
})
