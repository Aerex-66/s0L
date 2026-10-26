import { useMemo, useCallback } from 'react'
import { DEAL_PHASE_TO_CODE, PHASE_PALETTE } from '../constants/gssmFieldMap'

export { PHASE_PALETTE }

const getColor = (code, phaseMap) => phaseMap?.[code]?.color || PHASE_PALETTE[code]?.color || '#6f6f6f'
const getLabel = (code, phaseMap) => phaseMap?.[code]?.label || PHASE_PALETTE[code]?.label || code

/* ── Month axis builder ── */
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function buildAxis(startDate, count) {
  if (!startDate || !count) return Array.from({ length: count }, (_, i) => `M${i + 1}`)
  const d = new Date(startDate)
  if (isNaN(d.getTime())) return Array.from({ length: count }, (_, i) => `M${i + 1}`)
  return Array.from({ length: count }, (_, i) => {
    const m = new Date(d)
    m.setMonth(m.getMonth() + i)
    return `${MO[m.getMonth()]} ${String(m.getFullYear()).slice(-2)}`
  })
}

/**
 * Convert deal.timelines[] into the normalized lane shape used by TimelineBar.
 * Keeps conversion logic in one place so any module can call it.
 */
export function timelinesToLanes(timelines) {
  return (timelines || []).map((tl, idx) => {
    const phaseMap = tl.timeline || {}
    const phases = Object.keys(phaseMap)
    const segments = []
    let offset = 0

    for (const phase of phases) {
      const d = phaseMap[phase] || { duration: 2, unit: 'months' }
      const months = d.unit === 'weeks' ? Math.ceil(d.duration / 4.33) : d.duration
      const code = DEAL_PHASE_TO_CODE[phase] || phase.slice(0, 2).toUpperCase()
      if (months > 0) {
        segments.push({ token: code, start: offset, span: months })
        offset += months
      }
    }

    return {
      index: idx,
      name: tl.name || 'Timeline',
      startDate: tl.project_start_date || null,
      totalMonths: offset || tl.total_duration || 0,
      totalDuration: tl.total_duration || 0,
      segments,
    }
  })
}

// Keep old name as alias for backwards compat
export const timelinestoLanes = timelinesToLanes

/**
 * TimelineBar — shared Gantt visualization with optional inline editing.
 *
 * Props:
 *  lanes         — [{ index, name, startDate?, totalMonths, totalDuration, segments }]
 *  phaseMap      — optional { CODE: { label, color } } overrides
 *  compact       — boolean, smaller variant for sidebars / cards
 *  showLegend    — boolean (default true)
 *  showAxis      — boolean (default true)
 *  className     — extra class on root
 *  onSegmentClick — (lane, segment) => void
 *
 *  Editable mode (all optional — omit for read-only):
 *  editable      — boolean, enables inline editing controls
 *  onFieldChange — (laneIndex, field, value) => void
 *  onAddLane     — () => void
 *  onRemoveLane  — (laneIndex) => void
 */
