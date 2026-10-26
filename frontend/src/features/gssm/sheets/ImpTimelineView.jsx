import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { getSheetDisplayName } from '../utils/normalizer'
import { PHASE_PALETTE } from '../../../shared/constants/gssmFieldMap'

const LEGEND_ROW_START = 1
const LEGEND_ROW_END = 9
const LEGEND_CODE_COL = 6
const LEGEND_LABEL_COL = 7
const LEGEND_COLOR_COL = 8
const USER_DEFINED_CODES = ['XX', 'YY', 'ZZ']

// Derive flat color/label maps from the shared palette
const DEFAULT_PHASE_COLORS = Object.fromEntries(
  Object.entries(PHASE_PALETTE).map(([k, v]) => [k, v.color])
)

const KNOWN_LABELS = Object.fromEntries(
  Object.entries(PHASE_PALETTE).map(([k, v]) => [k, v.label])
)

/* ── LocalStorage persistence for user brush colors/labels ── */
const BRUSH_STORAGE_KEY = 'imp-tl-user-brushes'

const loadPersistedBrushes = () => {
  try {
    const raw = localStorage.getItem(BRUSH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed // { XX: { color, label }, YY: { color, label }, ZZ: { color, label } }
  } catch { return null }
}

const savePersistedBrushes = (brushes) => {
  try {
    localStorage.setItem(BRUSH_STORAGE_KEY, JSON.stringify(brushes))
  } catch { /* quota exceeded — ignore */ }
}

// Dynamically assign a color to unknown tokens so each gets a unique hue
const dynamicColorCache = {}
let dynamicHue = 200
const getDynamicColor = (token) => {
  if (!dynamicColorCache[token]) {
    dynamicColorCache[token] = `hsl(${dynamicHue}, 55%, 50%)`
    dynamicHue = (dynamicHue + 47) % 360  // golden-angle-ish spacing
  }
  return dynamicColorCache[token]
}

const normalizeBrushHex = (value) => {
  let text = String(value || '').trim()
  if (!text) return ''
  if (!text.startsWith('#')) text = `#${text}`
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) return ''
  if (text.length === 4) {
    text = `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`
  }
  return text.toUpperCase()
}

const getLegendCellValue = (rowData = [], rowIndex, colIndex, overrides = null) => {
  const key = `${rowIndex}:${colIndex}`
  if (overrides && key in overrides) return overrides[key]
  return rowData?.[rowIndex]?.[`c${colIndex}`]
}

export const buildPhaseBrushMap = (rowData = [], overrides = null) => {
  const map = {}
  for (let rowIndex = LEGEND_ROW_START; rowIndex <= LEGEND_ROW_END; rowIndex += 1) {
    const code = normalizeToken(getLegendCellValue(rowData, rowIndex, LEGEND_CODE_COL, overrides))
    const color = normalizeBrushHex(getLegendCellValue(rowData, rowIndex, LEGEND_COLOR_COL, overrides))
    if (!code || !color) continue
    map[code] = color
  }
  return map
}

export const getPhaseColor = (token, brushMap = null) => {
  if (!token) return 'transparent'
  if (brushMap?.[token]) return brushMap[token]
  return DEFAULT_PHASE_COLORS[token] || getDynamicColor(token)
}

export const normalizeToken = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  const upper = text.toUpperCase()
  if (upper in DEFAULT_PHASE_COLORS) return upper
  // Full-word / prefix mappings (handles various GSSM templates)
  if (upper.startsWith('DISC')) return 'DI'
  if (upper.startsWith('PREP')) return 'PR'
  if (upper.startsWith('EXPL')) return 'EX'
  if (upper.startsWith('REAL')) return 'RE'
  if (upper.startsWith('DEPL')) return 'DP'
  if (upper.startsWith('SUST')) return 'SU'
  if (upper.startsWith('HYPER') || upper.startsWith('HYPE')) return 'HC'
  // Single-letter shortcuts (seen in some CoSA / regional GSSMs)
  if (upper === 'D') return 'DP'
  if (upper === 'E') return 'EX'
  if (upper === 'P') return 'PR'
  if (upper === 'R') return 'RE'
  if (upper === 'S') return 'SU'
  if (upper === 'H') return 'HC'
  // Ignore pure numeric values (FTE counts or percentages that ended up in timeline cells)
  if (/^\d+(\.\d+)?$/.test(upper)) return ''
  // Return the raw uppercase token — it'll get a dynamic color
  return upper
}

