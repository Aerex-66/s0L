import { lazy, Suspense, useState, useMemo } from 'react'
import { AlertTriangle, Check, Circle, SlidersHorizontal } from 'lucide-react'
import { dealService } from '../../shared/services/dealService'
import { MODULE_TAB_REGISTRIES } from '../../shell/dealShell'
import WorkspaceTabs from '../../shared/ui/WorkspaceTabs'
import Loader from '../../shared/ui/Loader'
import useStore from '../../shared/useStore'
import { formatCompactMillions } from '../../shared/utils/formatters'
import { dealStatusColor } from '../../shared/constants/uiStates'
import { STAGES, computeStageReadiness } from './stageReadiness'
import { daysBetween } from './dates'

const Overview = lazy(() => import('./components/Overview'))
const Timeline = lazy(() => import('./components/Timeline'))
const Activities = lazy(() => import('./components/Activities'))
const Calendar = lazy(() => import('./components/Calendar'))
const Contacts = lazy(() => import('./components/Contacts'))
const Financials = lazy(() => import('./components/Financials'))
const Resources = lazy(() => import('./components/Resources'))

const TABS = MODULE_TAB_REGISTRIES.home

const TAB_COMPONENTS = { overview: Overview, timeline: Timeline, activities: Activities, financials: Financials, resources: Resources, calendar: Calendar, contacts: Contacts }

