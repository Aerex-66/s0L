import { describe, expect, it } from 'vitest'
import labelCases from '../../../../shared/test-fixtures/label_cases.json'
import {
  FIELD_INDEX, canonicalKey, gssmCell, isEditable, isbdKeyFor, normalizeLabel, ownerOf, pathOf,
} from './fieldIndex'

describe('field index (JS loader)', () => {
  it('has unique keys and aliases', () => {
    const seen = new Map()
    for (const [key, entry] of Object.entries(FIELD_INDEX)) {
      for (const name of [key, ...(entry.aliases || [])]) {
        expect(seen.has(name), `${name} claimed by ${seen.get(name)} and ${key}`).toBe(false)
        seen.set(name, key)
      }
    }
  })

  it.each([
    ['revenue', 'services_revenue'],
    ['price_model', 'contract_type'],
    ['pricing_type', 'price_type'],
    ['risk_level', 'risk_rating'],
    ['exec_client_type', 'client_type'],
    ['opportunity_name', 'project_name'],
    ['bid_date', 'bid_submission_date'],
    ['rfp_request_date', 'rfp_submission_date'],
    ['not_a_field', 'not_a_field'],
  ])('canonicalKey(%s) -> %s', (name, expected) => {
    expect(canonicalKey(name)).toBe(expected)
  })

  it('keeps sales_stage as its own iSBD field', () => {
    expect(canonicalKey('sales_stage')).toBe('sales_stage')
    expect(ownerOf('sales_stage')).toBe('isbd')
  })

  it.each([
    ['Bid Submission Date', undefined, 'bid_submission_date'],
    ['TCV / NPV GP%', undefined, 'tcv'],
    ['Date', 'risk_assessment', 'risk_review_date'],
    ['Date', undefined, null],
    ['Contract Type', 'risk_assessment', 'contract_type'],
    ['Client', 'executive_summary', 'client_type'],
    ['Client', 'risk_assessment', 'client_name'],
  ])('isbdKeyFor(%s, %s) -> %s', (label, slide, expected) => {
    expect(isbdKeyFor(label, slide)).toBe(expected)
  })

  it('converts GSSM A1 cells to 0-based coordinates', () => {
    expect(gssmCell('services_revenue')).toEqual({ sheet: 'PTI_Estimator', row: 29, col: 1 })
    expect(gssmCell('opportunity_number')).toEqual({ sheet: 'Home', row: 21, col: 9 })
  })

  it.each(['opportunity_owner', 'service_line', 'decision_date', 'client_type', 'engagement_type', 'engagement_source', 'review_status'])(
    '%s is deal-owned at its own path', (key) => {
      expect(ownerOf(key)).toBe('deal')
      expect(pathOf(key)).toBe(key)
    })

  it('normalizes labels exactly like the Python loader', () => {
    for (const [raw, expected] of labelCases) expect(normalizeLabel(raw)).toBe(expected)
  })

  it('locks timelines once a workbook is linked and never lets Home edit GSSM values', () => {
    expect(isEditable('timelines', { gssm_workbook_id: 7 })).toBe(false)
    expect(isEditable('timelines', { gssm_synced_at: '2026-09-22T09:30:04Z' })).toBe(false)
    expect(isEditable('timelines', {})).toBe(true)
    expect(isEditable('services_revenue', {})).toBe(false)
    expect(isEditable('client_name', {})).toBe(true)
  })
})
