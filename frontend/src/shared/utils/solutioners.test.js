import { describe, expect, it } from 'vitest'
import { UNASSIGNED, dealsInScope, isSolutionerDeal, leadSolutionerCounts, solutionerNames } from './solutioners'

const DEALS = [
  { id: '1', lead_ssc: 'Pat Lee', solution_consultant_2: 'TBD', solution_consultant_3: 'TBD', solution_consultant_4: 'TBD' },
  { id: '2', lead_ssc: 'Sam Roe', solution_consultant_2: 'pat lee', solution_consultant_3: 'TBD', solution_consultant_4: 'TBD' },
  { id: '3', lead_ssc: 'TBD', solution_consultant_2: 'TBD', solution_consultant_3: '', solution_consultant_4: 'TBD' },
  { id: '4', lead_ssc: 'Sam Roe' },
]

describe('solutioners', () => {
  it('lists every named solutioner once, without the TBD placeholder', () => {
    expect(solutionerNames(DEALS)).toEqual(['Pat Lee', 'Sam Roe'])
  })

  it('matches a lead or supporting solutioner, ignoring case and spaces', () => {
    expect(isSolutionerDeal(DEALS[1], ' Pat Lee ')).toBe(true)
    expect(isSolutionerDeal(DEALS[2], 'TBD')).toBe(false)
    expect(isSolutionerDeal(DEALS[0], '')).toBe(false)
  })

  it('shows only my deals in "mine" scope once a name is picked', () => {
    expect(dealsInScope(DEALS, { scope: 'mine', solutioner: 'Pat Lee' }).map((d) => d.id)).toEqual(['1', '2'])
    expect(dealsInScope(DEALS, { scope: 'mine', solutioner: '' })).toBe(DEALS)
    expect(dealsInScope(DEALS, { scope: 'everyone', solutioner: 'Pat Lee' })).toBe(DEALS)
  })

  it('counts deals per lead solutioner, busiest first, with unassigned deals grouped', () => {
    expect(leadSolutionerCounts(DEALS)).toEqual([
      { name: 'Sam Roe', count: 2 },
      { name: 'Pat Lee', count: 1 },
      { name: UNASSIGNED, count: 1 },
    ])
  })
})
