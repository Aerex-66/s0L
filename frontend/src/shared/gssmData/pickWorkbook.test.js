import { describe, expect, it } from 'vitest'
import { pickWorkbookForDeal } from './pickWorkbook'

const catalog = Object.freeze([
  Object.freeze({ id: 1, name: 'Old.xlsm', opportunityNumber: 'OPP-1', createdAt: '2026-01-01' }),
  Object.freeze({ id: 2, name: 'Linked.xlsm', opportunityNumber: 'OPP-2', createdAt: '2026-02-01' }),
  Object.freeze({ id: 3, name: 'Newest.xlsm', opportunityNumber: null, createdAt: '2026-09-01' }),
])

describe('pickWorkbookForDeal', () => {
  it('prefers the workbook the deal is linked to', () => {
    expect(pickWorkbookForDeal({ gssm_workbook_id: 2, opportunity_number: 'OPP-1' }, catalog).id).toBe(2)
  })

  it('falls back to a unique opportunity-number match', () => {
    expect(pickWorkbookForDeal({ opportunity_number: 'OPP-1' }, catalog).id).toBe(1)
  })

  it('ignores ambiguous opportunity-number matches', () => {
    const twins = [...catalog, { id: 4, name: 'Copy.xlsm', opportunityNumber: 'OPP-1' }]
    expect(pickWorkbookForDeal({ opportunity_number: 'OPP-1' }, twins)).toBeNull()
  })

  it('returns null for missing link, never another deal\'s most recent workbook', () => {
    expect(pickWorkbookForDeal({ gssm_workbook_id: 99, opportunity_number: 'OPP-X' }, catalog)).toBeNull()
    expect(pickWorkbookForDeal({ opportunity_number: '' }, catalog)).toBeNull()
  })

  it('does not mutate the catalog', () => {
    expect(() => pickWorkbookForDeal({ opportunity_number: 'OPP-2' }, catalog)).not.toThrow()
  })
})
