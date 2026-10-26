import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GripVertical, ChevronDown, AlertTriangle, X, ArrowRight, ArrowLeft } from 'lucide-react'
import CellInput, { CellSelect, CellCombo } from '../components/CellInput'
import { useColumnToggle } from '../components/ColumnToggle'
import { getSheetDisplayName } from '../utils/normalizer'
import { findStaffingLayout } from '../utils/cellUtils'
import { buildPhaseBrushMap, getPhaseColor, normalizeToken, buildTimelineLanes, getMaxCol, buildLegendMap } from './ImpTimelineView'

const toText = (value) => (value == null ? '' : String(value))

/** Shorten verbose band names for display — keeps original value for export */
const BAND_ABBREVS = [
  [/Application Operations/gi, 'AO'],
  [/Bus Apps\+CSS\+Hybrid Cloud & Data\+S&T/gi, 'BAP/HCD/S+T'],
  [/Bus Apps\+CSS\+Hybrid Cloud & Data/gi, 'BAP/HCD'],
  [/GRCOREREMOTE/g, 'GR Remote'],
]
const normalizeBand = (text) => {
  let s = String(text ?? '')
  for (const [re, short] of BAND_ABBREVS) s = s.replace(re, short)
  return s
}

/**
 * Build a col-index → options[] map from server validation ranges.
 * Only includes columns that intersect the data rows (28+).
 */
const buildDropdownMap = (validations) => {
  const map = {} // colIndex → string[]
  if (!Array.isArray(validations)) return map
  for (const v of validations) {
    if (!v.options || v.options.length === 0) continue
    // Check if validation covers data rows (row 27+ 0-indexed)
    if (v.endRow < 27) continue
    for (let col = v.startCol; col <= v.endCol; col += 1) {
      if (!map[col]) map[col] = v.options
    }
  }
  return map
}

const formatDisplayValue = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(text)) {
    const numeric = Number(text)
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    }
  }
  return text
}

/** Format FTE values to always show 2 decimal places (e.g. 1 → "1.00") */
const formatFteValue = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const numeric = Number(text)
  if (Number.isFinite(numeric)) return numeric.toFixed(2)
  return text
}

const EDITABLE_ROSTER_HEADERS = ['Rollout', 'Phase', 'Team', 'Sub-Team', 'Resource Name', 'Role', 'Band']
const OUTPUT_HEADERS = ['Company', 'Labor Cost', 'Man-Days', 'Hours', 'Fees']

const TEAM_ACCENT_PALETTE = [
  '#4f46e5', '#0891b2', '#059669', '#d97706', '#be123c',
  '#7c3aed', '#0284c7', '#16a34a', '#ca8a04', '#dc2626',
]

const ROSTER_COL_CLASS = {
  'Rollout': 'staffing-col-rollout',
  'Phase': 'staffing-col-phase',
  'Team': 'staffing-col-team',
  'Sub-Team': 'staffing-col-sub-team',
  'Resource Name': 'staffing-col-resource-name',
  'Role': 'staffing-col-role',
  'Band': 'staffing-col-band',
}

const parseExcelSerialMonth = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 1) return null
  const utcDays = Math.floor(num - 25569)
  const utcValue = utcDays * 86400
  const date = new Date(utcValue * 1000)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}

/**
 * Compute structural metadata from rowData — called only on mount / row-count change.
 * Detects 4 timeline sections from row 11 labels: FTE, HOURS, FEES, Man-days.
 */


/**
 * Extract project start date serial from Imp TL sheet.
 * Spreadsheet row 8, col C → 0-indexed row 7, col 2.
 */
const getTimelineStartSerial = (impTlRowData) => {
  if (!impTlRowData || !impTlRowData.length) return null
  const row = impTlRowData[7]
  if (!row) return null
  const serial = Number(row.c2)
  return Number.isFinite(serial) && serial > 1 ? serial : null
}

/**
 * Extract project duration (months) from the Imp TL sheet.
 * Spreadsheet row 11, col C → 0-indexed row 10, col 2 (after server r-1/c-1).
 */
const getTimelineDuration = (impTlRowData) => {
  if (!impTlRowData || !impTlRowData.length) return null
  const row = impTlRowData[10]
  if (!row) return null
  const dur = Number(row.c2)
  return Number.isFinite(dur) && dur > 0 ? dur : null
}

/** Convert an Excel serial date to a JS Date (UTC). */
const excelSerialToDate = (serial) => {
  const utcDays = Math.floor(serial - 25569)
  return new Date(utcDays * 86400 * 1000)
}

/** Generate N month labels starting from an Excel date serial. */
const generateMonthLabels = (startSerial, count) => {
  const d = excelSerialToDate(startSerial)
  const labels = []
  for (let i = 0; i < count; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1))
    labels.push(m.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }))
  }
  return labels
}

/**
 * Detect header mismatches between Staffing timeline and Imp TL.
 * Returns an array of warning strings (empty = OK).
 */
