import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Mail } from 'lucide-react'
import { dealService } from '../../../shared/services/dealService'
import { directoryService } from '../../../shared/services/directoryService'
import { describeRoles } from '../../../shared/utils/directory'
import { isOptionalApproval } from '../../../shared/utils/approvals'
import { WORK_STATUS_OPTIONS, getWorkStatusStyle } from '../../../shared/constants'
import { approvalEmail, approverRecipients, dealLabel } from '../handoff'
import OutlookEmailButton from './OutlookEmailButton'

// ── Inline autocomplete input for approver names ──
function ApproverInput({ value, onChange, placeholder, suggestions, className }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return suggestions.slice(0, 8)
    const q = query.toLowerCase()
    return suggestions.filter(s => s.name.toLowerCase().includes(q)).slice(0, 8)
  }, [query, suggestions])

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="approver-ac-wrap" ref={wrapRef}>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); setQuery(e.target.value); setOpen(true) }}
        onFocus={() => { setQuery(value || ''); setOpen(true) }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="approver-ac-list">
          {filtered.map((s, i) => (
            <button key={s.id || i} className="approver-ac-item" onMouseDown={() => { onChange(s.name); setOpen(false) }}>
              <span className="approver-ac-name">{s.name}</span>
              {s.meta && <span className="approver-ac-meta">{s.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const CATEGORY_META = {
  service_area: { label: 'Service Area Leads · optional', description: 'SAL sign-offs per area in scope: an extra step, never a gate, and a SAL can delegate' },
  staffing: { label: 'Staffing', description: 'Resource & staffability confirmations' },
  specialist: { label: 'Specialist Reviews', description: 'Technical, risk, and governance reviews' },
  compliance: { label: 'Compliance & Documentation', description: 'Required compliance artifacts' },
  formal_gates: { label: 'Formal Review Gates', description: 'Sequential SRR / PRR approval gates' },
}

// Maps SAP application acronyms → service area keys used in approvals
const SAP_TO_SERVICE_AREA = {
  // RTR — Record to Report
  'FI': 'RTR', 'CO': 'RTR', 'AA': 'RTR', 'TRM': 'RTR', 'CM': 'RTR', 'CFIN': 'RTR',
  // OTC — Order to Cash
  'SD': 'OTC',
  // PTP/Ariba — Procure to Pay
  'MM': 'PTP/Ariba', 'Ariba': 'PTP/Ariba', 'Fieldglass': 'PTP/Ariba', 'Concur': 'PTP/Ariba',
  // FTP&L — Financial Planning & Analysis
  'PaPM': 'FTP&L',
  // Data
  'MDG': 'Data',
  // Analytics
  'SAC': 'SAC',
  // IBP
  'IBP': 'IBP',
  // Group Reporting
  'GR': 'Group Reporting',
  // OCM — always included if SuccessFactors or change-heavy
  'EC': 'OCM', 'RCM': 'OCM', 'LMS': 'OCM',
  // EPL — Enterprise Platforms (S/4HANA core)
  'S/4HANA': 'EPL',
  // Security
  // (no specific SAP app trigger — included by TCV/deal type)
}

// Derive which service areas are relevant from the deal's SAP app list
function deriveRelevantAreas(sapApps) {
  if (!sapApps || sapApps.length === 0) return null // null = no config yet, show all
  const areas = new Set()
  sapApps.forEach(app => {
    const area = SAP_TO_SERVICE_AREA[app]
    if (area) areas.add(area)
  })
  return areas
}

function categorizeActivity(act) {
  const ot = act.owner_type || ''
  if (ot === 'SAL' || ot === 'PAL') return 'service_area'
  if (ot === 'Staffing Lead' || ot === 'Program Manager') return 'staffing'
  if (['Deal Manager', 'Compliance Officer', 'Finance', 'Service Evaluator', 'Release Manager', 'Risk Assessor'].includes(ot)) return 'compliance'
  if (['Market Leader', 'Americas Leader', 'Strategy Lead'].includes(ot)) return 'formal_gates'
  return 'specialist'
}

function getServiceAreaPairs(activities) {
  const areas = {}
  activities.filter(a => categorizeActivity(a) === 'service_area').forEach(a => {
    const area = a.area || 'Unknown'
    if (!areas[area]) areas[area] = {}
    areas[area][a.owner_type] = a
  })
  return areas
}

// PAL is gone: an old PAL row only shows when someone put something in it.
const isFilled = (a) => Boolean(a && ((a.status && a.status !== 'Not Started') || a.reviewer_approver?.trim() || a.date || a.comments?.trim()))

export default function Activities({ deal, onUpdate, stageReadiness }) {
  const [savingStates, setSavingStates] = useState({})
  const [filter, setFilter] = useState('all')
  const [collapsedCats, setCollapsedCats] = useState({
    service_area: true, staffing: true, specialist: true, compliance: true, formal_gates: true
  })
  // Manual overrides: { [area]: true } means user force-enabled an area not auto-detected
  const [manualEnabled, setManualEnabled] = useState(() => deal.manual_enabled_areas || {})
  const [directory, setDirectory] = useState([])
  const debounceTimers = useRef({})

  // Load global directory for autocomplete + email lookup
  useEffect(() => {
    directoryService.people().then(d => { if (Array.isArray(d)) setDirectory(d) }).catch(() => {})
  }, [])

  // Build autocomplete suggestions from directory + deal contacts (deduped by name)
  const approverSuggestions = useMemo(() => {
    const seen = new Set()
    const result = []
    // Directory contacts first
    for (const c of directory) {
      if (!c.name?.trim() || seen.has(c.name)) continue
      seen.add(c.name)
      const meta = describeRoles(c)
      result.push({ id: c.id, name: c.name, email: c.email, meta })
    }
    // Then deal-level contacts
    for (const c of (deal.contacts || [])) {
      if (!c.name?.trim() || seen.has(c.name)) continue
      seen.add(c.name)
      result.push({ id: `deal-${c.id}`, name: c.name, email: c.email, meta: c.role || '' })
    }
    return result
  }, [directory, deal.contacts])

  // Email lookup: deal contacts win over the global directory
  const people = useMemo(() => [...(deal.contacts || []), ...directory], [deal.contacts, directory])
  const label = dealLabel(deal)

  // Cleanup debounce timers on unmount
  useEffect(() => {
    const timers = debounceTimers.current
    return () => {
      Object.values(timers).forEach(clearTimeout)
    }
  }, [])

  const activities = useMemo(() => deal.activities || [], [deal.activities])

  // Parse TCV from financials for specialist condition evaluation
  const tcv = useMemo(() => {
    const raw = deal.financials?.tcv ?? deal.estimated_value ?? deal.price_to_win ?? null
    if (raw === null || raw === '') return 0
    if (typeof raw === 'number') return raw
    const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''))
    if (isNaN(n)) {
      console.warn('TCV parse failed for value:', raw)
      return 0
    }
    return n
  }, [deal.financials?.tcv, deal.estimated_value, deal.price_to_win])

  // Areas derived from SAP app selection in the configurator
  const autoAreas = useMemo(() => deriveRelevantAreas(deal.sap_applications), [deal.sap_applications])

  // Is this service area in scope for this deal?
  const isAreaInScope = useCallback((area) => {
    if (manualEnabled[area]) return true      // user explicitly added it
    if (autoAreas === null) return true        // no SAP apps configured yet → show all
    return autoAreas.has(area)
  }, [autoAreas, manualEnabled])

  // Is this specialist activity applicable given current TCV?
  const isSpecialistApplicable = useCallback((act) => {
    const reqIf = act.required_if || 'always'
    if (reqIf === 'always') return true
    if (reqIf === 'custom' || reqIf === 'uses_impact' || reqIf === 'cross_border') return true
    if (reqIf === 'criteria') return true
    try {
      // Parse simple numeric conditions like "tcv > 5000000" safely
      const match = reqIf.match(/tcv\s*(>=|<=|>|<|==|!=)\s*(\d+(?:\.\d+)?)/)
      if (!match) return true
      const op = match[1]
      const threshold = Number(match[2])
      if (op === '>') return tcv > threshold
      if (op === '>=') return tcv >= threshold
      if (op === '<') return tcv < threshold
      if (op === '<=') return tcv <= threshold
      if (op === '==') return tcv === threshold
      if (op === '!=') return tcv !== threshold
      return true
    } catch {
      return true // default to showing if we can't parse
    }
  }, [tcv])

  const updateActivity = useCallback(async (activityId, field, value, immediate = false) => {
    const key = `${activityId}-${field}`
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key])
    setSavingStates(prev => ({ ...prev, [key]: 'saving' }))

    const performUpdate = async () => {
      try {
        await dealService.updateActivity(deal.id, activityId, { [field]: value })
        setSavingStates(prev => ({ ...prev, [key]: 'saved' }))
        setTimeout(() => setSavingStates(prev => ({ ...prev, [key]: null })), 2000)
        onUpdate()
      } catch (error) {
        console.error('Error updating activity:', error)
        setSavingStates(prev => ({ ...prev, [key]: 'error' }))
        setTimeout(() => setSavingStates(prev => ({ ...prev, [key]: null })), 3000)
      }
    }

    if (immediate) await performUpdate()
    else debounceTimers.current[key] = setTimeout(performUpdate, 800)
  }, [deal.id, onUpdate])

  const toggleManualArea = useCallback(async (area) => {
    const next = { ...manualEnabled, [area]: !manualEnabled[area] }
    setManualEnabled(next)
    try {
      await dealService.update(deal.id, { manual_enabled_areas: next })
    } catch { /* silent */ }
  }, [deal.id, manualEnabled])

  const toggleCat = (cat) => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }))

  const grouped = useMemo(() => {
    const g = { service_area: [], staffing: [], specialist: [], compliance: [], formal_gates: [] }
    activities.forEach(a => {
      const cat = categorizeActivity(a)
      if (g[cat]) g[cat].push(a)
    })
    return g
  }, [activities])

  const areaPairs = useMemo(() => getServiceAreaPairs(activities), [activities])

  // Map activity categories to stages for incomplete-override warning
  const CATEGORY_STAGE_MAP = {
    service_area: 'intake',
    staffing: 'solution-staffing',
    specialist: 'risk-compliance',
    compliance: 'risk-compliance',
    formal_gates: 'governance',
  }

  const hasCategoryWarning = useCallback((catKey) => {
    if (!stageReadiness) return false
    const stageId = CATEGORY_STAGE_MAP[catKey]
    if (!stageId) return false
    const r = stageReadiness[stageId]
    return r && r.manualComplete && r.done < r.total
  }, [stageReadiness])

  // Count only required, applicable items for summary (SAL sign-offs are optional)
  const statusCounts = useMemo(() => {
    const c = { total: 0, completed: 0, inProgress: 0, blocked: 0, notStarted: 0, na: 0 }
    activities.forEach(a => {
      if (isOptionalApproval(a)) return
      // Skip inapplicable specialist reviews
      if (categorizeActivity(a) === 'specialist' && !isSpecialistApplicable(a)) return
      const s = a.status || 'Not Started'
      c.total++
      if (s === 'Completed') c.completed++
      else if (s === 'In Progress') c.inProgress++
      else if (s === 'Blocked') c.blocked++
      else if (s === 'N/A') c.na++
      else c.notStarted++
    })
    return c
  }, [activities, isSpecialistApplicable])

  // One Outlook draft to every in-scope pending approver with an email on file
  const chase = useMemo(() => {
    const items = []
    const recipients = []
    activities.forEach(a => {
      const cat = categorizeActivity(a)
      if (cat === 'service_area' && !isAreaInScope(a.area)) return
      if (cat === 'specialist' && !isSpecialistApplicable(a)) return
      if (!a.reviewer_approver?.trim() || a.status === 'Completed' || a.status === 'N/A') return
      const found = approverRecipients(a.reviewer_approver, people)
      if (!found.length) return
      items.push({ who: a.reviewer_approver, activity: a.activity, status: a.status, date: a.date })
      found.forEach(r => { if (!recipients.some(x => x.email.toLowerCase() === r.email.toLowerCase())) recipients.push(r) })
    })
    return { message: approvalEmail({ label, recipients, items }), approvers: recipients.length, items: items.length }
  }, [activities, isAreaInScope, isSpecialistApplicable, people, label])

  const mailButton = (a) => {
    const done = a.status === 'Completed' || a.status === 'N/A'
    if (!a.reviewer_approver?.trim() || done) return <span className="approval-mail is-empty" aria-hidden="true" />
    const recipients = approverRecipients(a.reviewer_approver, people)
    const message = approvalEmail({
      label,
      recipients,
      items: [{ who: a.reviewer_approver, activity: a.activity, status: a.status, date: a.date }],
    })
    if (!message) {
      return (
        <span className="approval-mail is-missing" title={`No email on file for ${a.reviewer_approver} — add it in Outlook → Quick contacts`}>
          <Mail size={14} />
        </span>
      )
    }
    return (
      <OutlookEmailButton
        className="approval-mail"
        message={message}
        dealId={deal.id}
        title={`Email ${recipients.map(r => r.name).join(' & ')} in Outlook`}
        ariaLabel={`Email ${a.reviewer_approver} about ${a.activity}`}
      >
        <Mail size={14} />
      </OutlookEmailButton>
    )
  }

  const filterMatch = (a) => {
    if (filter === 'all') return true
    if (filter === 'pending') return a.status !== 'Completed' && a.status !== 'N/A'
    if (filter === 'completed') return a.status === 'Completed'
    if (filter === 'blocked') return a.status === 'Blocked'
    return true
  }

  const renderApprovalCard = (a) => {
    const sc = getWorkStatusStyle(a.status)
    const reqIf = a.required_if || ''
    return (
      <div key={a.id} className="approval-row" style={{ '--approval-accent': sc.color }}>
        <div className="approval-row-name">
          <span className="approval-name">{a.activity}</span>
          {reqIf && reqIf !== 'always' && (
            <span className="approval-condition" title={`Required if: ${reqIf}`}>{reqIf}</span>
          )}
        </div>
        <div className="approval-row-field approval-row-approver">
          <div className="approval-input-wrap">
            <ApproverInput
              value={a.reviewer_approver || ''}
              onChange={(val) => updateActivity(a.id, 'reviewer_approver', val)}
              placeholder={a.owner_type || 'Approver'}
              suggestions={approverSuggestions}
              className="approval-row-input"
            />
            {savingStates[`${a.id}-reviewer_approver`] === 'saving' && <span className="field-saving" />}
            {savingStates[`${a.id}-reviewer_approver`] === 'saved' && <span className="field-saved">✓</span>}
          </div>
          {mailButton(a)}
        </div>
        <div className="approval-row-field approval-row-date">
          <input
            type="date"
            value={a.date || ''}
            onChange={(e) => updateActivity(a.id, 'date', e.target.value, true)}
            className="approval-row-input"
          />
        </div>
        <div className="approval-row-field approval-row-status">
          <select
            value={a.status || 'Not Started'}
            onChange={(e) => updateActivity(a.id, 'status', e.target.value, true)}
            className="approval-row-select"
            style={{ color: sc.color, background: sc.bg }}
          >
            {WORK_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
        <div className="approval-row-field approval-row-notes">
          <div className="approval-input-wrap">
            <input
              type="text"
              value={a.comments || ''}
              onChange={(e) => updateActivity(a.id, 'comments', e.target.value)}
              placeholder="Notes..."
              className="approval-row-input"
            />
            {savingStates[`${a.id}-comments`] === 'saving' && <span className="field-saving" />}
            {savingStates[`${a.id}-comments`] === 'saved' && <span className="field-saved">✓</span>}
          </div>
        </div>
      </div>
    )
  }

  const renderCategorySection = (catKey, rawItems) => {
    const meta = CATEGORY_META[catKey]
    // For specialist reviews, filter by TCV applicability
    const items = catKey === 'specialist' ? rawItems.filter(isSpecialistApplicable) : rawItems
    const filtered = items.filter(filterMatch)
    const completed = items.filter(a => a.status === 'Completed').length
    const total = items.length
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    const isCollapsed = collapsedCats[catKey]
    const skipped = catKey === 'specialist' ? rawItems.length - items.length : 0

    if (catKey === 'service_area') return null // handled separately
    if (total === 0 && skipped === 0) return null // nothing to show

    return (
      <div key={catKey} className="approval-group">
        <button className="approval-group-header" onClick={() => toggleCat(catKey)}>
          <div className="approval-group-left">
            <span className="approval-group-chevron">{isCollapsed ? '▸' : '▾'}</span>
            <div className="approval-group-info">
              <span className="approval-group-title">
                {meta.label}
                {hasCategoryWarning(catKey) && <span className="category-warn-icon" title="Stage marked complete with unfinished checks">⚠</span>}
              </span>
              <span className="approval-group-desc">
                {meta.description}
                {skipped > 0 && ` · ${skipped} not applicable`}
              </span>
            </div>
          </div>
          <div className="approval-group-right">
            <span className="approval-group-count">{completed}<span className="approval-group-count-sep">/</span>{total}</span>
          </div>
        </button>
        {!isCollapsed && (
          <div className="approval-group-body">
            {filtered.length > 0 ? (
              <div className="approval-table">
                <div className="approval-table-header">
                  <span className="ath-name">Activity</span>
                  <span className="ath-field">Approver</span>
                  <span className="ath-field ath-date">Date</span>
                  <span className="ath-field ath-status">Status</span>
                  <span className="ath-field ath-notes">Notes</span>
                </div>
                {filtered.map(renderApprovalCard)}
              </div>
            ) : (
              <div className="approval-empty">No matching items</div>
            )}
          </div>
        )}
      </div>
    )
  }

  // For the service area section: separate in-scope vs out-of-scope
  const inScopeAreas = useMemo(() => Object.keys(areaPairs).filter(a => isAreaInScope(a)), [areaPairs, isAreaInScope])
  const outOfScopeAreas = useMemo(() => Object.keys(areaPairs).filter(a => !isAreaInScope(a)), [areaPairs, isAreaInScope])
  const configuredApps = deal.sap_applications && deal.sap_applications.length > 0

  const renderAreaCard = (area) => {
    const pair = areaPairs[area]
    const sal = pair.SAL
    const pal = isFilled(pair.PAL) ? pair.PAL : null
    const salStatus = sal ? getWorkStatusStyle(sal.status) : null
    const palStatus = pal ? getWorkStatusStyle(pal.status) : null

    return (
      <div key={area} className="area-pair-card">
        <div className="area-pair-header">
          <span className="area-pair-name">{area}</span>
        </div>
        <div className="area-pair-body">
          {sal && (
            <div className="area-approval-row">
              <span className="area-role-badge sal">SAL</span>
              <ApproverInput
                value={sal.reviewer_approver || ''}
                onChange={(val) => updateActivity(sal.id, 'reviewer_approver', val)}
                placeholder="Approver"
                suggestions={approverSuggestions}
                className="area-approver-input"
              />
              {mailButton(sal)}
              <select
                value={sal.status || 'Not Started'}
                onChange={(e) => updateActivity(sal.id, 'status', e.target.value, true)}
                className="area-status-select"
                style={{ color: salStatus.color, background: salStatus.bg }}
              >
                {WORK_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          )}
          {pal && (
            <div className="area-approval-row">
              <span className="area-role-badge pal">PAL</span>
              <ApproverInput
                value={pal.reviewer_approver || ''}
                onChange={(val) => updateActivity(pal.id, 'reviewer_approver', val)}
                placeholder="Approver"
                suggestions={approverSuggestions}
                className="area-approver-input"
              />
              {mailButton(pal)}
              <select
                value={pal.status || 'Not Started'}
                onChange={(e) => updateActivity(pal.id, 'status', e.target.value, true)}
                className="area-status-select"
                style={{ color: palStatus.color, background: palStatus.bg }}
              >
                {WORK_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="activities-container">
      {/* Summary strip */}
      <div className="approval-summary">
        <div className="approval-summary-stats">
          <span className="summary-stat" style={{ '--stat-color': 'var(--status-success)' }}>
            <span className="stat-num">{statusCounts.completed}</span> Approved
          </span>
          <span className="summary-stat" style={{ '--stat-color': 'var(--status-info)' }}>
            <span className="stat-num">{statusCounts.inProgress}</span> In Progress
          </span>
          <span className="summary-stat" style={{ '--stat-color': 'var(--status-error)' }}>
            <span className="stat-num">{statusCounts.blocked}</span> Blocked
          </span>
          <span className="summary-stat" style={{ '--stat-color': 'var(--status-gray)' }}>
            <span className="stat-num">{statusCounts.notStarted}</span> Pending
          </span>
        </div>
        <div className="approval-summary-actions">
          <div className="approval-filter-bar">
            {['all', 'pending', 'completed', 'blocked'].map(f => (
              <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {chase.message ? (
            <OutlookEmailButton
              className="btn btn-primary btn-sm"
              message={chase.message}
              dealId={deal.id}
              title={`One Outlook email to ${chase.approvers} approver${chase.approvers === 1 ? '' : 's'} covering ${chase.items} open item${chase.items === 1 ? '' : 's'}`}
            >
              <Mail size={14} /> Email Approvers
            </OutlookEmailButton>
          ) : (
            <span
              className="btn btn-primary btn-sm is-disabled"
              title="No pending approvers with an email on file — add emails in Outlook → Quick contacts"
            >
              <Mail size={14} /> Email Approvers
            </span>
          )}
        </div>
      </div>

      {/* Service Area Approvals — SAP-aware */}
      <div className="approval-group">
        <button className="approval-group-header" onClick={() => toggleCat('service_area')}>
          <div className="approval-group-left">
            <span className="approval-group-chevron">{collapsedCats.service_area ? '▸' : '▾'}</span>
            <div className="approval-group-info">
              <span className="approval-group-title">
                {CATEGORY_META.service_area.label}
                {hasCategoryWarning('service_area') && <span className="category-warn-icon" title="Stage marked complete with unfinished checks">⚠</span>}
              </span>
              <span className="approval-group-desc">
                {configuredApps
                  ? `${inScopeAreas.length} areas matched from ${deal.sap_applications.length} SAP applications`
                  : 'Configure SAP applications to auto-filter relevant areas'}
              </span>
            </div>
          </div>
          <div className="approval-group-right">
            <span className="area-relevance-hint">
              {inScopeAreas.length} of {Object.keys(areaPairs).length} in scope
            </span>
          </div>
        </button>
        {!collapsedCats.service_area && (
          <>
            {(() => {
              const visible = filter === 'all'
                ? inScopeAreas
                : inScopeAreas.filter(area => {
                    const pair = areaPairs[area]
                    return (pair.SAL && filterMatch(pair.SAL)) || (isFilled(pair.PAL) && filterMatch(pair.PAL))
                  })
              return visible.length > 0 ? (
                <div className="service-area-grid">
                  {visible.map(renderAreaCard)}
                </div>
              ) : inScopeAreas.length > 0 ? (
                <div className="approval-empty">No matching items</div>
              ) : null
            })()}
            {outOfScopeAreas.length > 0 && (
              <div className="out-of-scope-section">
                <div className="out-of-scope-header">
                  <span className="out-of-scope-label">Not in scope</span>
                  <span className="out-of-scope-hint">Based on SAP app selection. Click to add manually.</span>
                </div>
                <div className="out-of-scope-chips">
                  {outOfScopeAreas.map(area => (
                    <button
                      key={area}
                      className="out-of-scope-chip"
                      onClick={() => toggleManualArea(area)}
                      title={`Add ${area} to this deal's approvals`}
                    >
                      + {area}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Other categories */}
      {renderCategorySection('staffing', grouped.staffing)}
      {renderCategorySection('specialist', grouped.specialist)}
      {renderCategorySection('compliance', grouped.compliance)}
      {renderCategorySection('formal_gates', grouped.formal_gates)}
    </div>
  )
}
