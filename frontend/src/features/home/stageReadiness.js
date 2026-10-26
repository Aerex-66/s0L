/** Home stage readiness — what each deal stage still needs, read from the shared deal record. */
import { isDoneStatus } from '../../shared/constants/uiStates'

export const STAGES = [
  { id: 'intake', label: 'Intake', tabs: ['contacts'], objective: 'Confirm deal identity, ownership, and stakeholders.', events: ['Core identity', 'Stakeholder contacts', 'B&P / ISC trace'] },
  { id: 'solution-staffing', label: 'Solution & Staffing', tabs: ['timeline', 'resources'], objective: 'Shape the solution and the team that delivers it: timeline backbone, RBK/SWB baseline, delivery roles and capacity.', events: ['Timeline defined', 'Start date set', 'RBK/SWB ready', 'Leadership assigned', 'SRA/PMP evidence', 'Staffability review'] },
  { id: 'risk-compliance', label: 'Risk & Compliance', tabs: ['activities'], objective: 'Drive mandatory risk & compliance artifacts.', events: ['Risk items created', 'Controls completed', 'Contingency set'] },
  { id: 'commercial', label: 'Commercial', tabs: ['financials'], objective: 'Establish deal economics and pricing posture.', events: ['Baseline set', 'Financials captured', 'Pricing model'] },
  { id: 'governance', label: 'Review & Release', tabs: ['activities'], objective: 'Complete formal review approvals and release.', events: ['SRR/PRR evidence', 'Review completed', 'All approved'] },
]

export function computeStageReadiness(deal) {
  if (!deal) return {}
  const manual = deal.workflow_stage_manual || {}
  const activities = deal.activities || []
  const actTitle = (a) => `${a.activity || a.name || ''}`.toLowerCase()
  const matchKw = (kws) => activities.filter((a) => kws.some((k) => actTitle(a).includes(k)))
  const hasKw = (kws) => matchKw(kws).length > 0
  const doneKw = (kws) => matchKw(kws).filter((a) => isDoneStatus(a.status)).length
  const fin = deal.financials || {}
  const res = deal.resources || {}
  const staffab = res.staffability || {}
  const tls = deal.timelines || []

  const checks = {
    intake: [Boolean(deal.client_name && deal.project_name && deal.opportunity_number), (deal.contacts || []).length > 0, hasKw(['awareness', 'b&p', 'isc'])],
    'solution-staffing': [
      tls.length > 0,
      tls.some((t) => t.project_start_date),
      Boolean(deal.external_links?.rbk_url) || hasKw(['rbk', 'solution', 'swb']),
      (res.leadership || []).some((r) => r?.assigned_to),
      hasKw(['staff', 'sra', 'pmp']),
      Object.values(staffab).some((e) => `${e?.status || ''}` !== 'Not Started'),
    ],
    'risk-compliance': [hasKw(['risk', 'dprc', 'credit', 'dra', 'tda']), doneKw(['risk', 'dprc', 'credit', 'dra', 'tda']) > 0, Boolean(fin.risk_rating || fin.total_contingency)],
    commercial: [Boolean(deal.estimated_value || deal.price_to_win || deal.rate_card), Boolean(fin.services_revenue && fin.labor_cost), Boolean(fin.price_type || deal.price_to_win)],
    governance: [hasKw(['srr', 'prr', 'review']), doneKw(['srr', 'prr', 'review']) > 0, activities.length > 0 && activities.every((a) => isDoneStatus(a.status))],
  }

  const result = {}
  for (const stage of STAGES) {
    const c = (checks[stage.id] || []).map(Boolean)
    const done = c.filter(Boolean).length
    const total = c.length
    const manualComplete = Boolean(manual[stage.id])
    const complete = manualComplete || done === total
    result[stage.id] = {
      done, total, checks: c, pct: Math.round((done / total) * 100), complete, manualComplete,
      status: complete ? 'complete' : done > 0 ? 'in-progress' : 'todo',
    }
  }
  return result
}
