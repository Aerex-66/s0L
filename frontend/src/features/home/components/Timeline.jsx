import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { GanttChart } from 'lucide-react'
import QuickSetupWizard from './QuickSetupWizard'
import { dealService } from '../../../shared/services/dealService'
import ConfirmDialog from '../../../shared/ui/ConfirmDialog'
import { formatShortDateWithYear } from '../../../shared/utils/formatters'
import { DEAL_PHASE_TO_CODE, PHASE_CODE_TO_DEAL, PHASE_PALETTE } from '../../../shared/constants/gssmFieldMap'
import { isEditable } from '../../../shared/constants/fieldIndex'
import { PHASE_ORDER, matchPhase } from '../../../shared/utils/phases'

const GSSM_OWNED_NOTE = 'This timeline comes from the linked GSSM workbook (Imp TL). Edit it in the GSSM module.'

const CODE_ORDER = PHASE_ORDER.map(p => DEAL_PHASE_TO_CODE[p])

const getColor = (code) => PHASE_PALETTE[code]?.color || '#6f6f6f'
const getLabel = (code) => PHASE_PALETTE[code]?.label || PHASE_CODE_TO_DEAL[code] || code

/* ── Month axis ── */
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function buildAxis(startDate, count) {
  const fallback = Array.from({ length: count }, (_, i) => ({ month: `M${i + 1}`, year: '', yearStart: false }))
  if (!startDate || !count) return fallback
  const d = new Date(startDate)
  if (isNaN(d.getTime())) return fallback
  return Array.from({ length: count }, (_, i) => {
    const m = new Date(d)
    m.setMonth(m.getMonth() + i)
    const yearStart = i === 0 || m.getMonth() === 0
    return {
      month: MO[m.getMonth()],
      year: `’${String(m.getFullYear()).slice(-2)}`,
      yearStart,
    }
  })
}

/**
 * Convert deal timeline phases into per-month column tokens.
 */
function phasesToCols(phaseMap, totalDuration) {
  // Build a normalized map: canonical phase → total duration
  const normalized = {}
  for (const [key, d] of Object.entries(phaseMap || {})) {
    const phase = matchPhase(key)
    if (!phase || !d) continue
    const months = d.unit === 'weeks' ? Math.ceil(d.duration / 4.33) : (d.duration || 0)
    normalized[phase] = (normalized[phase] || 0) + months
  }

  const cols = []
  for (const phase of PHASE_ORDER) {
    const months = normalized[phase] || 0
    const code = DEAL_PHASE_TO_CODE[phase] || ''
    for (let i = 0; i < months; i++) cols.push(code)
  }
  const total = Math.max(cols.length, totalDuration || 0)
  while (cols.length < total) cols.push('')
  return { cols, totalMonths: total }
}

/**
 * Convert per-month column tokens back into deal phase structure.
 */
function colsToPhases(cols) {
  const phases = {}
  let i = 0
  while (i < cols.length) {
    const code = cols[i]
    if (!code) { i++; continue }
    const phaseName = PHASE_CODE_TO_DEAL[code]
    if (!phaseName) { i++; continue }
    let count = 0
    while (i < cols.length && cols[i] === code) { count++; i++ }
    if (phases[phaseName]) {
      phases[phaseName] = { duration: phases[phaseName].duration + count, unit: 'months' }
    } else {
      phases[phaseName] = { duration: count, unit: 'months' }
    }
  }
  return { timeline: phases, total_duration: cols.length }
}

/**
 * Build segments from cols for rendering.
 */
function colsToSegments(cols) {
  const segments = []
  let i = 0
  while (i < cols.length) {
    if (!cols[i]) { i++; continue }
    const token = cols[i]
    const start = i
    while (i < cols.length && cols[i] === token) i++
    segments.push({ token, start, span: i - start })
  }
  return segments
}


