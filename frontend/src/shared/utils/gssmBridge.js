/**
 * gssmBridge.js — Pure functions to convert between GSSM workbook cell data
 * and structured deal fields. Field keys and PTI cell positions come from the
 * field index (shared/field_index.json); sheet layouts from gssmFieldMap.
 *
 * Operates on raw rowData arrays (workbookDataRef.current.rowDataBySheet shape).
 * No React, no GSSM component imports.
 */

import {
  IMP_TL, BID_METRICS, STAFFING, PHASE_CODE_TO_DEAL, DEAL_PHASE_TO_CODE,
} from '../constants/gssmFieldMap'
import { fieldsWhere, gssmCell, isGssmLinked } from '../constants/fieldIndex'
import { PHASE_ORDER, matchPhase } from './phases'

/** GSSM-owned financial fields read straight off the PTI_Estimator sheet. */
const PTI_FIELDS = fieldsWhere((field) => field.owner === 'gssm' && field.gssm?.startsWith('PTI_Estimator!'))

/* ── Helpers ── */
const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const toStr = (v) => (v == null ? '' : String(v).trim())
const cell  = (rows, r, c) => rows?.[r]?.[`c${c}`]
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function excelSerialToISO(serial) {
  const num = Number(serial)
  if (!Number.isFinite(num) || num < 1) return null
  const utcDays = Math.floor(num - 25569)
  const d = new Date(utcDays * 86400 * 1000)
  if (isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isoToExcelSerial(isoDate) {
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return null
  return Math.floor((d.getTime() / 86400000) + 25569)
}

/* ═══════════════════════════════════════════════
 *  GSSM → Deal Extractors
 * ═══════════════════════════════════════════════ */

/**
 * Extract structured timelines from Imp TL sheet.
 * @returns {Array|null} array of deal timeline objects
 */
export function extractTimeline(impTlRows) {
  if (!impTlRows || impTlRows.length < 16) return null

  const legend = {}
  for (let r = IMP_TL.LEGEND_START_ROW; r <= IMP_TL.LEGEND_END_ROW; r++) {
    const code = toStr(cell(impTlRows, r, IMP_TL.LEGEND_CODE_COL))
    const label = toStr(cell(impTlRows, r, IMP_TL.LEGEND_LABEL_COL))
    if (code) legend[code] = label
  }

  const startSerial = cell(impTlRows, IMP_TL.START_DATE_ROW, IMP_TL.START_DATE_COL)
  const startDate = excelSerialToISO(startSerial)
  const totalDuration = toNum(cell(impTlRows, IMP_TL.DURATION_ROW, IMP_TL.DURATION_COL))

  // Find max data column
  let maxCol = IMP_TL.LANE_DATA_START_COL
  for (let r = IMP_TL.LANE_START_ROW; r < Math.min(impTlRows.length, 120); r++) {
    const row = impTlRows[r]
    if (!row) continue
    for (const key of Object.keys(row)) {
      if (!key.startsWith('c')) continue
      const c = Number(key.slice(1))
      if (c > maxCol) maxCol = c
    }
  }

  const lanes = []
  for (let r = IMP_TL.LANE_START_ROW; r < impTlRows.length; r += 2) {
    const row = impTlRows[r]
    if (!row) continue

    // Merged cells repeat their value in every spanned column — dedupe
    // consecutive identical tokens so "Rollout 1" doesn't become
    // "Rollout 1 Rollout 1 Rollout 1".
    const laneName = IMP_TL.LANE_NAME_COLS
      .map(c => toStr(cell(impTlRows, r, c)))
      .filter(Boolean)
      .filter((part, i, arr) => part !== arr[i - 1])
      .join(' ')
    if (!laneName) continue

    const segments = []
    let currentToken = null, segStart = 0, span = 0

    for (let c = IMP_TL.LANE_DATA_START_COL; c <= maxCol; c++) {
      const token = toStr(cell(impTlRows, r, c))
      if (token && token !== currentToken) {
        if (currentToken) {
          segments.push({ token: currentToken, startMonth: segStart - IMP_TL.LANE_DATA_START_COL, spanMonths: span })
        }
        currentToken = token
        segStart = c
        span = 1
      } else if (token === currentToken) {
        span++
      } else if (!token && currentToken) {
        segments.push({ token: currentToken, startMonth: segStart - IMP_TL.LANE_DATA_START_COL, spanMonths: span })
        currentToken = null
      }
    }
    if (currentToken) {
      segments.push({ token: currentToken, startMonth: segStart - IMP_TL.LANE_DATA_START_COL, spanMonths: span })
    }

    if (segments.length > 0) lanes.push({ name: laneName, segments })
  }

  return lanes.map(lane => {
    const phaseMap = {}
    for (const seg of lane.segments) {
      const dealPhase = PHASE_CODE_TO_DEAL[seg.token] || legend[seg.token] || seg.token
      if (phaseMap[dealPhase]) {
        phaseMap[dealPhase].duration += seg.spanMonths
      } else {
        phaseMap[dealPhase] = { duration: seg.spanMonths, unit: 'months' }
      }
    }
    const laneTotal = lane.segments.reduce((s, seg) => s + seg.spanMonths, 0)
    return {
      name: lane.name,
      project_start_date: startDate || '',
      total_duration: laneTotal || totalDuration,
      timeline: phaseMap,
      _gssm_source: true,
    }
  })
}

/**
 * Extract the PTI_Estimator values GSSM owns (report, inputs, policy, contingency).
 * Values are stored as the workbook has them; empty cells are left out, never defaulted.
 * @returns {object|null} partial deal.financials keyed by field-index keys
 */
export function extractFinancials(ptiRows) {
  if (!ptiRows || ptiRows.length < 44) return null

  const result = {}
  for (const [key, field] of PTI_FIELDS) {
    const { row, col } = gssmCell(key)
    const raw = cell(ptiRows, row, col)
    if (raw == null || raw === '') continue
    if (field.type === 'percent') {
      const num = toNum(raw)
      // Excel stores 27% as 0.27; deal records keep display percentages.
      result[key] = Math.abs(num) < 1 && num !== 0 ? (num * 100).toFixed(2) : String(num)
    } else {
      result[key] = toStr(raw)
    }
  }

  // GSSM has no separate TCV cell; services revenue is the deal's TCV.
  if (result.services_revenue) result.tcv = result.services_revenue

  return result
}

/**
 * Extract staffing summary from Staffing sheet.
 * @returns {object|null} structured deal.staffing
 */
export function extractStaffingSummary(staffingRows) {
  if (!staffingRows || staffingRows.length < 28) return null

  // Detect header row
  let headerRow = STAFFING.DEFAULT_HEADER_ROW
  let dataStartRow = STAFFING.DEFAULT_DATA_START_ROW
  const limit = Math.min(staffingRows.length, 60)
  for (let r = 0; r < limit; r++) {
    const row = staffingRows[r]
    if (!row || toStr(row.c0) !== 'Rollout') continue
    for (let c = 1; c < 80; c++) {
      if (toStr(row[`c${c}`]) === 'Fees') {
        headerRow = r
        dataStartRow = r + 1
        break
      }
    }
    if (headerRow !== STAFFING.DEFAULT_HEADER_ROW) break
  }

  // Column map
  const hdr = staffingRows[headerRow] || {}
  const colMap = {}
  for (const key of Object.keys(hdr)) {
    if (!key.startsWith('c')) continue
    const c = Number(key.slice(1))
    const name = toStr(hdr[key])
    if (name && !(name in colMap)) colMap[name] = c
  }

  // Detect FTE section boundary
  const row11 = staffingRows[10] || {}
  let maxCol = 0
  for (const row of staffingRows) {
    if (!row) continue
    for (const key of Object.keys(row)) {
      if (!key.startsWith('c')) continue
      const c = Number(key.slice(1))
      if (c > maxCol) maxCol = c
    }
  }
  let hoursStart = maxCol + 1
  for (let c = STAFFING.FTE_START_COL; c <= maxCol; c++) {
    if (toStr(row11[`c${c}`]).toUpperCase() === 'HOURS') { hoursStart = c; break }
  }

  // Aggregate
  let totalHeadcount = 0, totalHours = 0, totalFees = 0, totalLaborCost = 0
  const bandDist = {}, teamDist = {}, locationDist = {}, roleDist = {}

  for (let r = dataStartRow; r < staffingRows.length; r++) {
    const row = staffingRows[r]
    if (!row) continue

    const rollout = toStr(row[`c${colMap['Rollout'] ?? 0}`])
    const resource = toStr(row[`c${colMap['Resource Name'] ?? 8}`])
    const team = toStr(row[`c${colMap['Team'] ?? 6}`])
    if (!rollout && !resource && !team) continue

    totalHeadcount++
    totalHours     += colMap['Hours'] != null ? toNum(row[`c${colMap['Hours']}`]) : 0
    totalFees      += colMap['Fees'] != null ? toNum(row[`c${colMap['Fees']}`]) : 0
    totalLaborCost += colMap['Labor Cost'] != null ? toNum(row[`c${colMap['Labor Cost']}`]) : 0

    const band = toStr(row[`c${colMap['Band'] ?? 13}`])
    if (band) bandDist[band] = (bandDist[band] || 0) + 1
    if (team) teamDist[team] = (teamDist[team] || 0) + 1

    const location = toStr(row[`c${colMap['Work Location']}`]) || toStr(row[`c${colMap['Coverage']}`])
    if (location) locationDist[location] = (locationDist[location] || 0) + 1

    const role = toStr(row[`c${colMap['Role'] ?? 9}`])
    if (role) roleDist[role] = (roleDist[role] || 0) + 1
  }

  // Monthly FTE totals
  const monthlyFte = {}
  for (let c = STAFFING.FTE_START_COL; c < hoursStart; c++) {
    const serial = toStr(staffingRows[headerRow]?.[`c${c}`])
    const num = Number(serial)
    if (!Number.isFinite(num) || num < 1) continue
    const utcDays = Math.floor(num - 25569)
    const date = new Date(utcDays * 86400 * 1000)
    if (isNaN(date.getTime())) continue
    const label = `${MONTH_ABBR[date.getUTCMonth()]}-${String(date.getUTCFullYear()).slice(-2)}`
    let sum = 0
    for (let r = dataStartRow; r < staffingRows.length; r++) {
      sum += toNum(staffingRows[r]?.[`c${c}`])
    }
    monthlyFte[label] = Math.round(sum * 100) / 100
  }

  return {
    total_headcount: totalHeadcount,
    total_hours: Math.round(totalHours),
    total_fees: Math.round(totalFees),
    total_labor_cost: Math.round(totalLaborCost),
    band_distribution: bandDist,
    team_distribution: teamDist,
    location_distribution: locationDist,
    role_distribution: roleDist,
    monthly_fte: monthlyFte,
    synced_at: new Date().toISOString(),
  }
}

/**
 * Extract bid metrics from Bid Metrics sheet.
 * @returns {object|null} deal.bid_metrics
 */
export function extractBidMetrics(bidMetricsRows) {
  if (!bidMetricsRows || bidMetricsRows.length < 6) return null

  const region  = toStr(cell(bidMetricsRows, BID_METRICS.REGION.row, BID_METRICS.REGION.col))
  const bidType = toStr(cell(bidMetricsRows, BID_METRICS.BID_TYPE.row, BID_METRICS.BID_TYPE.col))
  const avgFte  = toNum(cell(bidMetricsRows, BID_METRICS.AVG_FTE.row, BID_METRICS.AVG_FTE.col))

  const criteria = []
  for (let r = BID_METRICS.CRITERIA_START_ROW; r <= BID_METRICS.CRITERIA_END_ROW; r++) {
    const name = toStr(cell(bidMetricsRows, r, BID_METRICS.COL_CRITERIA))
    if (!name) continue
    criteria.push({
      criteria: name,
      low:    toStr(cell(bidMetricsRows, r, BID_METRICS.COL_LOW)),
      high:   toStr(cell(bidMetricsRows, r, BID_METRICS.COL_HIGH)),
      actual: toStr(cell(bidMetricsRows, r, BID_METRICS.COL_ACTUAL)),
      met:    toStr(cell(bidMetricsRows, r, BID_METRICS.COL_MET)),
      type:   toStr(cell(bidMetricsRows, r, BID_METRICS.COL_HARD_SOFT)),
    })
  }

  return {
    region,
    bid_type: bidType,
    avg_fte: avgFte,
    criteria,
    met_count: criteria.filter(c => c.met.toLowerCase() === 'yes').length,
    total_count: criteria.length,
    synced_at: new Date().toISOString(),
  }
}

/**
 * Extract RICEFW Estimation summary from the sheet's right-side summary table.
 * Produces a compact read-only snapshot for iSBD projection.
 *
 * @param {Array} ricefwRows — rowData for "RICEFW Estimation" sheet
 * @returns {object|null} { years, summaryRows, additionalRows, grandTotal, byType, totalHours, totalObjects }
 */
export function extractRicefwSummary(ricefwRows) {
  if (!ricefwRows || ricefwRows.length < 20) return null

  // Year labels (0-based row 9, cols c2/c7/c12)
  const yearLabelCols = [2, 7, 12]
  const years = yearLabelCols.map(c => toStr(cell(ricefwRows, 9, c))).filter(Boolean)
  if (!years.length) return null

  // Summary hours table: col c17=type, c18/c19/c20 = y1/y2/y3 hours, c21 = total
  const SUM_TYPE = 17, SUM_Y1 = 18, SUM_Y2 = 19, SUM_Y3 = 20, SUM_TOT = 21
  const summaryRows = []
  for (let r = 10; r < Math.min(ricefwRows.length, 40); r++) {
    const name = toStr(cell(ricefwRows, r, SUM_TYPE))
    if (!name) continue
    const entry = {
      name,
      y1: toNum(cell(ricefwRows, r, SUM_Y1)),
      y2: toNum(cell(ricefwRows, r, SUM_Y2)),
      y3: toNum(cell(ricefwRows, r, SUM_Y3)),
      total: toNum(cell(ricefwRows, r, SUM_TOT)),
    }
    if (name.toLowerCase() === 'total') { summaryRows.push({ ...entry, isTotal: true }); break }
    summaryRows.push(entry)
  }

  // Additional effort rows (after summary total)
  const additionalRows = []
  let grandTotal = null
  const totalEntry = summaryRows.find(s => s.isTotal)
  if (totalEntry) {
    const startR = summaryRows.indexOf(totalEntry)
    const absR = 10 + startR
    for (let r = absR + 1; r < Math.min(ricefwRows.length, absR + 20); r++) {
      const label = toStr(cell(ricefwRows, r, SUM_TYPE))
      if (!label) continue
      if (label.toLowerCase() === 'grand total') {
        grandTotal = {
          y1: toNum(cell(ricefwRows, r, SUM_Y1)),
          y2: toNum(cell(ricefwRows, r, SUM_Y2)),
          y3: toNum(cell(ricefwRows, r, SUM_Y3)),
          total: toNum(cell(ricefwRows, r, SUM_TOT)),
        }
        break
      }
      if (label.toLowerCase() === 'additional effort' || label.toLowerCase() === 'sub total') continue
      additionalRows.push({
        name: label,
        y1: toNum(cell(ricefwRows, r, SUM_Y1)),
        y2: toNum(cell(ricefwRows, r, SUM_Y2)),
        y3: toNum(cell(ricefwRows, r, SUM_Y3)),
        total: toNum(cell(ricefwRows, r, SUM_TOT)),
      })
    }
  }

  // Classify RICEFW type codes from section names and aggregate by type
  // Scan section title rows (rows with "Objects" in col c4)
  const TYPE_PATTERNS = {
    R: /\breport/i, I: /\binterface/i, C: /\bconversion/i,
    E: /\bextension|enhance/i, F: /\bform|workflow/i, W: /\bworkflow|btp.*workflow/i,
  }
  const byType = {}
  const YEAR_GROUPS = [
    { count: 3, objects: 4, hours: 5 },
    { count: 8, objects: 9, hours: 10 },
    { count: 13, objects: 14, hours: 15 },
  ]
  let r = 10
  let totalObjects = 0
  while (r < ricefwRows.length) {
    const objLabel = toStr(cell(ricefwRows, r, 4)).toLowerCase()
    const hrsLabel = toStr(cell(ricefwRows, r, 5)).toLowerCase()
    if (objLabel === 'objects' && hrsLabel === 'hours') {
      const name = toStr(cell(ricefwRows, r, 2))
      let code = '?'
      for (const [c, pat] of Object.entries(TYPE_PATTERNS)) {
        if (pat.test(name)) { code = c; break }
      }
      // Find total row
      let totalRow = -1
      for (let tr = r + 1; tr < Math.min(ricefwRows.length, r + 8); tr++) {
        if (toStr(cell(ricefwRows, tr, 3)).toLowerCase() === 'total') { totalRow = tr; break }
      }
      if (totalRow >= 0) {
        const hours = YEAR_GROUPS.reduce((s, yg) => s + toNum(cell(ricefwRows, totalRow, yg.hours)), 0)
        const objects = YEAR_GROUPS.reduce((s, yg) => s + toNum(cell(ricefwRows, totalRow, yg.objects)), 0)
        totalObjects += objects
        if (!byType[code]) byType[code] = { hours: 0, objects: 0, count: 0 }
        byType[code].hours += hours
        byType[code].objects += objects
        byType[code].count++
        r = totalRow + 1
      } else { r++ }
    } else { r++ }
  }

  const totalHours = summaryRows.find(s => s.isTotal)?.total || 0
  if (totalHours === 0 && Object.keys(byType).length === 0) return null

  // Filter out years with zero data
  const yearSums = years.map((_, i) => {
    const key = ['y1', 'y2', 'y3'][i]
    return summaryRows.reduce((s, row) => s + (row[key] || 0), 0)
  })
  const activeYears = years.map((label, i) => ({ label, key: ['y1', 'y2', 'y3'][i] }))
    .filter((_, i) => yearSums[i] > 0)

  return {
    years: activeYears,
    summaryRows: summaryRows.filter(s => !s.isTotal),
    additionalRows,
    grandTotal,
    subtotal: totalEntry ? { y1: totalEntry.y1, y2: totalEntry.y2, y3: totalEntry.y3, total: totalEntry.total } : null,
    byType,
    totalHours,
    totalObjects,
    synced_at: new Date().toISOString(),
  }
}

/* ═══════════════════════════════════════════════
 *  Deal → GSSM Mappers
 * ═══════════════════════════════════════════════ */

/**
 * Convert deal.timelines to Imp TL edits — intake form + phase lane cells.
 * Used to hand a Home-drawn timeline to a freshly linked workbook (empty cells only).
 * @returns {Array} [{ sheet: 'Imp TL', row, col, value }]
 */
export function mapTimelineToImpTlEdits(timelines) {
  if (!timelines || timelines.length === 0) return []
  const tl0 = timelines[0]
  const edits = []

  // Intake form fields (first timeline drives the project-level fields)
  if (tl0.project_start_date) {
    const serial = isoToExcelSerial(tl0.project_start_date)
    if (serial) edits.push({ sheet: 'Imp TL', row: IMP_TL.START_DATE_ROW, col: IMP_TL.START_DATE_COL, value: serial })
  }
  if (tl0.total_duration) {
    edits.push({ sheet: 'Imp TL', row: IMP_TL.DURATION_ROW, col: IMP_TL.DURATION_COL, value: tl0.total_duration })
  }

  // Phase lane cells — deal phase durations become GSSM phase-code tokens
  for (let laneIdx = 0; laneIdx < timelines.length; laneIdx++) {
    const lane = timelines[laneIdx]
    if (!lane?.timeline) continue
    const laneRow = IMP_TL.LANE_START_ROW + (laneIdx * 2)

    const normalized = {}
    for (const [key, d] of Object.entries(lane.timeline)) {
      const phase = matchPhase(key)
      if (!phase || !d) continue
      const months = d.unit === 'weeks' ? Math.ceil(d.duration / 4.33) : (d.duration || 0)
      normalized[phase] = (normalized[phase] || 0) + months
    }

    let col = IMP_TL.LANE_DATA_START_COL
    for (const phase of PHASE_ORDER) {
      const months = normalized[phase] || 0
      const code = DEAL_PHASE_TO_CODE[phase]
      for (let m = 0; m < months; m++) {
        edits.push({ sheet: 'Imp TL', row: laneRow, col, value: code })
        col++
      }
    }

    // Write lane name (col 0)
    if (lane.name) {
      edits.push({ sheet: 'Imp TL', row: laneRow, col: 0, value: lane.name })
    }
  }

  return edits
}

/**
 * Full GSSM→Deal extraction: runs all extractors on workbook data.
 * @param {object} rowDataBySheet — workbookDataRef.current.rowDataBySheet
 * @returns {object} deal-shaped payload ready for dealService.update()
 */
export function extractAllFromWorkbook(rowDataBySheet) {
  if (!rowDataBySheet) return {}
  const payload = {}

  const timelines = extractTimeline(rowDataBySheet['Imp TL'])
  if (timelines?.length) payload.timelines = timelines

  const financials = extractFinancials(rowDataBySheet['PTI_Estimator'])
  if (financials) payload.financials = financials

  const staffing = extractStaffingSummary(rowDataBySheet['Staffing'])
  if (staffing) payload.staffing = staffing

  const bidMetrics = extractBidMetrics(rowDataBySheet['Bid Metrics'])
  if (bidMetrics) payload.bid_metrics = bidMetrics

  const ricefw = extractRicefwSummary(rowDataBySheet['RICEFW Estimation'])
  if (ricefw) payload.gssm_ricefw = ricefw

  payload.gssm_synced_at = new Date().toISOString()
  return payload
}

/**
 * Deal → GSSM seeding. GSSM owns every PTI value, so only a Home-drawn
 * timeline is handed over — and only to a workbook the deal isn't linked to yet.
 * @param {object} deal — deal object
 * @returns {Array} [{ sheet, row, col, value }]
 */
export function mapDealToGssmEdits(deal) {
  if (!deal || isGssmLinked(deal)) return []
  return mapTimelineToImpTlEdits(deal.timelines)
}