/** Home reads the deal from the shared store; every save calls onUpdate so all modules see it. */
export default function DealView({ deal, onUpdate }) {
  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const [selectedStageId, setSelectedStageId] = useState(null)
  const [stageWarning, setStageWarning] = useState(null)
  const { setShowActionModal } = useStore()

  const stageReadiness = useMemo(() => computeStageReadiness(deal), [deal])

  const completedStages = Object.values(stageReadiness).filter((s) => s.complete).length
  const selectedStage = STAGES.find(s => s.id === selectedStageId) || null
  const selectedR = selectedStage ? (stageReadiness[selectedStage.id] || { done: 0, total: 3, pct: 0, status: 'todo', manualComplete: false }) : null

  const toggleStageComplete = async (stageId) => {
    const current = deal.workflow_stage_manual || {}
    const markingComplete = !current[stageId]
    const next = { ...current, [stageId]: markingComplete }
    try {
      await dealService.update(deal.id, { workflow_stage_manual: next })
      // Show transient warning if marking complete with incomplete checks
      if (markingComplete) {
        const r = stageReadiness[stageId]
        if (r && r.done < r.total) {
          const label = STAGES.find(s => s.id === stageId)?.label || stageId
          setStageWarning(`${label} marked complete with ${r.done}/${r.total} checks done`)
          setTimeout(() => setStageWarning(null), 4000)
        }
      } else {
        setStageWarning(null)
      }
      onUpdate?.()
    } catch (error) {
      console.error('Error toggling stage:', error)
    }
  }

  if (!deal) return <div className="error">Deal not found</div>

  const ActiveComponent = TAB_COMPONENTS[activeTab]

  const tcv = Number(deal.financials?.tcv || deal.estimated_value || deal.price_to_win) || 0
  const statusDays = daysBetween(deal.status_changed_at)

  return (
    <div className="deal-view">
      {/* ── Deal hero: who the deal is for, what it's worth, how ready it is ── */}
      <section className="deal-hero">
        <div className="deal-hero-top">
          <div className="deal-hero-identity">
            <div className="deal-hero-eyebrow">
              <span className="deal-hero-status">
                <i className="deal-status-dot" style={{ '--status-c': dealStatusColor(deal.status) }} aria-hidden="true" />
                {deal.status || 'No status'}
                {statusDays != null && (
                  <span className="deal-hero-since">{statusDays === 0 ? 'since today' : `for ${statusDays} day${statusDays === 1 ? '' : 's'}`}</span>
                )}
              </span>
              {deal.implementation_type && <><i className="deal-hero-sep" aria-hidden="true" /><span>{deal.implementation_type}</span></>}
              {deal.monday_group && <><i className="deal-hero-sep" aria-hidden="true" /><span>{deal.monday_group}</span></>}
            </div>
            <h2 className="deal-hero-client">{deal.client_name || deal.project_name || 'Untitled deal'}</h2>
            {deal.client_name && deal.project_name && <p className="deal-hero-desc">{deal.project_name}</p>}
          </div>
          <div className="deal-hero-side">
            <div className="deal-hero-tcv">
              <span className={`deal-hero-tcv-value${tcv ? '' : ' is-empty'}`}>{tcv ? formatCompactMillions(tcv) : 'No TCV yet'}</span>
              <span className="deal-hero-tcv-label">TCV{deal.currency && deal.currency !== 'USD' ? ` · ${deal.currency}` : ''}</span>
            </div>
            <button type="button" className="cmd-btn deal-hero-setup" onClick={() => setShowActionModal(true)}>
              <SlidersHorizontal size={13} /> Quick setup
            </button>
          </div>
        </div>

        <div className="deal-hero-readiness">
          <span className="deal-hero-readiness-title">Readiness</span>
          <span className="deal-hero-readiness-note">{completedStages} of {STAGES.length} stages complete · pick a stage to see its checks</span>
        </div>
        <div className="stage-rail-inline" role="group" aria-label="Deal stages">
          {STAGES.map((stage) => {
            const r = stageReadiness[stage.id] || { status: 'todo', pct: 0, done: 0, total: 3 }
            const isSelected = selectedStageId === stage.id
            const hasIncompleteOverride = r.manualComplete && r.done < r.total
            return (
              <button
                key={stage.id}
                type="button"
                aria-pressed={isSelected}
                title={`${stage.label}: ${r.done} of ${r.total} checks done`}
                className={`stage-chip status-${r.status} ${isSelected ? 'selected' : ''} ${hasIncompleteOverride ? 'has-warning' : ''}`}
                onClick={() => setSelectedStageId(isSelected ? null : stage.id)}
              >
                <span className="stage-chip-head">
                  <span className="stage-chip-indicator" />
                  <span className="stage-chip-label">{stage.label}</span>
                  <span className="stage-chip-count">
                    {r.status === 'complete' ? <Check size={12} aria-label="Complete" /> : `${r.done}/${r.total}`}
                  </span>
                  {hasIncompleteOverride && <AlertTriangle size={12} className="stage-chip-warn" aria-label="Marked complete with checks open" />}
                </span>
                <span className="stage-chip-bar" aria-hidden="true"><i style={{ width: `${r.complete ? 100 : r.pct}%` }} /></span>
              </button>
            )
          })}
        </div>

        {/* Transient warning banner */}
        {stageWarning && (
          <div className="stage-warning-banner" role="status">
            <AlertTriangle size={14} className="stage-warning-icon" aria-hidden="true" />
            <span>{stageWarning}</span>
          </div>
        )}
      </section>

      {/* ── Selected stage detail (inline expand) ── */}
      {selectedStage && selectedR && (
        <section className="stage-detail">
          <div className="stage-detail-header">
            <div>
              <strong>{selectedStage.label}</strong>
              <p className="stage-detail-objective">{selectedStage.objective}</p>
            </div>
            <div className="stage-detail-actions">
              {selectedStage.tabs.map((tabId, i) => (
                <button
                  key={tabId}
                  className={`btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setActiveTab(tabId); setSelectedStageId(null) }}
                >
                  Open {TABS.find(t => t.id === tabId)?.label}
                </button>
              ))}
              <button
                className={`btn btn-sm ${selectedR.manualComplete ? 'btn-success' : 'btn-secondary'}`}
                onClick={() => toggleStageComplete(selectedStage.id)}
              >
                {selectedR.manualComplete ? <><Check size={13} /> Complete</> : 'Mark complete'}
              </button>
            </div>
          </div>
          <div className="stage-detail-checks">
            {selectedStage.events.map((ev, i) => {
              const done = Boolean(selectedR.checks?.[i])
              return (
                <span key={ev} className={`stage-check ${done ? 'done' : ''}`}>
                  {done ? <Check size={12} className="stage-check-icon" /> : <Circle size={11} className="stage-check-icon" />}
                  {ev}
                </span>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Tab Navigation ── */}
      <WorkspaceTabs
        tabs={TABS}
        activeTab={activeTab}
        onSelect={setActiveTab}
        deal={deal}
      />

      {/* ── Content Area ── */}
      <div className="workspace-content">
        <Suspense fallback={<Loader />}>
          {ActiveComponent && <ActiveComponent deal={deal} onUpdate={onUpdate} stageReadiness={stageReadiness} onOpenTab={setActiveTab} />}
        </Suspense>
      </div>
    </div>
  )
}
