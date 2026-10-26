import { describe, expect, it } from 'vitest'
import { STAGES, computeStageReadiness } from './stageReadiness'

const base = { client_name: 'Acme', project_name: 'S4', opportunity_number: 'O1', contacts: [], activities: [] }

describe('computeStageReadiness', () => {
  it('counts GSSM revenue and labor cost toward the commercial stage', () => {
    const deal = { ...base, financials: { services_revenue: '100', labor_cost: '60', price_type: 'BAFO Price' } }
    expect(computeStageReadiness(deal).commercial.done).toBe(2)
  })

  it('counts the GSSM risk rating toward risk & compliance', () => {
    const deal = { ...base, financials: { risk_rating: '3' } }
    expect(computeStageReadiness(deal)['risk-compliance'].done).toBe(1)
  })

  it('honours a manual completion override', () => {
    const deal = { ...base, workflow_stage_manual: { 'solution-staffing': true } }
    const stage = computeStageReadiness(deal)['solution-staffing']
    expect(stage.complete).toBe(true)
    expect(stage.manualComplete).toBe(true)
  })

  it('treats solutioning and staffing as one stage', () => {
    const ids = STAGES.map((s) => s.id)
    expect(ids).toEqual(['intake', 'solution-staffing', 'risk-compliance', 'commercial', 'governance'])
    expect(STAGES.find((s) => s.id === 'solution-staffing').label).toBe('Solution & Staffing')
  })

  it('counts timeline and staffing evidence toward that one stage, check by check', () => {
    const deal = {
      ...base,
      timelines: [{ project_start_date: '2027-01-04' }],
      resources: { leadership: [{ role: 'Delivery Partner', assigned_to: 'Ana Silva' }] },
    }
    const stage = computeStageReadiness(deal)['solution-staffing']
    expect(stage.checks).toEqual([true, true, false, true, false, false])
    expect(stage.done).toBe(3)
    expect(stage.total).toBe(6)
  })
})