const detectHeaderMismatches = (sections, timelineDuration, startSerial, headers) => {
  const warnings = []
  const fteSection = sections.find((s) => s.id === 'fte')
  if (!fteSection || !fteSection.cols.length) return warnings

  if (!startSerial && timelineDuration) {
    warnings.push('Imp TL has no start date — Staffing month labels are falling back to the sheet header row and may be stale.')
  }

  // When using generated labels, cross-check against the first row-27 date serial.
  // If they disagree, the uploaded Staffing data was built for a different timeline.
  if (startSerial && timelineDuration && fteSection.cols.length > 0) {
    const firstCol = fteSection.cols[0].col
    const firstSheetSerial = Number(headers[firstCol])
    if (Number.isFinite(firstSheetSerial) && firstSheetSerial > 1) {
      const impTlDate = excelSerialToDate(startSerial)
      const sheetDate = excelSerialToDate(firstSheetSerial)
      const impTlMonth = impTlDate.getUTCFullYear() * 12 + impTlDate.getUTCMonth()
      const sheetMonth = sheetDate.getUTCFullYear() * 12 + sheetDate.getUTCMonth()
      if (impTlMonth !== sheetMonth) {
        const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
        warnings.push(
          `Staffing data columns start at ${fmt(sheetDate)} but Imp TL says the project starts ${fmt(impTlDate)}. ` +
          `FTE values in these columns may correspond to different months than shown.`
        )
      }
    }
    return warnings
  }

  // Fallback: validate row 27 date serials
  const parsedDates = []
  for (const col of fteSection.cols) {
    const serial = Number(headers[col.col])
    if (Number.isFinite(serial) && serial > 1) parsedDates.push({ col: col.col, serial })
  }
  if (parsedDates.length >= 2) {
    for (let i = 1; i < parsedDates.length; i++) {
      const gap = parsedDates[i].serial - parsedDates[i - 1].serial
      if (gap < 1) {
        warnings.push('Duplicate or out-of-order date detected in timeline header row. Column labels may be mislabeled.')
        break
      }
      if (gap > 45) {
        warnings.push('Gap detected in timeline dates — one or more months appear to be missing from the header row.')
        break
      }
    }
  }

  return warnings
}

const computeStructure = (rowData, timelineDuration, startSerial) => {
  const { headerRow, dataStartRow } = findStaffingLayout(rowData)
  let maxCol = 0
  for (const row of rowData) {
    if (!row) continue
    for (const key of Object.keys(row)) {
      if (key.charCodeAt(0) !== 99) continue
      const col = Number(key.slice(1))
      if (col > maxCol) maxCol = col
    }
  }

  const headers = {}
  for (let col = 0; col <= maxCol; col += 1) {
    headers[col] = toText(rowData[headerRow]?.[`c${col}`]).trim()
  }

  const indexByHeader = {}
  for (const [colStr, name] of Object.entries(headers)) {
    if (!name || name in indexByHeader) continue
    indexByHeader[name] = Number(colStr)
  }

  const rosterColumns = EDITABLE_ROSTER_HEADERS
    .map((h) => ({ header: h, col: indexByHeader[h] }))
    .filter((e) => Number.isInteger(e.col))

  const outputColumns = OUTPUT_HEADERS
    .map((h) => ({ header: h, col: indexByHeader[h] }))
    .filter((e) => Number.isInteger(e.col))

  // Detect section boundaries from a label row above the header.
  // The section label row (FTE/HOURS/FEES) sits ~16 rows before the header;
  // scan a range to handle shifted layouts.
  const lastOutputCol = outputColumns.length > 0
    ? Math.max(...outputColumns.map(o => o.col))
    : 42
  const scanStart = lastOutputCol + 1
  const sectionStarts = []
  const sectionLabelRowStart = Math.max(0, headerRow - 20)
  for (let r = sectionLabelRowStart; r < headerRow; r++) {
    const sectionRow = rowData[r] || {}
    for (let col = scanStart; col <= maxCol; col += 1) {
      const label = toText(sectionRow[`c${col}`]).trim().toUpperCase()
      if (label === 'HOURS' || label === 'FEES' || label === 'MAN-DAYS') {
        sectionStarts.push({ col, label })
      }
    }
    if (sectionStarts.length > 0) break // found the label row
  }

  // FTE section starts at the first column past output cols that parses as a date serial
  let fteStart = scanStart + 1 // fallback
  for (let col = scanStart; col <= maxCol; col += 1) {
    if (parseExcelSerialMonth(headers[col])) { fteStart = col; break }
  }
  const hoursStart = sectionStarts.find(s => s.label === 'HOURS')?.col
  const feesStart = sectionStarts.find(s => s.label === 'FEES')?.col
  const mandaysStart = sectionStarts.find(s => s.label === 'MAN-DAYS')?.col

  // Build month labels using row 27 date serials (same dates repeat in each section)
  // When Imp TL start date + duration are available, generate labels from those
  // instead of relying on row 27 — this keeps Staffing in sync with Imp TL edits.
  const generatedLabels = (startSerial && timelineDuration)
    ? generateMonthLabels(startSerial, timelineDuration)
    : null

  const buildMonthCols = (start, end, useGenerated) => {
    const limit = timelineDuration ? Math.min(end, start + timelineDuration) : end
    const cols = []
    for (let col = start; col < limit; col += 1) {
      const offset = col - start
      let label
      if (useGenerated && generatedLabels && offset < generatedLabels.length) {
        label = generatedLabels[offset]
      } else {
        const serial = headers[col] || ''
        const prettyMonth = parseExcelSerialMonth(serial)
        label = prettyMonth || serial || `Col ${col + 1}`
      }
      cols.push({ col, label })
    }
    return cols
  }

  // Build sections dynamically based on what we detected
  const sections = []
  const fteEnd = hoursStart || maxCol + 1
  sections.push({ id: 'fte', label: 'FTE', editable: true, cols: buildMonthCols(fteStart, fteEnd, true) })

  if (hoursStart) {
    const end = feesStart || maxCol + 1
    sections.push({ id: 'hours', label: 'Hours', editable: false, cols: buildMonthCols(hoursStart, end, true) })
  }
  if (feesStart) {
    const end = mandaysStart || maxCol + 1
    sections.push({ id: 'fees', label: 'Fees', editable: false, cols: buildMonthCols(feesStart, end, true) })
  }
  if (mandaysStart) {
    sections.push({ id: 'mandays', label: 'Man-days', editable: false, cols: buildMonthCols(mandaysStart, maxCol + 1, true) })
  }

  // Build active row indices (1-based) — data rows with any roster data
  const activeRows = []
  const rosterColIndices = rosterColumns.map((c) => c.col)
  for (let r1 = dataStartRow + 1; r1 <= rowData.length; r1 += 1) {
    const rowObj = rowData[r1 - 1]
    if (!rowObj) continue
    if (rosterColIndices.some((col) => toText(rowObj[`c${col}`]).trim())) {
      activeRows.push(r1)
    }
  }

  const headerWarnings = detectHeaderMismatches(sections, timelineDuration, startSerial, headers)

  return { maxCol, headers, indexByHeader, rosterColumns, outputColumns, sections, activeRows, headerWarnings }
}

