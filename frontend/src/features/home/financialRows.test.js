import { describe, expect, it } from 'vitest'
import { financialRows } from './financialRows'

const row = (rows, key) => rows.find((r) => r.key === key)

describe('financialRows', () => {
  it('financialRows unlinked: no GSSM values yet, only the target is editable', () => {
    const { state, rows } = financialRows({ id: '1' })
    expect(state).toBe('unlinked')
    expect(row(rows, 'services_revenue')).toMatchObject({ value: '', editable: false })
    expect(row(rows, 'service_line_target').editable).toBe(true)
  })

  it('marks every GSSM value read-only on a synced deal', () => {
    const deal = { gssm_synced_at: '2026-10-20T12:00:00Z', financials: { services_revenue: '100', price_type: 'BAFO Price', service_line_target: 27 } }
    const { state, rows } = financialRows(deal)
    expect(state).toBe('linked')
    expect(rows.filter((r) => r.key !== 'service_line_target').every((r) => r.editable === false)).toBe(true)
    expect(row(rows, 'price_type').value).toBe('BAFO Price')
    expect(row(rows, 'service_line_target')).toMatchObject({ value: 27, editable: true })
  })

  it('flags values typed before GSSM was linked', () => {
    expect(financialRows({ financials: { services_revenue: '7800000' } }).state).toBe('pre_gssm')
  })
})
