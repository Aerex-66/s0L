import { useMemo, useState, useEffect } from 'react'
import { IMPLEMENTATION_TYPE_COLORS, isClosedDeal } from '../../shared/constants'
import { formatCompactMillions, formatShortDate } from '../../shared/utils/formatters'
import { dealService } from '../../shared/services/dealService'
import useStore from '../../shared/useStore'
import './MetricsModule.css'

const FIELDS = [
  { key: 'opportunity_number', label: 'Opportunity #' },
  { key: 'client_name',        label: 'Client' },
  { key: 'status',             label: 'Status' },
  { key: 'project_name',       label: 'Description' },
  { key: 'lead_ssc',           label: 'Lead SSC' },
  { key: 'tcv',                label: 'TCV', format: 'currency' },
  { key: 'tt_executive',       label: 'TT Executive' },
  { key: 'implementation_type',label: 'Implementation Type' },
  { key: 'currency',           label: 'Currency' },
  { key: 'sector',             label: 'Sector' },
  { key: 'industry',           label: 'Industry' },
  { key: 'sc1',                label: 'Solution Consultant' },
  { key: 'sc2',                label: 'Solution Consultant 2' },
  { key: 'sc3',                label: 'Solution Consultant 3' },
  { key: 'sc4',                label: 'Solution Consultant 4' },
  { key: 'created_date',       label: 'Created Date', format: 'date' },
  { key: 'deal_type',          label: 'Deal Type' },
]

function resolveTcv(deal) {
  return deal.financials?.tcv || deal.estimated_value || deal.price_to_win || null
}

function formatField(value, format) {
  if (!value && value !== 0) return '—'
  if (format === 'currency') return formatCompactMillions(value)
  if (format === 'date') return formatShortDate(value)
  return String(value)
}