/* ── FTE context menu (right-click fill actions) ── */
const FteContextMenu = memo(function FteContextMenu({ x, y, onAction, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="fte-context-menu" style={{ left: x, top: y }}>
      <button type="button" onClick={() => onAction('fill-right')}>Fill Right <ArrowRight size={12} style={{ marginLeft: 4 }} /></button>
      <button type="button" onClick={() => onAction('fill-left')}><ArrowLeft size={12} style={{ marginRight: 4 }} /> Fill Left</button>
      <button type="button" onClick={() => onAction('fill-all')}>Fill All Months</button>
      <div className="fte-context-divider" />
      <button type="button" onClick={() => onAction('clear-right')}>Clear Right <ArrowRight size={12} style={{ marginLeft: 4 }} /></button>
      <button type="button" onClick={() => onAction('clear-all')}>Clear All Months</button>
    </div>
  )
})

/* ── Memoized row — only re-renders when its row object reference changes ── */
const StaffingRow = memo(function StaffingRow({ rowObj, r1, rosterColumns, outputColumns, windowCols, editable, dropdownMap, onCellEdit, onRemoveRow, hiddenSet, onFteContextMenu, onDragStart, onDragOver, onDrop, isDragOver }) {
  return (
    <tr
      draggable
      onDragStart={(e) => onDragStart(e, r1)}
      onDragOver={(e) => onDragOver(e, r1)}
      onDrop={(e) => onDrop(e, r1)}
      className={isDragOver ? 'staffing-drag-over' : ''}
    >
      <td className="td-drag-handle" title="Drag to reorder">
        <GripVertical size={14} className="drag-grip" />
      </td>
      {rosterColumns.map((col) => {
        if (hiddenSet.has(col.header)) return null
        const colClass = ROSTER_COL_CLASS[col.header] || ''
        const isBand = col.header === 'Band'
        const isRole = col.header === 'Role'
        const options = dropdownMap[col.col]
        if (isRole && options) {
          return (
            <td key={col.header} className={colClass}>
              <CellCombo
                value={toText(rowObj[`c${col.col}`])}
                rowIndex={r1 - 1}
                colIndex={col.col}
                onCellEdit={onCellEdit}
                options={options}
              />
            </td>
          )
        }
        if (options) {
          return (
            <td key={col.header} className={colClass} title={isBand ? toText(rowObj[`c${col.col}`]) : undefined}>
              <CellSelect
                value={toText(rowObj[`c${col.col}`])}
                rowIndex={r1 - 1}
                colIndex={col.col}
                onCellEdit={onCellEdit}
                className="inline-cell-select"
              >
                <option value="">—</option>
                {options.map((opt, i) => <option key={`${opt}-${i}`} value={opt}>{isBand ? normalizeBand(opt) : opt}</option>)}
              </CellSelect>
            </td>
          )
        }
        return (
          <td key={col.header} className={colClass}>
            <CellInput
              value={toText(rowObj[`c${col.col}`])}
              rowIndex={r1 - 1}
              colIndex={col.col}
              onCellEdit={onCellEdit}
            />
          </td>
        )
      })}
      {outputColumns.map((col) => {
        if (hiddenSet.has(`out-${col.header}`)) return null
        const isFees = col.header === 'Fees'
        const formatted = formatDisplayValue(rowObj[`c${col.col}`])
        return <td key={`o-${col.header}`} className={`staffing-output-cell staffing-out-${col.header.toLowerCase().replace(/\s+/g, '-')}`}>{isFees && formatted ? `$${formatted}` : formatted}</td>
      })}
      {windowCols.map((col, idx) => (
        editable ? (
          <td
            key={col.col}
            className={`td-fte${idx === windowCols.length - 1 ? ' td-fte-last' : ''}`}
            onContextMenu={(e) => {
              e.preventDefault()
              onFteContextMenu(e, r1 - 1, col.col, toText(rowObj[`c${col.col}`]))
            }}
          >
            <CellInput
              value={formatFteValue(rowObj[`c${col.col}`])}
              rowIndex={r1 - 1}
              colIndex={col.col}
              onCellEdit={onCellEdit}
            />
            {idx === windowCols.length - 1 && onRemoveRow && (
              <button
                type="button"
                className="staffing-remove-btn"
                title="Remove this resource"
                onClick={() => onRemoveRow(r1 - 1)}
              >×</button>
            )}
          </td>
        ) : (
          <td key={col.col} className={`td-fte cell-readonly${idx === windowCols.length - 1 ? ' td-fte-last' : ''}`}>
            {formatFteValue(rowObj[`c${col.col}`])}
            {idx === windowCols.length - 1 && onRemoveRow && (
              <button
                type="button"
                className="staffing-remove-btn"
                title="Remove this resource"
                onClick={() => onRemoveRow(r1 - 1)}
              >×</button>
            )}
          </td>
        )
      ))}
    </tr>
  )
})

