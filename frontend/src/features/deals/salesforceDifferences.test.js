import { describe, expect, it } from 'vitest'
import { describeDifference, groupDifferences, UNASSIGNED } from './salesforceDifferences'

const deals = [
  { id: '1', client_name: 'Acme', project_name: 'S4', tt_executive: 'Zoe Ray' },
  { id: '2', client_name: 'Beta', project_name: 'MDG', tt_executive: 'Ed Fox' },
  { id: '3', client_name: 'Core', project_name: 'BW', tt_executive: '' },
  { id: '4', client_name: 'Delta', project_name: 'CX', tt_executive: 'Ann Lee' },
]
const row = (dealId, kind = 'not_returned', extra = {}) => ({
  deal_id: dealId, kind, key: 'opportunity_number', label: 'Opportunity Number', board: 'x', salesforce: '', fix: null, fixable: false, ...extra,
})

describe('groupDifferences', () => {
  it('puts the signed-in exec first, then A–Z, and unassigned deals last', () => {
    const groups = groupDifferences([row('1'), row('2'), row('3'), row('4')], deals, 'Ed Fox')
    expect(groups.map((group) => group.exec)).toEqual(['Ed Fox', 'Ann Lee', 'Zoe Ray', UNASSIGNED])
    expect(groups[0].rows[0].deal.client_name).toBe('Beta')
  })

  it('keeps A–Z when the signed-in person has no deals here', () => {
    expect(groupDifferences([row('1'), row('4')], deals, 'Ed Fox').map((group) => group.exec)).toEqual(['Ann Lee', 'Zoe Ray'])
  })

  it('drops rows whose deal is not loaded', () => {
    expect(groupDifferences([row('99')], deals, '')).toEqual([])
  })
})

describe('describeDifference', () => {
  it.each([
    ['not_an_id', /holds no Salesforce opportunity ID/],
    ['two_ids', /two opportunity IDs/],
    ['not_returned', /a wrong number, or you can't see it in Salesforce/],
    ['extra_text', /more than the ID/],
  ])('%s', (kind, text) => {
    expect(describeDifference(row('1', kind))).toMatch(text)
  })

  it('gives the full ID for a short or wrongly typed one', () => {
    expect(describeDifference(row('1', 'full_id', { board: '006A0000006Vm9r', salesforce: '006A0000006Vm9rIAC' })))
      .toBe("The board has “006A0000006Vm9r”; Salesforce's full ID is “006A0000006Vm9rIAC”.")
  })

  it('names the field for a value difference', () => {
    expect(describeDifference(row('1', 'value', { label: 'Sales Stage', board: 'Qualify', salesforce: 'Closed Won' })))
      .toBe('Sales Stage: the board says “Qualify”, Salesforce says “Closed Won”.')
    expect(describeDifference(row('1', 'value', { label: 'Sales Stage', board: '', salesforce: 'Closed Won' })))
      .toBe('Sales Stage: the board is empty, Salesforce says “Closed Won”.')
  })
})
