import { describe, expect, it } from 'vitest'
import { isClosedDeal, isWonDeal } from './uiStates'

describe('isClosedDeal', () => {
  it.each([
    [{ sales_stage: 'Won' }, true],
    [{ sales_stage: 'Lost' }, true],
    [{ sales_stage: 'Submitted' }, true],
    [{ status: 'Archived' }, true],
    [{ status: 'Won' }, true],
    [{ status: 'Submitted' }, true],
    [{ status: 'No Bid' }, true],
    [{ status: 'On Hold' }, false],
    [{ status: 'Assignment Needed' }, false],
    [{ sales_stage: 'Qualify', status: 'Active' }, false],
    [{}, false],
  ])('%o -> %s', (deal, closed) => {
    expect(isClosedDeal(deal)).toBe(closed)
  })

  it('counts board and s0L wins', () => {
    expect(isWonDeal({ status: 'Won' })).toBe(true)
    expect(isWonDeal({ sales_stage: 'Won' })).toBe(true)
    expect(isWonDeal({ status: 'Submitted' })).toBe(false)
  })
})