const STAFFING_TOGGLE_COLUMNS = [
  ...EDITABLE_ROSTER_HEADERS.map((h) => ({ key: h, label: h })),
  ...OUTPUT_HEADERS.map((h) => ({ key: `out-${h}`, label: h })),
]

const STAFFING_DEFAULT_VISIBLE = Object.fromEntries(
  STAFFING_TOGGLE_COLUMNS.map((c) => [
    c.key,
    !['Phase', 'Resource Name', 'Role', 'out-Labor Cost', 'out-Man-Days'].includes(c.key),
  ])
)

/**
 * Build phase lanes for the FTE columns from Imp TL lane data.
 * Returns an array of lanes, each with a label and array of band segments.
 * Each band: { token, label, color, startOffset, span }
 */
const buildPhaseLanes = (impTlRowData, fteColCount) => {
  if (!impTlRowData || !impTlRowData.length || !fteColCount) return []
  const tlMaxCol = getMaxCol(impTlRowData)
  const lanes = buildTimelineLanes(impTlRowData, tlMaxCol)
  if (!lanes.length) return []
  const brushMap = buildPhaseBrushMap(impTlRowData)
  const legendMap = buildLegendMap(impTlRowData, lanes)

  return lanes.map((lane) => {
    // Map this lane's segments to FTE column offsets
    const phaseByOffset = new Array(fteColCount).fill(null)
    for (const seg of lane.segments) {
      for (let col = seg.startCol; col <= seg.endCol; col++) {
        const offset = col - 3
        if (offset >= 0 && offset < fteColCount) {
          phaseByOffset[offset] = seg.token
        }
      }
    }
    // Group consecutive identical phases into spans
    const bands = []
    let i = 0
    while (i < fteColCount) {
      const token = phaseByOffset[i]
      if (!token) { i++; continue }
      let span = 1
      while (i + span < fteColCount && phaseByOffset[i + span] === token) span++
      bands.push({
        token,
        label: legendMap[token] || token,
        color: getPhaseColor(token, brushMap),
        startOffset: i,
        span,
      })
      i += span
    }
    const laneLabel = lane.labelB || lane.labelA || lane.labelC || ''
    return { label: laneLabel, bands }
  }).filter((l) => l.bands.length > 0)
}