export default function MetricsModule({ deal }) {
  const implColor = IMPLEMENTATION_TYPE_COLORS[deal.implementation_type] || '#8d8d8d'
  const setCurrentDealId = useStore(s => s.setCurrentDealId)
  const [allDeals, setAllDeals] = useState([])

  useEffect(() => {
    dealService.list().then(setAllDeals).catch(console.error)
  }, [])

  const data = useMemo(() => ({
    opportunity_number: deal.opportunity_number,
    client_name: deal.client_name,
    status: deal.status,
    project_name: deal.project_name,
    lead_ssc: deal.lead_ssc,
    tcv: resolveTcv(deal),
    tt_executive: deal.tt_executive,
    implementation_type: deal.implementation_type,
    currency: deal.currency || deal.pti?.currency || 'USD',
    sector: deal.sector,
    industry: deal.industry,
    sc1: deal.resources?.specialists?.solution_consultant || '',
    sc2: deal.solution_consultant_2,
    sc3: deal.solution_consultant_3,
    sc4: deal.solution_consultant_4,
    created_date: deal.created_date,
    deal_type: deal.deal_type,
  }), [deal])

  // Summary KPIs
  const activities = deal.activities || []
  const totalAct = activities.length
  const doneAct = activities.filter(a => ['completed', 'approved', 'done'].includes(String(a.status || '').toLowerCase())).length
  const approvalPct = totalAct > 0 ? Math.round((doneAct / totalAct) * 100) : 0
  const timelineCount = (deal.timelines || []).length
  const gpPct = deal.financials?.gp_pct || deal.financials?.gp_percent || null

  // Similar deals: same impl type, sector, or industry — excluding current deal and closed
  const similarDeals = useMemo(() => {
    if (!allDeals.length) return []
    return allDeals.filter(d => {
      if (d.id === deal.id) return false
      if (isClosedDeal(d)) return false
      const matchImpl = deal.implementation_type && d.implementation_type === deal.implementation_type
      const matchSector = deal.sector && d.sector === deal.sector
      const matchIndustry = deal.industry && d.industry === deal.industry
      return matchImpl || matchSector || matchIndustry
    }).map(d => {
      let score = 0
      if (d.implementation_type === deal.implementation_type) score += 3
      if (d.sector === deal.sector) score += 2
      if (d.industry === deal.industry) score += 1
      return { ...d, _score: score }
    }).sort((a, b) => b._score - a._score)
  }, [allDeals, deal])

  return (
    <div className="metrics-module">
      {/* KPI strip */}
      <div className="metrics-kpi-strip">
        <div className="metrics-kpi">
          <span className="metrics-kpi-value">{data.tcv ? formatCompactMillions(data.tcv) : '—'}</span>
          <span className="metrics-kpi-label">TCV</span>
        </div>
        <div className="metrics-kpi">
          <span className="metrics-kpi-value">{gpPct != null ? `${gpPct}%` : '—'}</span>
          <span className="metrics-kpi-label">GP %</span>
        </div>
        <div className="metrics-kpi">
          <span className="metrics-kpi-value">{doneAct}/{totalAct}</span>
          <span className="metrics-kpi-label">Approvals ({approvalPct}%)</span>
        </div>
        <div className="metrics-kpi">
          <span className="metrics-kpi-value">{timelineCount}</span>
          <span className="metrics-kpi-label">Timelines</span>
        </div>
      </div>

      {/* Detail card */}
      <div className="metrics-detail-card glass-panel">
        <div className="metrics-detail-header">
          <span className="metrics-detail-impl" style={{ color: implColor }}>{deal.implementation_type || 'SAP'}</span>
          <span className="metrics-detail-status">{deal.status}</span>
        </div>
        <div className="metrics-detail-grid">
          {FIELDS.map(f => (
            <div key={f.key} className="metrics-field">
              <span className="metrics-field-label">{f.label}</span>
              <span className="metrics-field-value">{formatField(data[f.key], f.format)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Similar Deals */}
      {similarDeals.length > 0 && (
        <div className="metrics-similar">
          <div className="metrics-similar-header">
            <span className="metrics-similar-title">Similar Deals</span>
            <span className="metrics-similar-count">{similarDeals.length}</span>
          </div>
          <div className="metrics-similar-grid">
            {similarDeals.map(d => {
              const dImplColor = IMPLEMENTATION_TYPE_COLORS[d.implementation_type] || '#8d8d8d'
              const actTotal = (d.activities || []).length
              const actDone = (d.activities || []).filter(a => ['completed','approved','done'].includes(`${a.status||''}`.toLowerCase())).length
              const approvalPct = actTotal > 0 ? Math.round((actDone / actTotal) * 100) : 0
              const tcv = d.financials?.tcv || d.estimated_value || d.price_to_win
              const matchTags = []
              if (d.implementation_type === deal.implementation_type) matchTags.push(d.implementation_type)
              if (d.sector === deal.sector) matchTags.push(d.sector)
              if (d.industry === deal.industry && d.industry) matchTags.push(d.industry)

              return (
                <div key={d.id} className="deal-card metrics-deal-card" onClick={() => setCurrentDealId(d.id)}
                  style={{ '--card-accent': dImplColor }}>
                  <div className="deal-card-accent" />
                  <div className="deal-card-body">
                    <div className="deal-card-tag-row">
                      <span className="deal-card-impl-tag" style={{ '--impl-c': dImplColor }}>{d.implementation_type || 'SAP'}</span>
                      {d.sector && <span className="deal-card-sector">{d.sector}</span>}
                    </div>
                    <h3 className="deal-card-title">{d.project_name?.split(' - ')[0] || d.project_name}</h3>
                    <div className="deal-card-client">{d.client_name}</div>
                    <div className="metrics-match-tags">
                      {matchTags.map(t => <span key={t} className="metrics-match-tag">{t}</span>)}
                    </div>
                    {actTotal > 0 && (
                      <div className="deal-card-approval">
                        <div className="deal-card-approval-bar">
                          <div className="deal-card-approval-fill" style={{ width: `${approvalPct}%` }} />
                        </div>
                        <span className="deal-card-approval-label">{actDone}/{actTotal}</span>
                      </div>
                    )}
                    <div className="deal-card-footer">
                      <span className="deal-card-opp">{d.opportunity_number}</span>
                      {tcv > 0 && <span className="deal-card-stat-value tcv">{formatCompactMillions(tcv)}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