export default function TimelineBar({
  lanes = [],
  phaseMap,
  compact = false,
  showLegend = true,
  showAxis = true,
  className = '',
  onSegmentClick,
  editable = false,
  onFieldChange,
  onAddLane,
  onRemoveLane,
}) {
  const maxMonths = useMemo(() => {
    let m = 0
    for (const l of lanes) if (l.totalMonths > m) m = l.totalMonths
    return Math.max(m, 1)
  }, [lanes])

  const monthLabels = useMemo(() => {
    const first = lanes.find(l => l.startDate)
    return buildAxis(first?.startDate, maxMonths)
  }, [lanes, maxMonths])

  const legendCodes = useMemo(() => {
    const seen = new Set()
    for (const l of lanes) for (const s of l.segments) seen.add(s.token)
    const order = Object.keys(PHASE_PALETTE)
    return [...order.filter(c => seen.has(c)), ...[...seen].filter(c => !order.includes(c))]
  }, [lanes])

  const handleField = useCallback((laneIdx, field, value) => {
    if (onFieldChange) onFieldChange(laneIdx, field, value)
  }, [onFieldChange])

  if (!lanes.length && !editable) return null

  const cols = maxMonths
  const rootCls = `tb-root${compact ? ' tb-compact' : ''}${editable ? ' tb-editable' : ''} ${className}`.trim()

  return (
    <div className={rootCls}>
      {/* Toolbar (editable mode) */}
      {editable && (
        <div className="tb-toolbar">
          <span className="tb-toolbar-title">
            {lanes.length} Timeline{lanes.length !== 1 ? 's' : ''}
            <span className="tb-toolbar-months">{maxMonths} months</span>
          </span>
          {onAddLane && (
            <button className="btn btn-primary btn-sm" onClick={onAddLane}>+ Timeline</button>
          )}
        </div>
      )}

      {/* Legend */}
      {showLegend && legendCodes.length > 0 && (
        <div className="tb-legend">
          {legendCodes.map(code => (
            <span key={code} className="tb-legend-chip">
              <i className="tb-legend-swatch" style={{ background: getColor(code, phaseMap) }} />
              {code} · {getLabel(code, phaseMap)}
            </span>
          ))}
        </div>
      )}

      {/* Grid */}
      {lanes.length > 0 && (
        <div className="tb-scroll">
          <div className="tb-grid" style={{ gridTemplateColumns: `140px repeat(${cols}, minmax(${compact ? '20px' : '32px'}, 1fr))` }}>
            {/* Axis */}
            {showAxis && (
              <>
                <div className="tb-axis-label">Lane</div>
                {monthLabels.map((label, i) => (
                  <div key={i} className="tb-axis-cell">{label}</div>
                ))}
              </>
            )}

            {/* Lanes */}
            {lanes.map((lane, idx) => (
              <div
                key={idx}
                className="tb-lane"
                style={{ gridTemplateColumns: `140px repeat(${cols}, minmax(${compact ? '20px' : '32px'}, 1fr))` }}
              >
                <div className="tb-lane-label">
                  <span className="tb-lane-name">{lane.name}</span>
                  {!compact && (
                    <span className="tb-lane-meta">{lane.totalMonths}m</span>
                  )}
                </div>
                {lane.segments.map((seg, si) => (
                  <div
                    key={si}
                    className="tb-seg"
                    style={{
                      gridColumn: `${seg.start + 2} / span ${seg.span}`,
                      background: getColor(seg.token, phaseMap),
                      cursor: onSegmentClick ? 'pointer' : undefined,
                    }}
                    title={`${seg.token} · ${getLabel(seg.token, phaseMap)} · ${seg.span}m`}
                    onClick={onSegmentClick ? () => onSegmentClick(lane, seg) : undefined}
                  >
                    <span className="tb-seg-code">{seg.token}</span>
                    {!compact && <span className="tb-seg-dur">{seg.span}m</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline config cards (editable mode) */}
      {editable && lanes.length > 0 && (
        <div className="tb-config-list">
          {lanes.map((lane) => (
            <div key={lane.index} className="tb-config-card">
              <div className="tb-config-row">
                <label className="tb-config-field">
                  <span>Name</span>
                  <input type="text" value={lane.name} onChange={e => handleField(lane.index, 'name', e.target.value)} />
                </label>
                <label className="tb-config-field">
                  <span>Start Date</span>
                  <input type="date" value={lane.startDate || ''} onChange={e => handleField(lane.index, 'project_start_date', e.target.value)} />
                </label>
                <label className="tb-config-field">
                  <span>Duration</span>
                  <input type="number" min="1" max="120" value={lane.totalDuration || ''} onChange={e => handleField(lane.index, 'total_duration', parseInt(e.target.value) || '')} />
                </label>
                {onRemoveLane && lanes.length > 1 && (
                  <button className="tb-config-delete" onClick={() => onRemoveLane(lane.index)} title="Delete">&times;</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {lanes.length === 0 && (
        <div className="tb-empty">
          <p>No timelines configured.</p>
          <p className="tb-empty-hint">Add timelines via the GSSM Imp TL sheet or the deal setup wizard.</p>
        </div>
      )}
    </div>
  )
}