function StaffingSheetView({ rowData = [], onCellEdit, onAddRow, onRemoveRow, onSwapRows, deletedRows, validations = [], impTlRowData, isSolutioner }) {
  const [query, setQuery] = useState('')
  const [rolloutFilter, setRolloutFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [subTeamFilter, setSubTeamFilter] = useState('')
  const [shoreFilter, setShoreFilter] = useState('')
  const [activeSection, setActiveSection] = useState('fte')
  const collapsedTeamsRef = useRef(new Set())
  const collapsedInitRef = useRef(false)
  const [, forceUpdate] = useState(0) // trigger re-render when collapsedTeamsRef changes
  const { hiddenSet, togglePanel, ColumnTogglePanel } = useColumnToggle(STAFFING_TOGGLE_COLUMNS, STAFFING_DEFAULT_VISIBLE)

  // ── Ref mirror of rowData — useMemos read from this to avoid re-triggering on recalc ──
  const rowDataRef = useRef(rowData)
  rowDataRef.current = rowData

  // ── Structure: recompute only when row count or timeline params change ──
  const structRef = useRef(null)
  const prevLenRef = useRef(-1)
  const prevDurRef = useRef(-1)
  const prevStartRef = useRef(-1)
  const timelineDuration = getTimelineDuration(impTlRowData)
  const startSerial = getTimelineStartSerial(impTlRowData)
  if (rowData.length !== prevLenRef.current || timelineDuration !== prevDurRef.current || startSerial !== prevStartRef.current) {
    prevLenRef.current = rowData.length
    prevDurRef.current = timelineDuration
    prevStartRef.current = startSerial
    structRef.current = computeStructure(rowData, timelineDuration, startSerial)
  }
  const { rosterColumns, outputColumns, sections, activeRows, headerWarnings, indexByHeader } = structRef.current

  // Work Location column (Onshore/Nearshore/Offshore) — formula-driven in the sheet
  const shoreCol = indexByHeader?.['Work Location']

  // ── Dropdown map: col → options[] (stable ref, only recomputed on validation change) ──
  const dropdownMapRef = useRef({})
  const prevValidationsRef = useRef(validations)
  if (validations !== prevValidationsRef.current) {
    prevValidationsRef.current = validations
    dropdownMapRef.current = buildDropdownMap(validations)
  } else if (!Object.keys(dropdownMapRef.current).length && validations.length) {
    dropdownMapRef.current = buildDropdownMap(validations)
  }
  const dropdownMap = dropdownMapRef.current

  // ── Filter options — only recompute when filters/structure change, NOT on recalc ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filterOptions = useMemo(() => {
    const data = rowDataRef.current
    const sets = { rollout: new Set(), team: new Set(), role: new Set(), subTeam: new Set(), shore: new Set() }
    const rolloutCol = rosterColumns.find((c) => c.header === 'Rollout')?.col
    const teamCol = rosterColumns.find((c) => c.header === 'Team')?.col
    const roleCol = rosterColumns.find((c) => c.header === 'Role')?.col
    const subTeamCol = rosterColumns.find((c) => c.header === 'Sub-Team')?.col

    for (const r1 of activeRows) {
      const row = data[r1 - 1]
      if (!row) continue
      if (rolloutCol != null) { const v = toText(row[`c${rolloutCol}`]).trim(); if (v) sets.rollout.add(v) }
      if (teamCol != null) { const v = toText(row[`c${teamCol}`]).trim(); if (v) sets.team.add(v) }
      if (roleCol != null) { const v = toText(row[`c${roleCol}`]).trim(); if (v) sets.role.add(v) }
      if (subTeamCol != null) { const v = toText(row[`c${subTeamCol}`]).trim(); if (v) sets.subTeam.add(v) }
      if (shoreCol != null) { const v = toText(row[`c${shoreCol}`]).trim(); if (v) sets.shore.add(v) }
    }

    const sort = (s) => Array.from(s).sort((a, b) => a.localeCompare(b))
    return { rollout: sort(sets.rollout), team: sort(sets.team), role: sort(sets.role), subTeam: sort(sets.subTeam), shore: sort(sets.shore) }
  }, [activeRows, rosterColumns, shoreCol])

  // ── Filtered row indices — only recompute on filter changes ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredRowIndices = useMemo(() => {
    const data = rowDataRef.current
    const text = query.trim().toLowerCase()
    const rolloutCol = rosterColumns.find((c) => c.header === 'Rollout')?.col
    const teamCol = rosterColumns.find((c) => c.header === 'Team')?.col
    const roleCol = rosterColumns.find((c) => c.header === 'Role')?.col
    const subTeamCol = rosterColumns.find((c) => c.header === 'Sub-Team')?.col

    return activeRows.filter((r1) => {
      const rowIdx = r1 - 1 // 0-based
      if (deletedRows && deletedRows.has(rowIdx)) return false
      const row = data[r1 - 1]
      if (!row) return false
      if (rolloutFilter && toText(row[`c${rolloutCol}`]).trim() !== rolloutFilter) return false
      if (teamFilter && toText(row[`c${teamCol}`]).trim() !== teamFilter) return false
      if (subTeamFilter && toText(row[`c${subTeamCol}`]).trim() !== subTeamFilter) return false
      if (roleFilter && toText(row[`c${roleCol}`]).trim() !== roleFilter) return false
      if (shoreFilter && shoreCol != null && toText(row[`c${shoreCol}`]).trim() !== shoreFilter) return false
      if (text) {
        let blob = ''
        for (const { col } of rosterColumns) blob += toText(row[`c${col}`]).trim() + ' '
        for (const { col } of outputColumns) blob += toText(row[`c${col}`]).trim() + ' '
        if (!blob.toLowerCase().includes(text)) return false
      }
      return true
    })
  }, [activeRows, rosterColumns, outputColumns, rolloutFilter, teamFilter, subTeamFilter, roleFilter, shoreFilter, shoreCol, query, deletedRows])

  // ── Active section for timeline columns ──
  const effectiveSection = sections.find((s) => s.id === activeSection) || sections[0]

  // ── Phase lanes from Imp TL — shows which phases each FTE month belongs to ──
  const phaseLanes = useMemo(() => {
    if (activeSection !== 'fte') return []
    return buildPhaseLanes(impTlRowData, effectiveSection?.cols?.length || 0)
  }, [impTlRowData, effectiveSection?.cols?.length, activeSection])

  const clearFilters = useCallback(() => {
    setQuery('')
    setRolloutFilter('')
    setTeamFilter('')
    setSubTeamFilter('')
    setRoleFilter('')
    setShoreFilter('')
  }, [])

  // ── FTE context menu state ──
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, rowIndex, colIndex, value }
  const handleFteContextMenu = useCallback((e, rowIndex, colIndex, value) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, rowIndex, colIndex, value })
  }, [])
  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])
  const handleCtxAction = useCallback((action) => {
    if (!ctxMenu || !effectiveSection?.cols) { setCtxMenu(null); return }
    const { rowIndex, colIndex, value } = ctxMenu
    const cols = effectiveSection.cols
    const colIdx = cols.findIndex((c) => c.col === colIndex)
    setCtxMenu(null)

    const edits = []
    if (action === 'fill-right') {
      for (let i = colIdx; i < cols.length; i++) {
        edits.push({ rowIndex, colIndex: cols[i].col, value })
      }
    } else if (action === 'fill-left') {
      for (let i = 0; i <= colIdx; i++) {
        edits.push({ rowIndex, colIndex: cols[i].col, value })
      }
    } else if (action === 'fill-all') {
      for (const c of cols) {
        edits.push({ rowIndex, colIndex: c.col, value })
      }
    } else if (action === 'clear-right') {
      for (let i = colIdx; i < cols.length; i++) {
        edits.push({ rowIndex, colIndex: cols[i].col, value: '' })
      }
    } else if (action === 'clear-all') {
      for (const c of cols) {
        edits.push({ rowIndex, colIndex: c.col, value: '' })
      }
    }

    if (edits.length > 0) {
      onCellEdit(edits)
    }
  }, [ctxMenu, effectiveSection, onCellEdit])

  // ── Header warning dismissal ──
  const [warningDismissed, setWarningDismissed] = useState(false)

  // ── Drag-and-drop row reordering ──
  const dragSourceRef = useRef(null) // r1 of the row being dragged
  const [dragOverR1, setDragOverR1] = useState(null)

  const handleDragStart = useCallback((e, r1) => {
    dragSourceRef.current = r1
    e.dataTransfer.effectAllowed = 'move'
    // Minimal drag image data
    e.dataTransfer.setData('text/plain', String(r1))
  }, [])

  const handleDragOver = useCallback((e, r1) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverR1(r1)
  }, [])

  const handleDrop = useCallback((e, targetR1) => {
    e.preventDefault()
    setDragOverR1(null)
    const sourceR1 = dragSourceRef.current
    dragSourceRef.current = null
    if (!sourceR1 || sourceR1 === targetR1) return

    // Use the optimized swap handler — swaps row objects directly in workbookDataRef,
    // records targeted edits, and recalcs only the 2 affected rows.
    if (onSwapRows) {
      onSwapRows(sourceR1 - 1, targetR1 - 1)
    }
  }, [onSwapRows])

  // ── Group filtered rows by Team ──
  const teamCol = rosterColumns.find((c) => c.header === 'Team')?.col
  const [teamOrder, setTeamOrder] = useState([]) // user-defined team ordering
  const groupedByTeam = useMemo(() => {
    const groups = []
    const teamMap = new Map() // teamName → index in groups[]
    for (const r1 of filteredRowIndices) {
      const row = rowDataRef.current[r1 - 1]
      const team = (teamCol != null && row) ? toText(row[`c${teamCol}`]).trim() : ''
      const teamKey = team || '(Unassigned)'
      if (!teamMap.has(teamKey)) {
        teamMap.set(teamKey, groups.length)
        groups.push({ team: teamKey, rows: [] })
      }
      groups[teamMap.get(teamKey)].rows.push(r1)
    }
    // Apply custom team ordering if set
    if (teamOrder.length > 0) {
      const orderIndex = new Map(teamOrder.map((t, i) => [t, i]))
      groups.sort((a, b) => {
        const ai = orderIndex.has(a.team) ? orderIndex.get(a.team) : 9999
        const bi = orderIndex.has(b.team) ? orderIndex.get(b.team) : 9999
        return ai - bi
      })
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRowIndices, teamCol, teamOrder])

  // Collapse all teams by default on first load
  if (!collapsedInitRef.current && groupedByTeam.length > 0) {
    collapsedInitRef.current = true
    for (const g of groupedByTeam) collapsedTeamsRef.current.add(g.team)
  }

  // Compute per-team totals for output + FTE columns
  const companyCol = outputColumns.find(c => c.header === 'Company')?.col
  const teamTotals = useMemo(() => {
    const totals = new Map()
    for (const group of groupedByTeam) {
      const sums = {} // colIndex → number
      const companies = new Set()
      for (const r1 of group.rows) {
        const row = rowData[r1 - 1]
        if (!row) continue
        if (companyCol != null) {
          const cv = toText(row[`c${companyCol}`]).trim()
          if (cv) companies.add(cv)
        }
        for (const oc of outputColumns) {
          if (oc.col === companyCol) continue // Company is text, not summable
          const v = Number(row[`c${oc.col}`])
          if (Number.isFinite(v)) sums[oc.col] = (sums[oc.col] || 0) + v
        }
        for (const fc of effectiveSection.cols) {
          const v = Number(row[`c${fc.col}`])
          if (Number.isFinite(v)) sums[fc.col] = (sums[fc.col] || 0) + v
        }
      }
      totals.set(group.team, { sums, companies: [...companies].sort() })
    }
    return totals
  }, [groupedByTeam, rowData, outputColumns, effectiveSection, companyCol])

  const toggleTeamCollapse = useCallback((team) => {
    const s = collapsedTeamsRef.current
    if (s.has(team)) s.delete(team)
    else s.add(team)
    forceUpdate(n => n + 1)
  }, [])

  // ── Drag-and-drop for team headers ──
  const dragTeamRef = useRef(null)
  const [dragOverTeam, setDragOverTeam] = useState(null)

  const handleTeamDragStart = useCallback((e, team) => {
    e.stopPropagation()
    dragTeamRef.current = team
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `team:${team}`)
  }, [])

  const handleTeamDragOver = useCallback((e, team) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOverTeam(team)
  }, [])

  const handleTeamDrop = useCallback((e, targetTeam) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverTeam(null)
    const sourceTeam = dragTeamRef.current
    dragTeamRef.current = null
    if (!sourceTeam || sourceTeam === targetTeam) return
    // Build new order from current groupedByTeam
    const currentOrder = groupedByTeam.map(g => g.team)
    const srcIdx = currentOrder.indexOf(sourceTeam)
    const tgtIdx = currentOrder.indexOf(targetTeam)
    if (srcIdx === -1 || tgtIdx === -1) return
    currentOrder.splice(srcIdx, 1)
    currentOrder.splice(tgtIdx, 0, sourceTeam)
    setTeamOrder(currentOrder)
  }, [groupedByTeam])

  // ── Add resource to a specific team ──
  const handleAddToTeam = useCallback((team) => {
    if (!onAddRow) return
    const newRowIndex = onAddRow() // returns the 0-based index of the new row
    if (newRowIndex < 0) return
    if (teamCol != null && team && team !== '(Unassigned)') {
      onCellEdit({ rowIndex: newRowIndex, colIndex: teamCol, value: team })
    }
  }, [onAddRow, onCellEdit, teamCol])

  const handleNewTeam = useCallback(() => {
    const name = prompt('New team name:') // eslint-disable-line no-restricted-globals
    if (!name?.trim() || !onAddRow) return
    const newRowIndex = onAddRow()
    if (newRowIndex < 0) return
    if (teamCol != null) {
      onCellEdit({ rowIndex: newRowIndex, colIndex: teamCol, value: name.trim() })
    }
  }, [onAddRow, onCellEdit, teamCol])

  const [filtersOpen, setFiltersOpen] = useState(false)
  const hasActiveFilter = query || rolloutFilter || teamFilter || subTeamFilter || roleFilter || shoreFilter

  return (
    <section className="sheet-form-panel staffing-panel">
      <div className="sheet-panel-header staffing-header-bar">
        <div className="staffing-header-top">
          <h2 className="sheet-panel-title">{getSheetDisplayName('Staffing')}</h2>
          <div className="staffing-header-right">
            <button type="button" className={`staffing-header-btn${filtersOpen ? ' active' : ''}${hasActiveFilter ? ' has-filter' : ''}`} onClick={() => setFiltersOpen(p => !p)}>
              Filters{hasActiveFilter ? ' ●' : ''}
            </button>
            {isSolutioner && <button type="button" className="staffing-header-btn" onClick={togglePanel}>Columns</button>}
          </div>
          {sections.length > 1 && (
            <div className="staffing-section-tabs">
              {sections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  className={`staffing-tab${activeSection === sec.id ? ' active' : ''}`}
                  onClick={() => setActiveSection(sec.id)}
                >
                  {sec.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {filtersOpen && (
          <motion.div
            className="staffing-filters-row"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
          >
            <input className="staffing-header-search" value={query} onChange={(event) => { setQuery(event.target.value) }} placeholder="Search..." />
            <select className="staffing-header-select" value={rolloutFilter} onChange={(event) => { setRolloutFilter(event.target.value) }}>
              <option value="">Rollout</option>
              {filterOptions.rollout.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select className="staffing-header-select" value={teamFilter} onChange={(event) => { setTeamFilter(event.target.value) }}>
              <option value="">Team</option>
              {filterOptions.team.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select className="staffing-header-select" value={subTeamFilter} onChange={(event) => { setSubTeamFilter(event.target.value) }}>
              <option value="">Sub-Team</option>
              {filterOptions.subTeam.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select className="staffing-header-select" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value) }}>
              <option value="">Role</option>
              {filterOptions.role.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select className="staffing-header-select" value={shoreFilter} onChange={(event) => { setShoreFilter(event.target.value) }}>
              <option value="">Shore</option>
              {filterOptions.shore.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {hasActiveFilter && (
              <button type="button" className="staffing-header-clear" onClick={clearFilters}>Clear</button>
            )}
          </motion.div>
        )}
      </div>

      {isSolutioner && <ColumnTogglePanel />}

      {headerWarnings.length > 0 && !warningDismissed && (
        <div className="staffing-header-warning">
          <span className="staffing-warning-icon"><AlertTriangle size={16} /></span>
          <div className="staffing-warning-text">
            <strong>Timeline mismatch detected</strong>
            {headerWarnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
          <button type="button" className="staffing-warning-dismiss" onClick={() => setWarningDismissed(true)}><X size={14} /></button>
        </div>
      )}

      <div className="sheet-data-table-wrap staffing-table-wrap staffing-table-shell">
        <table className="sheet-data-table staffing-table">
          <colgroup>
            <col style={{ width: 28 }} />
          </colgroup>
          <thead>
            {phaseLanes.length > 0 && phaseLanes.map((lane, li) => {
              const visRosterCount = rosterColumns.filter(c => !hiddenSet.has(c.header)).length
              const visOutputCount = outputColumns.filter(c => !hiddenSet.has(`out-${c.header}`)).length
              const leftColSpan = 1 + visRosterCount + visOutputCount
              const cells = []
              let offset = 0
              const fteCols = effectiveSection.cols
              while (offset < fteCols.length) {
                const band = lane.bands.find((b) => offset >= b.startOffset && offset < b.startOffset + b.span)
                if (band && offset === band.startOffset) {
                  cells.push(
                    <th
                      key={`phase-${offset}`}
                      colSpan={band.span}
                      className="th-phase-band"
                      style={{ backgroundColor: band.color }}
                      title={`${band.label} (${band.token})`}
                    >
                      <span className="phase-band-label">{band.label}</span>
                    </th>
                  )
                  offset += band.span
                } else {
                  cells.push(<th key={`gap-${offset}`} className="th-phase-gap" />)
                  offset += 1
                }
              }
              return (
                <tr key={`phase-lane-${li}`} className={`staffing-phase-row${li === 0 ? ' staffing-phase-row--first' : ''}`}>
                  <th colSpan={leftColSpan} className="th-phase-lane-label" title={lane.label}>
                    {lane.label}
                  </th>
                  {cells}
                </tr>
              )
            })}
            <tr>
              <th className="th-drag-handle"></th>
              {rosterColumns.map((col) => hiddenSet.has(col.header) ? null : <th key={col.header} className={`th-roster ${ROSTER_COL_CLASS[col.header] || ''}`}>{col.header}</th>)}
              {outputColumns.map((col) => hiddenSet.has(`out-${col.header}`) ? null : <th key={col.header} className={`th-output staffing-out-${col.header.toLowerCase().replace(/\s+/g, '-')}`}>{col.header}</th>)}
              {(effectiveSection).cols.map((col) => <th key={col.col} className="th-fte">{col.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedByTeam.map((group, gi) => {
              const isCollapsed = collapsedTeamsRef.current.has(group.team)
              const visRoster = rosterColumns.filter(c => !hiddenSet.has(c.header))
              const visOutput = outputColumns.filter(c => !hiddenSet.has(`out-${c.header}`))
              const teamData = teamTotals.get(group.team) || { sums: {}, companies: [] }
              const sums = teamData.sums
              const companies = teamData.companies
              const isDragTarget = dragOverTeam === group.team
              const totalColCount = 1 + visRoster.length + visOutput.length + effectiveSection.cols.length
              const bandVisible = !hiddenSet.has('Band')
              const preBandRosterCount = bandVisible ? visRoster.length - 1 : visRoster.length
              const accent = TEAM_ACCENT_PALETTE[gi % TEAM_ACCENT_PALETTE.length]
              return (
                <Fragment key={`team-${group.team}`}>
                  <tr
                    className={`staffing-team-header${isDragTarget ? ' staffing-team-drag-over' : ''}`}
                    draggable
                    onDragStart={(e) => handleTeamDragStart(e, group.team)}
                    onDragOver={(e) => handleTeamDragOver(e, group.team)}
                    onDrop={(e) => handleTeamDrop(e, group.team)}
                    onClick={() => toggleTeamCollapse(group.team)}
                  >
                    {isCollapsed ? (
                      <>
                        <td className="team-header-label" colSpan={1 + preBandRosterCount}>
                          <GripVertical size={13} className="team-drag-grip" title="Drag to reorder teams" />
                          <ChevronDown size={13} className={`team-collapse-icon collapsed`} style={{ color: accent }} />
                          <span className="team-header-name" style={{ color: accent }}>{group.team}</span>
                          <span className="team-header-count">{group.rows.length} {group.rows.length === 1 ? 'resource' : 'resources'}</span>
                        </td>
                        {bandVisible && <td className="team-header-band staffing-col-band" />}
                        {visOutput.map((col) => {
                          const outClass = `staffing-out-${col.header.toLowerCase().replace(/\s+/g, '-')}`
                          if (col.header === 'Company') {
                            return (
                              <td key={`o-${col.header}`} className={`team-total-cell team-total-output team-total-company ${outClass}`}>
                                {companies.join(', ')}
                              </td>
                            )
                          }
                          const val = sums[col.col] != null ? formatDisplayValue(sums[col.col]) : ''
                          return (
                            <td key={`o-${col.header}`} className={`team-total-cell team-total-output ${outClass}`}>
                              {col.header === 'Fees' && val ? `$${val}` : val}
                            </td>
                          )
                        })}
                        {effectiveSection.cols.map((col) => (
                          <td key={col.col} className="team-total-cell team-total-fte">
                            {sums[col.col] != null ? formatDisplayValue(sums[col.col]) : ''}
                          </td>
                        ))}
                      </>
                    ) : (
                      <>
                        <td className="team-header-label" colSpan={1 + preBandRosterCount}>
                          <GripVertical size={13} className="team-drag-grip" title="Drag to reorder teams" />
                          <ChevronDown size={13} className="team-collapse-icon" style={{ color: accent }} />
                          <span className="team-header-name" style={{ color: accent }}>{group.team}</span>
                          <span className="team-header-count">{group.rows.length} {group.rows.length === 1 ? 'resource' : 'resources'}</span>
                        </td>
                        {bandVisible && <td className="team-header-band staffing-col-band" colSpan={1 + visOutput.length + effectiveSection.cols.length} />}
                        {!bandVisible && <td colSpan={visOutput.length + effectiveSection.cols.length} />}
                      </>
                    )}
                  </tr>
                  {!isCollapsed && group.rows.map((r1) => (
                    <StaffingRow
                      key={r1}
                      rowObj={rowData[r1 - 1] || {}}
                      r1={r1}
                      rosterColumns={rosterColumns}
                      outputColumns={outputColumns}
                      windowCols={effectiveSection.cols}
                      editable={effectiveSection.editable}
                      dropdownMap={dropdownMap}
                      onCellEdit={onCellEdit}
                      onRemoveRow={onRemoveRow}
                      hiddenSet={hiddenSet}
                      onFteContextMenu={handleFteContextMenu}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      isDragOver={dragOverR1 === r1}
                    />
                  ))}
                  {!isCollapsed && onAddRow && (
                    <tr className="staffing-team-add-row">
                      <td colSpan={1 + visRoster.length + visOutput.length + effectiveSection.cols.length}>
                        <button type="button" className="staffing-team-add-btn" onClick={(e) => { e.stopPropagation(); handleAddToTeam(group.team) }}>
                          + Add to {group.team}
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="staffing-meta-bar">
        {onAddRow && <button type="button" className="staffing-new-team-btn" onClick={handleNewTeam}>+ New Team</button>}
        <div className="staffing-meta-stats">
          <span>{activeRows.length} resources</span>
          <span>{filteredRowIndices.length} shown</span>
          {timelineDuration && <span>{timelineDuration} months</span>}
        </div>
      </div>

      {ctxMenu && createPortal(
        <FteContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onAction={handleCtxAction}
          onClose={closeCtxMenu}
        />,
        document.body
      )}
    </section>
  )
}

export default memo(StaffingSheetView)
