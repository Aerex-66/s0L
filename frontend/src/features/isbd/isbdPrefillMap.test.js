import { expect, it } from 'vitest'
import { buildPrefillData } from './isbdPrefillMap'

const deal = {
  client_name: 'Acme', project_name: 'S4 Program', market: 'US', sector: 'Industrial', industry: 'Auto',
  price_to_win: '5000000',
  financials: { tcv: '14100000', price_type: 'BAFO Price', contract_type: 'Fixed Price', risk_rating: '4' },
  resources: { leadership: [{ role: 'Delivery Partner', assigned_to: 'Dana Partner' }] },
  isbd_data: { billing_timing: 'Monthly' },
}

it('prefills deal, GSSM and derived fields from the index, formatted per template', () => {
  const prefill = buildPrefillData(deal)
  expect(prefill.client_name).toBe('Acme')
  expect(prefill.project_name).toBe('S4 Program')
  expect(prefill.price_type).toBe('BAFO Price')
  expect(prefill.contract_type).toBe('Fixed Price')
  expect(prefill.tcv).toBe('14100000')
  expect(prefill.price_to_win).toBe('5000000')
  expect(prefill.geo_market).toBe('Americas/US/Industrial/Auto')
  expect(prefill.partner_name).toBe('Dana Partner')
  expect(prefill).not.toHaveProperty('opportunity_name')
})

it('builds the financial assumptions narrative from index keys', () => {
  const { financial_assumptions: text } = buildPrefillData(deal)
  expect(text).toContain('Contract Type: Fixed Price')
  expect(text).toContain('Price Type: BAFO Price')
  expect(text).toContain('Risk Rating: 4 (Moderate (12%))')
  expect(text).toContain('Monthly')
})