export default function Timeline({ deal, onUpdate }) {
  const [showAddTimeline, setShowAddTimeline] = useState(false)
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState(null)
  const [localTimelines, setLocalTimelines] = useState(deal.timelines || [])
  const [activeCode, setActiveCode] = useState('PR')
  const [isPainting, setIsPainting] = useState(false)
  const [strokeHistory, setStrokeHistory] = useState([])
  const strokeRef = useRef(null)
  const saveTimer = useRef(null)

  useEffect(() => { setLocalTimelines(deal.timelines || []) }, [deal.timelines])

  const debouncedSave = useCallback((next) => {
    setLocalTimelines(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await dealService.updateTimeline(deal.id, { timelines: next })
        onUpdate()
      } catch (e) { console.error('Timeline save failed:', e) }
    }, 600)
  }, [deal.id, onUpdate])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const laneData = useMemo(() => {
    return localTimelines.map((tl, idx) => {
      const { cols, totalMonths } = phasesToCols(tl.timeline || {}, tl.total_duration)
      const segments = colsToSegments(cols)
      return {
        index: idx,
        name: tl.name || `Timeline ${idx + 1}`,
        startDate: tl.project_start_date || '',
        totalMonths,
        cols,
        segments,
      }
    })
  }, [localTimelines])

  const maxMonths = useMemo(() => Math.max(...laneData.map(l => l.totalMonths), 1), [laneData])
  const monthLabels = useMemo(() => {
    const first = laneData.find(l => l.startDate)
    return buildAxis(first?.startDate, maxMonths)
  }, [laneData, maxMonths])

  const usedCodes = useMemo(() => {
    const set = new Set()
    for (const l of laneData) for (const s of l.segments) set.add(s.token)
    return CODE_ORDER.filter(c => set.has(c))
  }, [laneData])

  /* ── Painting ── */
  const applyPaint = useCallback((laneIdx, colIdx, token) => {
    const tl = localTimelines[laneIdx]
    if (!tl) return
    const { cols } = phasesToCols(tl.timeline || {}, tl.total_duration)
    while (cols.length <= colIdx) cols.push('')
    const old = cols[colIdx]
    if (old === token) return

    if (strokeRef.current) {
      const key = `${laneIdx}:${colIdx}`
      if (!strokeRef.current[key]) strokeRef.current[key] = { laneIdx, colIdx, old }
    }

    cols[colIdx] = token
    const { timeline, total_duration } = colsToPhases(cols)
    const next = [...localTimelines]
    next[laneIdx] = { ...next[laneIdx], timeline, total_duration }
    debouncedSave(next)
  }, [localTimelines, debouncedSave])

  const resolveCol = (e, totalCols) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || totalCols <= 0) return null
    const x = e.clientX - rect.left
    return Math.min(totalCols - 1, Math.max(0, Math.floor((x / rect.width) * totalCols)))
  }

  const handleTrackMouseDown = (e, laneIdx, totalCols) => {
    if (e.button !== 0) return
    strokeRef.current = {}
    setIsPainting(true)
    const col = resolveCol(e, totalCols)
    if (col !== null) applyPaint(laneIdx, col, activeCode)
  }

  const handleTrackMouseMove = (e, laneIdx, totalCols) => {
    if (!isPainting) return
    const col = resolveCol(e, totalCols)
    if (col !== null) applyPaint(laneIdx, col, activeCode)
  }

  const handleTrackContextMenu = (e, laneIdx, totalCols) => {
    e.preventDefault()
    strokeRef.current = {}
    const col = resolveCol(e, totalCols)
    if (col !== null) applyPaint(laneIdx, col, '')
    commitStroke()
  }

  const commitStroke = () => {
    if (!strokeRef.current) return
    const changes = Object.values(strokeRef.current)
    strokeRef.current = null
    if (changes.length) {
      setStrokeHistory(prev => [...prev, changes].slice(-30))
    }
  }

  const endPainting = () => {
    if (!isPainting) return
    setIsPainting(false)
    commitStroke()
  }

  const handleUndo = useCallback(() => {
    if (!strokeHistory.length) return
    const last = strokeHistory[strokeHistory.length - 1]
    setStrokeHistory(prev => prev.slice(0, -1))
    const next = localTimelines.map((tl, lIdx) => {
      const editsForLane = last.filter(c => c.laneIdx === lIdx)
      if (!editsForLane.length) return tl
      const { cols } = phasesToCols(tl.timeline || {}, tl.total_duration)
      for (const edit of editsForLane) {
        while (cols.length <= edit.colIdx) cols.push('')
        cols[edit.colIdx] = edit.old
      }
      const { timeline, total_duration } = colsToPhases(cols)
      return { ...tl, timeline, total_duration }
    })
    debouncedSave(next)
  }, [strokeHistory, localTimelines, debouncedSave])

  /* ── Field editing ── */
  const handleFieldChange = useCallback((idx, field, value) => {
    const next = [...localTimelines]
    next[idx] = { ...next[idx], [field]: value }
    debouncedSave(next)
  }, [localTimelines, debouncedSave])

  const handleAddDuration = useCallback((idx, amount) => {
    const tl = localTimelines[idx]
    if (!tl) return
    const { cols } = phasesToCols(tl.timeline || {}, tl.total_duration)
    const newTotal = Math.max(1, cols.length + amount)
    if (amount > 0) {
      while (cols.length < newTotal) cols.push('')
    } else {
      cols.length = newTotal
    }
    const { timeline, total_duration } = colsToPhases(cols)
    const next = [...localTimelines]
    next[idx] = { ...next[idx], timeline, total_duration }
    debouncedSave(next)
  }, [localTimelines, debouncedSave])

  const handleRemoveLane = useCallback((idx) => setPendingDeleteIndex(idx), [])
  const locked = !isEditable('timelines', deal)

  if (!localTimelines.length && !showAddTimeline) {
    const boardDates = deal.project_start_date && deal.project_end_date
      ? ` The board has the project running ${formatShortDateWithYear(deal.project_start_date)} → ${formatShortDateWithYear(deal.project_end_date)}.`
      : ''
    return (
      <div className="htl-root">
        <div className="ws-empty">
          <span className="ws-empty-icon" aria-hidden="true"><GanttChart size={22} strokeWidth={1.5} /></span>
          <h3 className="ws-empty-title">No timeline yet</h3>
          {locked ? (
            <p className="ws-empty-text">{GSSM_OWNED_NOTE}</p>
          ) : (
            <>
              <p className="ws-empty-text">
                Lay out the SAP Activate phases and rollout lanes, or link the GSSM workbook and its Imp TL sheet fills this in.{boardDates}
              </p>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddTimeline(true)}>+ Add timeline</button>
            </>
          )}
        </div>
        {showAddTimeline && (
          <QuickSetupWizard deal={deal} onComplete={() => { setShowAddTimeline(false); onUpdate() }} mode="timeline" />
        )}
      </div>
    )
  }

  return (
    <div className="htl-root" onMouseUp={endPainting} onMouseLeave={endPainting}>
      {/* Toolbar */}
      <div className="htl-toolbar">
        <span className="htl-toolbar-title">
          {laneData.length} Timeline{laneData.length !== 1 ? 's' : ''}
          <span className="htl-toolbar-months">{maxMonths} months</span>
        </span>
        {!locked && <button className="btn btn-primary btn-sm" onClick={() => setShowAddTimeline(true)}>+ Timeline</button>}
      </div>

      {/* Phase brush palette (hidden once GSSM owns the timeline) */}
      {locked ? (
        <div className="toolbar-strip">
          <span className="toolbar-strip-hint">{GSSM_OWNED_NOTE}</span>
        </div>
      ) : (
      <div className="toolbar-strip">
        <div className="toolbar-strip-group">
          <span className="toolbar-strip-label">Phase brush</span>
          {CODE_ORDER.map(code => (
            <button
              key={code}
              className={`chip chip--interactive${activeCode === code ? ' chip--active' : ''}`}
              onClick={() => setActiveCode(code)}
            >
              <i className="chip-swatch" style={{ background: getColor(code) }} />
              {code}
            </button>
          ))}
        </div>
        <div className="toolbar-strip-group">
          <button
            className={`chip chip--interactive${activeCode === '' ? ' chip--active' : ''}`}
            onClick={() => setActiveCode('')}
          >
            Eraser
          </button>
          <button
            className="chip chip--interactive"
            onClick={handleUndo}
            disabled={!strokeHistory.length}
            style={!strokeHistory.length ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          >
            Undo
          </button>
        </div>
        <span className="toolbar-strip-hint">Click/drag to paint · Right-click to erase</span>
      </div>
      )}

      {/* Legend */}
      {usedCodes.length > 0 && (
        <div className="htl-legend">
          {usedCodes.map(code => (
            <span key={code} className="chip">
              <i className="chip-swatch" style={{ background: getColor(code) }} />
              {code} · {getLabel(code)}
            </span>
          ))}
        </div>
      )}

      {/* Gantt grid */}
      <div className="htl-scroll">
        <div className="htl-axis ribbon" style={{ gridTemplateColumns: `200px repeat(${maxMonths}, minmax(34px, 1fr))` }}>
          <div className="htl-axis-label ribbon-cell">Lane</div>
          {monthLabels.map((label, i) => (
            <div key={i} className={`htl-axis-cell${label.yearStart ? ' htl-axis-cell--year' : ''}`}>
              <span className="htl-axis-month">{label.month}</span>
              {label.yearStart && label.year && <span className="htl-axis-year">{label.year}</span>}
            </div>
          ))}
        </div>

        {laneData.map((lane) => (
          <div
            key={lane.index}
            className="htl-lane"
            style={{ gridTemplateColumns: `200px repeat(${maxMonths}, minmax(34px, 1fr))` }}
          >
            <div className="htl-lane-label">
              <input
                className="htl-lane-name"
                value={lane.name}
                placeholder="Timeline name"
                readOnly={locked}
                onChange={e => handleFieldChange(lane.index, 'name', e.target.value)}
              />
              <span className="htl-lane-meta">{lane.totalMonths}m</span>
              {laneData.length > 1 && !locked && (
                <button className="htl-lane-remove" onClick={() => handleRemoveLane(lane.index)} title="Delete">×</button>
              )}
            </div>
            <div
              className="htl-track"
              style={{ gridColumn: `2 / span ${maxMonths}` }}
              onMouseDown={locked ? undefined : e => handleTrackMouseDown(e, lane.index, maxMonths)}
              onMouseMove={locked ? undefined : e => handleTrackMouseMove(e, lane.index, maxMonths)}
              onContextMenu={locked ? undefined : e => handleTrackContextMenu(e, lane.index, maxMonths)}
            >
              {lane.segments.map((seg, si) => {
                const left = (seg.start / maxMonths) * 100
                const width = (seg.span / maxMonths) * 100
                return (
                  <div
                    key={si}
                    className="htl-seg"
                    style={{ left: `${left}%`, width: `${width}%`, background: getColor(seg.token) }}
                    title={`${getLabel(seg.token)} · ${seg.span}m`}
                  >
                    <span className="htl-seg-code">{seg.token}</span>
                    {seg.span > 1 && <span className="htl-seg-dur">{seg.span}m</span>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Per-lane config */}
      <div className="htl-config-list">
        {laneData.map(lane => (
          <div key={lane.index} className="htl-config-card">
            <label className="htl-config-field">
              <span>Start Date</span>
              <input
                type="date"
                value={lane.startDate}
                disabled={locked}
                onChange={e => handleFieldChange(lane.index, 'project_start_date', e.target.value)}
              />
            </label>
            <label className="htl-config-field">
              <span>Duration</span>
              <div className="htl-dur-control">
                <button className="htl-dur-btn" disabled={locked} onClick={() => handleAddDuration(lane.index, -1)}>−</button>
                <span className="htl-dur-value">{lane.totalMonths}m</span>
                <button className="htl-dur-btn" disabled={locked} onClick={() => handleAddDuration(lane.index, 1)}>+</button>
              </div>
            </label>
          </div>
        ))}
      </div>

      {showAddTimeline && (
        <QuickSetupWizard deal={deal} onComplete={() => { setShowAddTimeline(false); onUpdate() }} mode="timeline" />
      )}

      <ConfirmDialog
        isOpen={pendingDeleteIndex !== null}
        title="Delete Timeline"
        message={pendingDeleteIndex !== null ? `Delete "${localTimelines[pendingDeleteIndex]?.name || ''}"?` : ''}
        confirmLabel="Delete"
        onCancel={() => setPendingDeleteIndex(null)}
        onConfirm={async () => {
          const i = pendingDeleteIndex
          setPendingDeleteIndex(null)
          if (i !== null && localTimelines.length > 1) {
            const next = localTimelines.filter((_, j) => j !== i)
            debouncedSave(next)
          }
        }}
      />
    </div>
  )
}
