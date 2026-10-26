import { describe, expect, it } from 'vitest'
import { isCurrencyEdit, toDisplayCurrency } from './cellValues'

describe('currency cells', () => {
  it('formats any deal number for display without losing it', () => {
    expect(toDisplayCurrency('4980000')).toBe('$5M')
    expect(toDisplayCurrency('5.2M')).toBe('$5.2M')
    expect(toDisplayCurrency('$5.2M')).toBe('$5.2M')
  })

  it('treats clicking through a cell without typing as no edit', () => {
    expect(isCurrencyEdit('4980000', '4980000')).toBe(false)
    expect(isCurrencyEdit('5.2M', '5200000')).toBe(false)
    expect(isCurrencyEdit('750000', '750000')).toBe(false)
  })

  it('treats a different number as an edit', () => {
    expect(isCurrencyEdit('5000000', '4985250')).toBe(true)
  })
})
