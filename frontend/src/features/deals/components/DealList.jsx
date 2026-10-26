import { useState, useMemo } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { IMPLEMENTATION_TYPE_COLORS, CLOSED_STATUSES } from '../../../shared/constants'
import { formatShortDate, formatCompactMillions } from '../../../shared/utils/formatters'
import { SearchIcon } from '../../../shared/ui/Icons'
import { cx } from '../../../shared/utils/cx'
import PipelineMetrics from './PipelineMetrics'

function resolveTcv(deal) {
  return deal.financials?.tcv || deal.estimated_value || deal.price_to_win || null
}

export default function DealList({ deals, viewMode, layoutMode, onSelectDeal, onArchiveDeal, onRestoreDeal, onCreateDeal }) {
  const [searchTerm, setSearchTerm] = useState('')

  const activeDeals = useMemo(() => deals.filter(d => !CLOSED_STATUSES.includes(d.status)), [deals])
  const closedDeals = useMemo(() => deals.filter(d => CLOSED_STATUSES.includes(d.status)), [deals])

  const filter = (list) => {
    if (!searchTerm) return list
    const t = searchTerm.toLowerCase()
    return list.filter(d =>
      d.project_name?.toLowerCase().includes(t) ||
      d.client_name?.toLowerCase().includes(t) ||
      d.opportunity_number?.toLowerCase().includes(t) ||
      d.sector?.toLowerCase().includes(t) ||
      d.implementation_type?.toLowerCase().includes(t)
    )
  }

  const shown = filter(viewMode === 'active' ? activeDeals : closedDeals)

  // Pipeline summary stats
  const stats = useMemo(() => {
    const list = viewMode === 'active' ? activeDeals : closedDeals
    const totalTcv = list.reduce((sum, d) => sum + (Number(resolveTcv(d)) || 0), 0)
    const totalActs = list.reduce((s, d) => s + (d.activities?.length || 0), 0)
    const doneActs = list.reduce((s, d) => s + (d.activities || []).filter(a => ['completed','approved','done'].includes(`${a.status||''}`.toLowerCase())).length, 0)
    const withTimelines = list.filter(d => (d.timelines || []).length > 0).length
    return { count: list.length, totalTcv, totalActs, doneActs, withTimelines }
  }, [activeDeals, closedDeals, viewMode])

  // Implementation-type mix (moved out of the header — content, not chrome)
  const typeMix = useMemo(() => {
    const counts = {}
    activeDeals.forEach(d => {
      const t = d.implementation_type || 'Other'
      counts[t] = (counts[t] || 0) + 1
    })
    return Object.entries(counts)
  }, [activeDeals])

  return (
    <div className="deal-list-container">
      {/* Pipeline command band */}
      <div className="pipeline-band">
        <div className="pband-kpis">
          <div className="pband-kpi">
            <span className="pband-value">{stats.count}</span>
            <span className="pband-label">Deals</span>
          </div>
          <div className="pband-kpi">
            <span className="pband-value">{stats.totalTcv > 0 ? formatCompactMillions(stats.totalTcv) : '—'}</span>
            <span className="pband-label">Pipeline TCV</span>
          </div>
          <div className="pband-kpi">
            <span className="pband-value">{stats.doneActs}<span className="pband-value-dim">/{stats.totalActs}</span></span>
            <span className="pband-label">Approvals</span>
          </div>
          <div className="pband-kpi">
            <span className="pband-value">{stats.withTimelines}</span>
            <span className="pband-label">Timelines</span>
          </div>
        </div>

        {typeMix.length > 0 && (
          <div className="pband-mix">
            {typeMix.map(([type, count]) => (
              <span key={type} className="chip" style={{ '--impl-c': IMPLEMENTATION_TYPE_COLORS[type] || '#8d8d8d' }}>
                <i className="chip-swatch" style={{ background: IMPLEMENTATION_TYPE_COLORS[type] || '#8d8d8d' }} />
                {type} <strong>{count}</strong>
              </span>
            ))}
          </div>
        )}

        <div className="deals-search-float">
          <SearchIcon className="search-icon" />
          <input
            type="text"
            className="search-input-compact"
            placeholder="Filter..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="search-clear" onClick={() => setSearchTerm('')}>×</button>
          )}
        </div>
      </div>

      {layoutMode === 'metrics' ? (
        <PipelineMetrics deals={shown} onSelectDeal={onSelectDeal} />
      ) : (
      <div className="deals-grid">
        <LayoutGroup>
        <AnimatePresence mode="popLayout">
        {shown.length > 0 ? shown.map((deal) => {
          const implColor = IMPLEMENTATION_TYPE_COLORS[deal.implementation_type] || '#8d8d8d'
          const actCount = (deal.activities || []).length
          const doneCount = (deal.activities || []).filter(a => ['completed','approved','done'].includes(`${a.status||''}`.toLowerCase())).length
          const approvalPct = actCount > 0 ? Math.round((doneCount / actCount) * 100) : 0
          const tcv = resolveTcv(deal)
          const timelineCount = (deal.timelines || []).length
          const gpPct = deal.financials?.gp_percent || deal.financials?.gp_pct || null

          return (
            <motion.div
              key={deal.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, layout: { type: 'spring', damping: 25, stiffness: 300 } }}
              className="deal-card"
              onClick={() => onSelectDeal(deal.id)}
              style={{ '--card-accent': implColor }}
            >
              <div className="deal-card-accent" />
              <div className="deal-card-body">
                {/* Header: impl tag + sector */}
                <div className="deal-card-tag-row">
                  <span className="deal-card-impl-tag" style={{ '--impl-c': implColor }}>{deal.implementation_type || 'SAP'}</span>
                  {deal.sector && <span className="deal-card-sector">{deal.sector}</span>}
                </div>

                {/* Title + client */}
                <h3 className="deal-card-title">{deal.project_name?.split(' - ')[0] || deal.project_name}</h3>
                <div className="deal-card-client">{deal.client_name}</div>

                {/* Stats row: TCV, GP%, Timelines */}
                <div className="deal-card-stats">
                  {tcv > 0 && (
                    <div className="deal-card-stat">
                      <span className="deal-card-stat-value tcv">{formatCompactMillions(tcv)}</span>
                      <span className="deal-card-stat-label">TCV</span>
                    </div>
                  )}
                  {gpPct != null && (
                    <div className="deal-card-stat">
                      <span className="deal-card-stat-value">{gpPct}%</span>
                      <span className="deal-card-stat-label">GP</span>
                    </div>
                  )}
                  {timelineCount > 0 && (
                    <div className="deal-card-stat">
                      <span className="deal-card-stat-value">{timelineCount}</span>
                      <span className="deal-card-stat-label">{timelineCount === 1 ? 'Timeline' : 'Timelines'}</span>
                    </div>
                  )}
                </div>

                {/* Approval bar */}
                {actCount > 0 && (
                  <div className="deal-card-approval">
                    <div className="deal-card-approval-bar">
                      <div className="deal-card-approval-fill" style={{ width: `${approvalPct}%` }} />
                    </div>
                    <span className="deal-card-approval-label">{doneCount}/{actCount} approvals</span>
                  </div>
                )}

                {/* Footer */}
                <div className="deal-card-footer">
                  <span className="deal-card-opp">{deal.opportunity_number}</span>
                  {viewMode === 'active' && (
                    <button className="deal-archive-link" onClick={(e) => { e.stopPropagation(); onArchiveDeal?.(deal.id) }}>Archive</button>
                  )}
                  {viewMode === 'archives' && (
                    <button className="deal-restore-link" onClick={(e) => { e.stopPropagation(); onRestoreDeal?.(deal.id) }}>Restore</button>
                  )}
                </div>
              </div>
            </motion.div>
          )
        }) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="no-deals"
          >
            <div className="no-deals-icon">📋</div>
            <p>No deals found</p>
            <span>{searchTerm ? 'Try a different filter term.' : 'Get started by creating your first deal.'}</span>
            {!searchTerm && (
              <div style={{ marginTop: '0.75rem' }}>
                <button className="btn btn-primary" onClick={onCreateDeal}>+ New Deal</button>
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>
        </LayoutGroup>
      </div>
      )}
    </div>
  )
}
