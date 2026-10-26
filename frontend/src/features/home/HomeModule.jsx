import { lazy, Suspense, useState, useMemo } from 'react'
import { dealService } from '../../shared/services/dealService'
import { MODULE_TAB_REGISTRIES } from '../../shell/dealShell'
import WorkspaceTabs from '../../shared/ui/WorkspaceTabs'
import Loader from '../../shared/ui/Loader'
import useStore from '../../shared/useStore'
import { formatCompactMillions } from '../../shared/utils/formatters'
import { isDoneStatus } from '../../shared/constants/uiStates'
import { STAGES, computeStageReadiness } from './stageReadiness'

const Timeline = lazy(() => import('./components/Timeline'))
const Activities = lazy(() => import('./components/Activities'))
const Calendar = lazy(() => import('./components/Calendar'))
const Contacts = lazy(() => import('./components/Contacts'))
const Financials = lazy(() => import('./components/Financials'))
const Resources = lazy(() => import('./components/Resources'))

const TABS = MODULE_TAB_REGISTRIES.home

const TAB_COMPONENTS = { timeline: Timeline, activities: Activities, financials: Financials, resources: Resources, calendar: Calendar, contacts: Contacts }

/** Home reads the deal from the shared store; every save calls onUpdate so all modules see it. */
export default function DealView({ deal, onUpdate }) {
  const [activeTab, setActiveTab] = useState('timeline')
  const [selectedStageId, setSelectedStageId] = useState(null)
  const [stageWarning, setStageWarning] = useState(null)
  const { setShowActionModal } = useStore()

  const stageReadiness = useMemo(() => computeStageReadiness(deal), [deal])

  const completedStages = Object.values(stageReadiness).filter((s) => s.complete).length
  const overallPct = STAGES.length > 0 ? Math.round((completedStages / STAGES.length) * 100) : 0
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

  // Compute completed activities ratio
  const totalActivities = (deal.activities || []).length
  const completedActivities = (deal.activities || []).filter(a => isDoneStatus(a.status)).length

  return (
    <div className="deal-view">
      {/* ── Deal Hero with integrated stage rail ── */}
      <section className="deal-hero">
        <div className="deal-hero-top">
          <div className="deal-hero-stats">
            {deal.estimated_value && (
              <div className="hero-stat">
                <span className="hero-stat-label">Est. Value</span>
                <span className="hero-stat-value mono">{formatCompactMillions(deal.estimated_value)}</span>
              </div>
            )}
            <div className="hero-stat">
              <span className="hero-stat-label">Stage</span>
              <span className="hero-stat-value">{completedStages}/{STAGES.length}</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-label">Activities</span>
              <span className="hero-stat-value">{completedActivities}/{totalActivities}</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-label">Progress</span>
              <span className="hero-stat-value">{overallPct}%</span>
            </div>
          </div>
          <div className="deal-hero-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowActionModal(true)}>Configure</button>
          </div>
        </div>

        {/* Progress track */}
        <div className="deal-hero-progress">
          <div className="deal-hero-progress-track">
            {STAGES.map(stage => {
              const r = stageReadiness[stage.id] || { status: 'todo' }
              return <div key={stage.id} className={`progress-segment status-${r.status}`} />
            })}
          </div>
        </div>

        {/* Always-visible stage rail */}
        <div className="stage-rail-inline">
          {STAGES.map((stage) => {
            const r = stageReadiness[stage.id] || { status: 'todo', pct: 0, done: 0, total: 3 }
            const isSelected = selectedStageId === stage.id
            const hasIncompleteOverride = r.manualComplete && r.done < r.total
            return (
              <button
                key={stage.id}
                className={`stage-chip status-${r.status} ${isSelected ? 'selected' : ''} ${hasIncompleteOverride ? 'has-warning' : ''}`}
                onClick={() => setSelectedStageId(isSelected ? null : stage.id)}
              >
                <span className="stage-chip-indicator" />
                <span className="stage-chip-label">{stage.label}</span>
                <span className="stage-chip-count">
                  {r.status === 'complete' ? '✓' : `${r.done}/${r.total}`}
                </span>
                {hasIncompleteOverride && <span className="stage-chip-warn" title={`${r.done}/${r.total} checks done`}>⚠</span>}
              </button>
            )
          })}
        </div>

        {/* Transient warning banner */}
        {stageWarning && (
          <div className="stage-warning-banner">
            <span className="stage-warning-icon">⚠</span>
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
                {selectedR.manualComplete ? '✓ Complete' : 'Mark Complete'}
              </button>
            </div>
          </div>
          <div className="stage-detail-checks">
            {selectedStage.events.map((ev, i) => {
              const done = Boolean(selectedR.checks?.[i])
              return (
                <span key={ev} className={`stage-check ${done ? 'done' : ''}`}>
                  <span className="stage-check-icon">{done ? '✓' : '○'}</span>
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
          {ActiveComponent && <ActiveComponent deal={deal} onUpdate={onUpdate} stageReadiness={stageReadiness} />}
        </Suspense>
      </div>
    </div>
  )
}
