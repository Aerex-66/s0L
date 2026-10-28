import { describe, expect, it } from 'vitest'
import { boardClient, clientMatches, newDealPayload } from './newDealPayload'

const FORM = {
  group: 'SAP', opportunity_number: ' 006A ', client_name: 'Contoso', project_name: 'S/4 rollout',
  implementation_type: 'Greenfield', sector: '', industry: 'Retail', deal_type: 'New Logo', currency: 'EUR',
  rfp_submission_date: '2026-11-01', rate_card: 'Yes', price_to_win: '',
  lead_ssc: 'Ann Lee', tt_executive: 'Ed Fox', solution_consultant_2: '', solution_consultant_3: '',
}

describe('newDealPayload', () => {
  it('splits the form into board values, s0L-only fields and (for TT Execs) people', () => {
    expect(newDealPayload(FORM, true)).toEqual({
      group: 'SAP',
      values: {
        opportunity_number: '006A', client_name: 'Contoso', project_name: 'S/4 rollout',
        implementation_type: 'Greenfield', industry: 'Retail', deal_type: 'New Logo', currency: 'EUR',
      },
      people: { lead_ssc: 'Ann Lee', tt_executive: 'Ed Fox' },
      deal: { rfp_submission_date: '2026-11-01', rate_card: 'Yes' },
    })
  })

  it('sends no people for anyone else (monday adds them as Lead SSC)', () => {
    expect(newDealPayload(FORM, false).people).toEqual({})
  })
})

describe('boardClient', () => {
  const clients = ['Contoso', 'Fabrikam']
  it('finds the board spelling, ignoring case and spaces', () => {
    expect(boardClient('  contoso ', clients)).toBe('Contoso')
  })
  it('is empty for a client the board does not have', () => {
    expect(boardClient('Northwind', clients)).toBe('')
    expect(boardClient('', clients)).toBe('')
  })
})

describe('clientMatches', () => {
  const clients = ['Abbott', 'Bank of Contoso', 'Contoso', 'Fabrikam']
  it('lists every client before anything is typed', () => {
    expect(clientMatches('  ', clients)).toEqual(clients)
  })
  it('keeps clients containing the text, those starting with it first', () => {
    expect(clientMatches('CONT', clients)).toEqual(['Contoso', 'Bank of Contoso'])
  })
  it('is empty when nothing matches', () => {
    expect(clientMatches('zzz', clients)).toEqual([])
  })
})