export const getMaxCol = (rowData = []) => {
  let maxCol = 3
  rowData.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      const match = /^c(\d+)$/.exec(key)
      if (!match) return
      const col = Number(match[1])
      if (Number.isFinite(col)) {
        maxCol = Math.max(maxCol, col)
      }
    })
  })
  return maxCol
}

export const buildLegendMap = (rowData = [], lanes = []) => {
  const map = { ...KNOWN_LABELS }

  // Override with sheet-defined legend (rows 2-10, 0-indexed 1-9)
  for (let rowIndex = LEGEND_ROW_START; rowIndex <= LEGEND_ROW_END; rowIndex += 1) {
    const code = normalizeToken(getLegendCellValue(rowData, rowIndex, LEGEND_CODE_COL))
    const label = String(getLegendCellValue(rowData, rowIndex, LEGEND_LABEL_COL) || '').trim()
    if (!code || !label) continue
    map[code] = label
  }

  // Auto-discover tokens used in lanes that aren't in the legend yet
  for (const lane of lanes) {
    for (const seg of lane.segments) {
      if (seg.token && !map[seg.token]) {
        map[seg.token] = seg.token  // use the code itself as a fallback label
      }
    }
  }

  return map
}

/** Convert Excel date serial → 'YYYY-MM-DD' for <input type="date"> */
const serialToDateStr = (serial) => {
  const num = Number(serial)
  if (!Number.isFinite(num) || num < 1) return ''
  const d = new Date((num - 25569) * 86400 * 1000)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

/** Convert 'YYYY-MM-DD' → Excel date serial */
const dateStrToSerial = (str) => {
  if (!str) return ''
  const d = new Date(str + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return ''
  return Math.round(d.getTime() / 86400000 + 25569)
}

/** Pretty-print a date serial for display */
const serialToDisplay = (serial) => {
  const num = Number(serial)
  if (!Number.isFinite(num) || num < 1) return ''
  const d = new Date((num - 25569) * 86400 * 1000)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export const buildTimelineLanes = (rowData = [], maxCol = 3) => {
  const lanes = []

  for (let rowIndex = 15; rowIndex < rowData.length; rowIndex += 2) {
    const row = rowData[rowIndex] || {}
    const labelA = String(row.c0 || '').trim()
    const labelB = String(row.c1 || '').trim()
    const labelC = String(row.c2 || '').trim()

    const tokenByCol = []
    for (let col = 3; col <= maxCol; col += 1) {
      const token = normalizeToken(row[`c${col}`])
      tokenByCol.push({ col, token })
    }

    const hasTokens = tokenByCol.some(({ token }) => token)
    const hasLabels = Boolean(labelA || labelB || labelC)
    if (!hasTokens && !hasLabels) continue

    const segments = []
    let cursor = 0
    while (cursor < tokenByCol.length) {
      const current = tokenByCol[cursor]
      if (!current.token) {
        cursor += 1
        continue
      }
      const start = cursor
      let end = cursor
      while (end + 1 < tokenByCol.length && tokenByCol[end + 1].token === current.token) {
        end += 1
      }

      segments.push({
        token: current.token,
        startCol: tokenByCol[start].col,
        endCol: tokenByCol[end].col,
      })

      cursor = end + 1
    }

    lanes.push({
      rowIndex,
      labelA,
      labelB,
      labelC,
      segments,
    })
  }

  return lanes
}

function ImpTimelineView({ rowData = [], onCellEdit }) {
  const [activeCode, setActiveCode] = useState('PR')
  const [isPainting, setIsPainting] = useState(false)
  const [strokeHistory, setStrokeHistory] = useState([])
  const [showUserBrushes, setShowUserBrushes] = useState(false)
  const strokeRef = useRef(null)
  const isApplyingUndoRef = useRef(false)

  const maxCol = getMaxCol(rowData)

  // ── Intake form values (0-indexed after server r-1/c-1) ──
  const startDateSerial = String(rowData?.[7]?.c2 || '').trim()
  const timeUnit = String(rowData?.[8]?.c2 || 'Monthly').trim() || 'Monthly'
  const autoColor = String(rowData?.[9]?.c2 || 'On').trim()
  const durationMonths = String(rowData?.[10]?.c2 || '').trim()
  const endDateSerial = String(rowData?.[10]?.c4 || '').trim()

  // Clip timeline columns to the project duration
  const dur = Number(durationMonths)
  const effectiveMaxCol = (Number.isFinite(dur) && dur > 0) ? Math.min(maxCol, 3 + dur - 1) : maxCol
  const lanes = buildTimelineLanes(rowData, effectiveMaxCol)

  const phaseBrushes = buildPhaseBrushMap(rowData)
  const legendMap = buildLegendMap(rowData, lanes)
  const userDefinedBrushes = USER_DEFINED_CODES.map((code) => {
    let rowIndex = null
    for (let index = LEGEND_ROW_START; index <= LEGEND_ROW_END; index += 1) {
      if (normalizeToken(getLegendCellValue(rowData, index, LEGEND_CODE_COL)) === code) {
        rowIndex = index
        break
      }
    }
    return {
      code,
      rowIndex,
      label: rowIndex == null ? '' : String(getLegendCellValue(rowData, rowIndex, LEGEND_LABEL_COL) || '').trim(),
      color: rowIndex == null ? '' : normalizeBrushHex(getLegendCellValue(rowData, rowIndex, LEGEND_COLOR_COL)),
    }
  }).filter((brush) => brush.rowIndex != null)

  const timelineCols = []
  for (let col = 3; col <= effectiveMaxCol; col += 1) {
    timelineCols.push(col)
  }

  // ── Restore persisted user brush colors/labels on mount ──
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current || typeof onCellEdit !== 'function') return
    if (!userDefinedBrushes.length) return
    const persisted = loadPersistedBrushes()
    if (!persisted) return
    restoredRef.current = true
    for (const brush of userDefinedBrushes) {
      const saved = persisted[brush.code]
      if (!saved) continue
      // Restore color if the sheet has the default gray (or blank) and we have a saved custom color
      const defaultGray = DEFAULT_PHASE_COLORS[brush.code]
      const currentColor = brush.color
      if (saved.color && (!currentColor || currentColor === defaultGray?.toUpperCase())) {
        onCellEdit({ rowIndex: brush.rowIndex, colIndex: LEGEND_COLOR_COL, value: saved.color })
      }
      // Restore label if blank and we have a saved label
      if (saved.label && !brush.label) {
        onCellEdit({ rowIndex: brush.rowIndex, colIndex: LEGEND_LABEL_COL, value: saved.label })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDefinedBrushes])

  const handleIntakeEdit = useCallback((rowIndex, colIndex, value) => {
    if (typeof onCellEdit !== 'function') return
    onCellEdit({ rowIndex, colIndex, value })
  }, [onCellEdit])

  // Persist user brush edits (color or label) to localStorage
  const handleBrushEdit = useCallback((brushCode, rowIndex, colIndex, value) => {
    handleIntakeEdit(rowIndex, colIndex, value)
    const persisted = loadPersistedBrushes() || {}
    if (!persisted[brushCode]) persisted[brushCode] = {}
    if (colIndex === LEGEND_COLOR_COL) {
      persisted[brushCode].color = value
    } else if (colIndex === LEGEND_LABEL_COL) {
      persisted[brushCode].label = value
    }
    savePersistedBrushes(persisted)
  }, [handleIntakeEdit])

  const handleAddLane = useCallback(() => {
    if (typeof onCellEdit !== 'function') return
    // Find the next available row slot (step 2, starting at 15)
    const usedRows = new Set(lanes.map(l => l.rowIndex))
    let nextRow = 15
    while (usedRows.has(nextRow)) nextRow += 2
    // Write default labels to create the lane
    onCellEdit([
      { rowIndex: nextRow, colIndex: 0, value: `Rollout ${lanes.length + 1}` },
      { rowIndex: nextRow, colIndex: 1, value: 'Named rollout' },
    ])
  }, [lanes, onCellEdit])

  const handleRemoveLane = useCallback((rowIndex) => {
    if (typeof onCellEdit !== 'function') return
    // Clear all cells in this lane row (labels + phase tokens) in one batch
    const edits = []
    for (let col = 0; col <= effectiveMaxCol; col += 1) {
      edits.push({ rowIndex, colIndex: col, value: '' })
    }
    onCellEdit(edits)
  }, [effectiveMaxCol, onCellEdit])

  const axisRow = rowData?.[13] || {}

  // Build palette: standard phases + sub-phases + any dynamic tokens found in lanes
  const orderedCodes = ['DI', 'PR', 'EX', 'RE', 'RB', 'RT', 'RC', 'RD', 'DP', 'SU', 'XX', 'YY', 'ZZ']
  const allLegendCodes = Object.keys(legendMap)
  const paletteCodes = [...new Set([...orderedCodes, ...allLegendCodes])].filter((code) => legendMap[code])

  const resolveColFromEvent = (event, totalCols) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || totalCols <= 0) return null
    const x = event.clientX - rect.left
    const ratio = Math.min(0.9999, Math.max(0, x / rect.width))
    const index = Math.floor(ratio * totalCols)
    return 3 + index
  }

  const getCurrentToken = (rowIndex, colIndex) => normalizeToken(rowData?.[rowIndex]?.[`c${colIndex}`])

  const recordStrokeChange = (rowIndex, colIndex, oldValue, newValue) => {
    if (!strokeRef.current) return
    const key = `${rowIndex}:${colIndex}`
    if (!strokeRef.current.changes[key]) {
      strokeRef.current.changes[key] = { rowIndex, colIndex, oldValue, newValue }
      return
    }
    strokeRef.current.changes[key].newValue = newValue
  }

  const commitStroke = () => {
    if (!strokeRef.current) return
    const changes = Object.values(strokeRef.current.changes || {})
    strokeRef.current = null
    if (!changes.length || isApplyingUndoRef.current) return
    setStrokeHistory((prev) => [...prev, { changes }].slice(-40))
  }

  const endPainting = () => {
    if (!isPainting) return
    setIsPainting(false)
    commitStroke()
  }

  const applyTokenAtEvent = (event, rowIndex, tokenOverride = null) => {
    if (typeof onCellEdit !== 'function') return
    const col = resolveColFromEvent(event, timelineCols.length)
    if (!Number.isInteger(col) || col < 3) return
    const token = tokenOverride !== null ? tokenOverride : activeCode
    const oldToken = getCurrentToken(rowIndex, col)
    if (oldToken === token) return
    if (isPainting) {
      recordStrokeChange(rowIndex, col, oldToken, token)
    }
    onCellEdit({ rowIndex, colIndex: col, value: token })
  }

  const handleTrackMouseDown = (event, rowIndex) => {
    if (event.button !== 0) return
    strokeRef.current = { changes: {} }
    setIsPainting(true)
    applyTokenAtEvent(event, rowIndex)
  }

  const handleTrackMouseMove = (event, rowIndex) => {
    if (!isPainting) return
    applyTokenAtEvent(event, rowIndex)
  }

  const handleTrackContextMenu = (event, rowIndex) => {
    event.preventDefault()
    strokeRef.current = { changes: {} }
    setIsPainting(true)
    applyTokenAtEvent(event, rowIndex, '')
    endPainting()
  }

  const handleUndoLastStroke = () => {
    if (!strokeHistory.length || typeof onCellEdit !== 'function') return
    const nextHistory = [...strokeHistory]
    const lastStroke = nextHistory.pop()
    setStrokeHistory(nextHistory)
    if (!lastStroke?.changes?.length) return

    isApplyingUndoRef.current = true
    const edits = lastStroke.changes.map((change) => ({
      rowIndex: change.rowIndex,
      colIndex: change.colIndex,
      value: change.oldValue || '',
    }))
    onCellEdit(edits)
    isApplyingUndoRef.current = false
  }

  return (
    <section className="timeline-panel" onMouseUp={endPainting} onMouseLeave={endPainting}>
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('Imp TL')}</h2>
        </div>
        <div className="stat-row">
          <span className="stat-badge stat-badge--blue">{lanes.length} Lanes</span>
          <span className="stat-badge stat-badge--gray">{timelineCols.length} Months</span>
        </div>
      </div>

      <div className="timeline-edit-bar">
        <span className="timeline-edit-label">Phase brush:</span>
        <div className="timeline-phase-picker">
          {paletteCodes.map((code) => (
            <button
              key={code}
              type="button"
              className={activeCode === code ? 'phase-btn active' : 'phase-btn'}
              onClick={() => setActiveCode(code)}
            >
              <i style={{ background: getPhaseColor(code, phaseBrushes) }} />
              {code}
            </button>
          ))}
          <button
            type="button"
            className={activeCode === '' ? 'phase-btn phase-btn--clear active' : 'phase-btn phase-btn--clear'}
            onClick={() => setActiveCode('')}
          >
            Clear stroke
          </button>
          <button
            type="button"
            className="phase-btn phase-btn--undo"
            onClick={handleUndoLastStroke}
            disabled={strokeHistory.length === 0}
          >
            Undo stroke
          </button>
        </div>
        <span className="timeline-edit-hint">Left-click/drag to paint. Right-click to clear a cell.</span>
        {userDefinedBrushes.length > 0 && (
          <button
            type="button"
            className={`phase-btn phase-btn--user-toggle${showUserBrushes ? ' active' : ''}`}
            onClick={() => setShowUserBrushes((p) => !p)}
          >
            User brushes <ChevronDown size={13} className={`collapsible-arrow${showUserBrushes ? '' : ' collapsed'}`} />
          </button>
        )}
      </div>

      {showUserBrushes && userDefinedBrushes.length > 0 && (
        <div className="timeline-brush-editor">
          <div className="timeline-brush-grid">
            {userDefinedBrushes.map((brush) => {
              const swatchColor = brush.color || getPhaseColor(brush.code, phaseBrushes)
              return (
                <div key={brush.code} className="timeline-brush-card">
                  <div className="timeline-brush-card-header">
                    <span className="timeline-brush-code">
                      <i style={{ background: swatchColor }} />
                      {brush.code}
                    </span>
                    <div className="timeline-brush-actions">
                      <input
                        type="color"
                        aria-label={`${brush.code} brush color`}
                        value={swatchColor}
                        onChange={(e) => handleBrushEdit(brush.code, brush.rowIndex, LEGEND_COLOR_COL, e.target.value.toUpperCase())}
                      />
                      <button
                        type="button"
                        className="phase-btn phase-btn--ghost"
                        onClick={() => handleBrushEdit(brush.code, brush.rowIndex, LEGEND_COLOR_COL, '')}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <input
                    className="timeline-brush-label-input"
                    value={brush.label}
                    placeholder="Brush label"
                    onChange={(e) => handleBrushEdit(brush.code, brush.rowIndex, LEGEND_LABEL_COL, e.target.value)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="timeline-intake-form">
        <label>
          <span>Project Start Date</span>
          <input
            type="date"
            value={serialToDateStr(startDateSerial)}
            onChange={(e) => {
              const serial = dateStrToSerial(e.target.value)
              if (serial) handleIntakeEdit(7, 2, String(serial))
            }}
          />
        </label>

        <label>
          <span>Time Unit</span>
          <select
            value={timeUnit}
            onChange={(e) => handleIntakeEdit(8, 2, e.target.value)}
          >
            <option value="Monthly">Monthly</option>
            <option value="Quarterly">Quarterly</option>
          </select>
        </label>

        <label>
          <span>Duration (months)</span>
          <input
            type="number"
            min="1"
            max="120"
            value={durationMonths}
            onChange={(e) => handleIntakeEdit(10, 2, e.target.value)}
          />
        </label>

        <label>
          <span>Auto-Color Phases</span>
          <select
            value={autoColor}
            onChange={(e) => handleIntakeEdit(9, 2, e.target.value)}
          >
            <option value="On">On</option>
            <option value="Off">Off</option>
          </select>
        </label>

        <label>
          <span>End Date</span>
          <span className="intake-computed">{serialToDisplay(endDateSerial) || '—'}</span>
        </label>
      </div>

      <div className="timeline-legend">
        {Object.entries(legendMap).map(([code, label]) => (
          <span key={code} className="legend-chip">
            <i style={{ background: getPhaseColor(code, phaseBrushes) }} />
            {code} · {label}
          </span>
        ))}
      </div>

      <div className="timeline-scroll">
        <div className="timeline-axis" style={{ gridTemplateColumns: `220px repeat(${timelineCols.length}, minmax(26px, 1fr))` }}>
          <div className="timeline-axis-label">Month</div>
          {timelineCols.map((col) => {
            const raw = String(axisRow[`c${col}`] || '').trim()
            const num = Number(raw)
            let label = raw
            if (Number.isFinite(num) && num > 1000) {
              const d = new Date((num - 25569) * 86400 * 1000)
              if (!Number.isNaN(d.getTime())) {
                label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
              }
            }
            return <div key={`axis-${col}`} className="timeline-axis-cell">{label || '·'}</div>
          })}
        </div>

        {lanes.map((lane) => (
          <div key={`lane-${lane.rowIndex}`} className="timeline-lane" style={{ gridTemplateColumns: `220px repeat(${timelineCols.length}, minmax(26px, 1fr))` }}>
            <div className="timeline-row-label">
              <input
                className="lane-name-input lane-name-primary"
                value={lane.labelA}
                placeholder="Timeline name"
                onChange={(e) => handleIntakeEdit(lane.rowIndex, 0, e.target.value)}
              />
              <input
                className="lane-name-input lane-name-secondary"
                value={lane.labelB}
                placeholder="Named rollout"
                onChange={(e) => handleIntakeEdit(lane.rowIndex, 1, e.target.value)}
              />
              {lane.labelC && (
                <input
                  className="lane-name-input lane-name-detail"
                  value={lane.labelC}
                  placeholder="Details"
                  onChange={(e) => handleIntakeEdit(lane.rowIndex, 2, e.target.value)}
                />
              )}
              <button
                type="button"
                className="lane-remove-btn"
                title="Remove this timeline"
                onClick={() => handleRemoveLane(lane.rowIndex)}
              >
                ×
              </button>
            </div>

            <div
              className="timeline-row-track"
              style={{ gridColumn: `2 / span ${timelineCols.length}` }}
              onMouseDown={(event) => handleTrackMouseDown(event, lane.rowIndex)}
              onMouseMove={(event) => handleTrackMouseMove(event, lane.rowIndex)}
              onContextMenu={(event) => handleTrackContextMenu(event, lane.rowIndex)}
            >
              {lane.segments.map((segment, index) => {
                const left = ((segment.startCol - 3) / timelineCols.length) * 100
                const width = ((segment.endCol - segment.startCol + 1) / timelineCols.length) * 100
                return (
                  <div
                    key={`seg-${lane.rowIndex}-${index}`}
                    className="timeline-segment"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: getPhaseColor(segment.token, phaseBrushes),
                    }}
                    title={`${segment.token} · ${legendMap[segment.token] || 'Unmapped'} (${segment.startCol}→${segment.endCol})`}
                  >
                    {segment.token}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="lane-add-btn" onClick={handleAddLane}>
        + Add Timeline
      </button>

      {lanes.length === 0 && <p className="timeline-empty">No timeline lanes yet. Click "+ Add Timeline" to create one.</p>}
    </section>
  )
}

export default memo(ImpTimelineView)
