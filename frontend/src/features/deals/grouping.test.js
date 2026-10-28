import { describe, expect, it } from 'vitest'
import { GROUPINGS, groupDeals, tcvBand, NO_PRACTICE, NO_STATUS, NO_TCV } from './grouping'
import { applyFilters, filterOptions, searchDeals } from './listFilters'

const deal = (id, lead, tcv, extra = {}) => ({ id, lead_ssc: lead, estimated_value: tcv, ...extra })
const tcvOf = (d) => d.estimated_value
const deals = [
  deal(1, 'Andy Shea', 60e6),
  deal(2, 'Art Liem', 3e6),
  deal(3, 'Andy Shea', 12e6),
  deal(4, 'TBD', 0),
  deal(5, 'Art Liem', 0.5e6),
  deal(6, 'Andy Shea', null),
]

describe('groupDeals', () => {
  it('groups by lead solutioner A–Z, unassigned last, with TCV totals', () => {
    const groups = groupDeals([...deals, deal(7, 'Zoe Ray', 0), deal(8, 'Zoe Ray', 0), deal(9, 'Zoe Ray', 0), deal(10, 'Zoe Ray', 0)], 'solutioner', tcvOf)
    expect(groups.map((g) => [g.label, g.count, g.tcv])).toEqual([
      ['Andy Shea', 3, 72e6], ['Art Liem', 2, 3.5e6], ['Zoe Ray', 4, 0], ['Unassigned', 1, 0],
    ])
    expect(groups[0].deals.map((d) => d.id)).toEqual([1, 3, 6])
    expect(groups.map((g) => g.missing)).toEqual([false, false, false, true])
  })

  it('names what each grouping counts', () => {
    expect(GROUPINGS.filter((g) => g.id !== 'none').map((g) => g.noun)).toEqual([
      ['solutioner', 'solutioners'], ['status', 'statuses'], ['practice', 'practices'], ['TCV band', 'TCV bands'],
    ])
  })

  it('groups by TCV band, biggest first, deals without a TCV last', () => {
    expect(groupDeals(deals, 'tcv', tcvOf).map((g) => [g.label, g.count])).toEqual([
      ['$50M and up', 1], ['$10M – $20M', 1], ['$1M – $5M', 1], ['Under $1M', 1], [NO_TCV, 2],
    ])
    expect(tcvBand(20e6)).toBe('$20M – $50M')
  })

  it('does not group for none', () => {
    expect(groupDeals(deals, 'none', tcvOf)).toBe(null)
  })

  it('groups by status A–Z, deals without one last', () => {
    const list = ['Won', 'On Hold', 'Active', '', 'Brand New', 'Assignment Needed', 'Lost', 'Active']
      .map((status, i) => deal(i, 'A', 1e6, { status }))
    const groups = groupDeals(list, 'status', tcvOf)
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ['Active', 2], ['Assignment Needed', 1], ['Brand New', 1], ['Lost', 1], ['On Hold', 1], ['Won', 1], [NO_STATUS, 1],
    ])
    expect(groups[0].color).toBe('var(--status-success)')
  })

  it('groups by practice A–Z, each in its practice hue', () => {
    const list = [
      deal(1, 'A', 0, { monday_group: 'SAP' }), deal(2, 'A', 0, { monday_group: 'Salesforce, Adobe, ServiceNow' }),
      deal(3, 'A', 0), deal(4, 'A', 0, { monday_group: 'Oracle' }), deal(5, 'A', 0, { monday_group: 'SAP' }),
    ]
    const groups = groupDeals(list, 'practice', tcvOf)
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ['Oracle', 1], ['Salesforce, Adobe, ServiceNow', 1], ['SAP', 2], [NO_PRACTICE, 1],
    ])
    expect(groups.map((g) => g.color)).toEqual(['var(--practice-2)', 'var(--practice-3)', 'var(--practice-1)', undefined])
  })
})

describe('searchDeals', () => {
  it('matches the text in any searched field, ignoring case', () => {
    const list = [
      { id: 1, client_name: 'Contoso', status: 'Won' },
      { id: 2, client_name: 'Fabrikam', lead_ssc: 'Ann Lee', monday_group: 'Oracle' },
    ]
    expect(searchDeals(list, 'won').map((d) => d.id)).toEqual([1])
    expect(searchDeals(list, 'ann').map((d) => d.id)).toEqual([2])
    expect(searchDeals(list, 'oracle').map((d) => d.id)).toEqual([2])
    expect(searchDeals(list, '')).toBe(list)
  })
})

describe('list filters', () => {
  const list = [
    { id: 1, status: 'Active', monday_group: 'SAP', implementation_type: ['Greenfield', 'Public Cloud'], lead_ssc: 'Andy Shea' },
    { id: 2, status: 'On Hold', monday_group: 'Oracle', implementation_type: 'Brownfield', solution_consultant_3: 'Andy Shea' },
    { id: 3, status: 'Active', monday_group: 'Oracle', implementation_type: 'Greenfield', lead_ssc: 'Art Liem' },
  ]

  it('offers the values found on the deals', () => {
    const options = filterOptions(list)
    expect(options.status).toEqual(['Active', 'On Hold'])
    expect(options.implementation_type).toEqual(['Brownfield', 'Greenfield', 'Public Cloud'])
    expect(options.solutioner).toEqual(['Andy Shea', 'Art Liem'])
  })

  it('keeps the deals matching every filter set', () => {
    expect(applyFilters(list, { status: 'Active', practice: 'Oracle' }).map((d) => d.id)).toEqual([3])
    expect(applyFilters(list, { implementation_type: 'Greenfield' }).map((d) => d.id)).toEqual([1, 3])
    expect(applyFilters(list, { solutioner: 'Andy Shea' }).map((d) => d.id)).toEqual([1, 2])
    expect(applyFilters(list, {})).toBe(list)
  })
})
