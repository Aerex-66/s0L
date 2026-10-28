import { describe, expect, it } from 'vitest'
import { dueSoon } from './dueSoon'

const today = new Date(2026, 9, 28, 15, 30)
const deal = (id, rfp_submission_date) => ({ id, rfp_submission_date })

describe('dueSoon', () => {
  it('keeps deals whose RFP submission date is today through a week ahead', () => {
    const deals = [
      deal(1, '2026-10-28'), deal(2, '2026-11-04'), deal(3, '2026-11-05'), deal(4, '2026-10-27'),
      deal(5, ''), deal(6, undefined), deal(7, '2026-11-01T00:00:00Z'), deal(8, 'soon'),
    ]
    expect(dueSoon(deals, { today }).map((d) => d.id)).toEqual([1, 2, 7])
  })
})
