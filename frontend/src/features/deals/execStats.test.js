import { describe, expect, it } from 'vitest'
import { needsAssignment, periodIndex, periodLabel, periodStats, trend, winRate } from './execStats'

const deal = (id, fields) => ({ id, status: 'Active', lead_ssc: 'Ann Lee', monday_item_id: String(id), ...fields })

const deals = [
  deal(1, { monday_created_at: '2026-10-02', estimated_value: '5000000' }),
  deal(2, { monday_created_at: '2026-08-15', estimated_value: '2000000', status: 'Won', status_changed_at: '2026-10-20' }),
  deal(3, { monday_created_at: '2026-07-01', status: 'Lost', status_changed_at: '2026-11-01' }),
  deal(4, { monday_created_at: '2026-09-30', status: 'Submitted', status_changed_at: '2026-10-05' }),
  deal(5, { monday_created_at: '2026-04-10', status: 'Lost', status_changed_at: '2026-09-02' }),
  deal(6, { created_date: '2026-10-27T10:00:00', monday_item_id: undefined }),
]

describe('periods', () => {
  it('numbers calendar months, quarters, halves and years', () => {
    expect(periodLabel(periodIndex('2026-10-15', 'month'), 'month')).toBe('Oct 2026')
    expect(periodLabel(periodIndex('2026-10-15', 'quarter'), 'quarter')).toBe('Q4 2026')
    expect(periodLabel(periodIndex('2026-10-15', 'half'), 'half')).toBe('H2 2026')
    expect(periodLabel(periodIndex('2026-10-15', 'year'), 'year')).toBe('2026')
    expect(periodIndex('2026-12-31', 'quarter') + 1).toBe(periodIndex('2027-01-01', 'quarter'))
    expect(periodIndex('', 'month')).toBe(null)
  })
})

describe('periodStats', () => {
  it('counts deals added, submitted, won and lost in a period', () => {
    const q4 = periodStats(deals, 'quarter', periodIndex('2026-10-01', 'quarter'))
    expect(q4).toMatchObject({ label: 'Q4 2026', added: 2, addedTcv: 5e6, submitted: 1, won: 1, wonTcv: 2e6, lost: 1, winRate: 0.5 })
  })

  it('has no win rate without a decision', () => {
    expect(periodStats(deals, 'month', periodIndex('2026-08-01', 'month')).winRate).toBe(null)
  })

  it('dates a status the board never changed by the day the row was added', () => {
    const list = [deal(1, { monday_created_at: '2026-10-03', status: 'Won' })]
    expect(periodStats(list, 'month', periodIndex('2026-10-01', 'month')).won).toBe(1)
  })

  it('runs over the last periods, oldest first', () => {
    const months = trend(deals, 'month', periodIndex('2026-10-01', 'month'), 3)
    expect(months.map((p) => [p.label, p.added, p.lost])).toEqual([['Aug 2026', 1, 0], ['Sep 2026', 1, 1], ['Oct 2026', 2, 0]])
  })
})

describe('winRate', () => {
  it('is won against won plus lost, from every deal\'s status', () => {
    expect(winRate(deals)).toEqual({ won: 1, lost: 2, rate: 1 / 3 })
    expect(winRate([]).rate).toBe(null)
  })
})

describe('needsAssignment', () => {
  it('lists open deals without a lead or waiting for assignment, newest first', () => {
    const list = [
      deal(1, { monday_created_at: '2026-10-01', status: 'Assignment Needed' }),
      deal(2, { monday_created_at: '2026-10-05', lead_ssc: 'TBD' }),
      deal(3, { monday_created_at: '2026-10-09' }),
      deal(4, { monday_created_at: '2026-10-07', lead_ssc: '', status: 'Lost' }),
    ]
    expect(needsAssignment(list).map((d) => d.id)).toEqual([2, 1])
  })
})
