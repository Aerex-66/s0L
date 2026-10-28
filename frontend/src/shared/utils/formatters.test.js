import { describe, expect, it } from 'vitest'
import { formatCompactMillions, formatShortDate, formatShortDateWithYear } from './formatters'

describe('dates', () => {
  it('shows a calendar date as that day, not the day before west of Greenwich', () => {
    expect(formatShortDate('2026-10-02')).toBe('Oct 2')
    expect(formatShortDateWithYear('2026-01-01')).toBe('Jan 1, 2026')
    expect(formatShortDate('')).toBe(null)
  })
})

describe('formatCompactMillions', () => {
  it.each([
    [25000, '$25K'],
    [12500000, '$12.5M'],
    [4123500000, '$4.1B'],
    [0, '—'],
    ['', '—'],
  ])('%s -> %s', (value, expected) => {
    expect(formatCompactMillions(value)).toBe(expected)
  })
})
