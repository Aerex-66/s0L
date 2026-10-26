import { describe, expect, it } from 'vitest'
import { extractFinancials, mapDealToGssmEdits } from './gssmBridge'
import { gssmCell } from '../constants/fieldIndex'

function ptiRows(values) {
  const rows = Array.from({ length: 45 }, () => ({}))
  for (const [key, value] of Object.entries(values)) {
    const { row, col } = gssmCell(key)
    rows[row][`c${col}`] = value
  }
  return rows
}

describe('extractFinancials', () => {
  it('emits index keys with the workbook values', () => {
    const fin = extractFinancials(ptiRows({
      services_revenue: 1000, labor_cost: 600, price_type: 'BAFO Price', contract_type: 'Time And Materials',
      risk_rating: 4, total_contingency: 0.12, gp_percent: 0.4,
    }))
    expect(fin.price_type).toBe('BAFO Price')
    expect(fin.contract_type).toBe('Time And Materials')
    expect(fin.risk_rating).toBe('4')
    expect(fin.services_revenue).toBe('1000')
    expect(fin.tcv).toBe('1000')
    expect(fin.gp_percent).toBe('40.00')
    expect(fin.total_contingency).toBe('12.00')
    for (const legacy of ['revenue', 'price_model', 'pricing_type', 'risk_level', '_gssm_source']) {
      expect(fin).not.toHaveProperty(legacy)
    }
  })

  it('does not invent values for empty cells', () => {
    const fin = extractFinancials(ptiRows({ services_revenue: 5 }))
    expect(fin).not.toHaveProperty('contract_type')
    expect(fin).not.toHaveProperty('cola_clause')
  })
})

describe('mapDealToGssmEdits', () => {
  const homeDrawn = {
    financials: { contract_type: 'Fixed Price', risk_rating: '3' },
    timelines: [{
      name: 'Main', project_start_date: '2026-01-01', total_duration: 3,
      timeline: { Prepare: { duration: 1, unit: 'months' }, Explore: { duration: 2, unit: 'months' } },
    }],
  }

  it('seeds only the timeline, never PTI inputs', () => {
    const edits = mapDealToGssmEdits(homeDrawn)
    expect(edits.some((edit) => edit.sheet === 'PTI_Estimator')).toBe(false)
    expect(edits.filter((edit) => edit.sheet === 'Imp TL').length).toBeGreaterThan(0)
  })

  it('never writes back into a workbook the deal is already linked to', () => {
    expect(mapDealToGssmEdits({ ...homeDrawn, gssm_workbook_id: 2 })).toEqual([])
    expect(mapDealToGssmEdits({ ...homeDrawn, gssm_synced_at: '2026-09-22T09:30:04Z' })).toEqual([])
  })
})
