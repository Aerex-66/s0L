import { describe, expect, it } from 'vitest'
import { outcomes, similarDeals, tcvOf, tcvStanding } from './similarity'

const deal = { id: '1', monday_group: 'SAP', implementation_type: 'Greenfield', industry: 'Energy', sector: 'Public', estimated_value: '10000000' }

describe('similarDeals', () => {
  it('matches type or industry within the practice, closest first', () => {
    const deals = [
      deal,
      { id: '2', monday_group: 'SAP', implementation_type: 'Greenfield', industry: 'Retail', estimated_value: '5000000' },
      { id: '3', monday_group: 'SAP', implementation_type: 'Greenfield', industry: 'Energy', estimated_value: '1000000' },
      { id: '4', monday_group: 'Oracle', implementation_type: 'Greenfield', industry: 'Energy' },
      { id: '5', monday_group: 'SAP', implementation_type: 'Brownfield', industry: 'Retail', sector: 'Public' },
    ]
    const found = similarDeals(deal, deals)
    expect(found.map((s) => s.deal.id)).toEqual(['3', '2'])
    expect(found[0].reasons).toEqual(['Same type', 'Same industry'])
  })

  it('compares names without caring about case or spaces', () => {
    const found = similarDeals(deal, [{ id: '9', implementation_type: ' greenfield ' }])
    expect(found).toHaveLength(1)
  })
})

describe('outcomes', () => {
  it('counts won, lost and open deals and the win rate of the decided ones', () => {
    const result = outcomes([
      { status: 'Won' }, { sales_stage: 'Won' }, { status: 'Lost' }, { status: 'Submitted' }, { status: 'Active' },
    ])
    expect(result).toEqual({ won: 2, lost: 1, otherClosed: 1, open: 1, winRate: 2 / 3 })
  })

  it('has no win rate until a deal is decided', () => {
    expect(outcomes([{ status: 'Active' }]).winRate).toBeNull()
  })
})

describe('tcvStanding', () => {
  it('ranks a TCV among the deals that have one', () => {
    const standing = tcvStanding(12, [{ estimated_value: 20 }, { estimated_value: 5 }, { estimated_value: 10 }, {}])
    expect(standing).toEqual({ count: 3, median: 10, smallest: 5, biggest: 20, rank: 2 })
    expect(tcvOf({ financials: { tcv: 7 }, estimated_value: 9 })).toBe(7)
  })

  it('returns nothing when no deal has a TCV', () => {
    expect(tcvStanding(5, [{}])).toBeNull()
  })
})
