/**
 * pivotEngine.js — Pure functional pivot aggregation engine.
 *
 * Reads Staffing sheet rowData from calcMetaRef and produces
 * grouped, summed pivot tables matching the GSSM Excel pivots.
 *
 * Zero server calls, zero side effects — works on the same
 * in-memory data that the Staffing form view already renders.
 */

const toText = (v) => (v == null ? '' : String(v))
const toNum = (v) => {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/* ── Column detection (mirrors StaffingSheetView logic) ── */

const ROSTER_NAMES = ['Rollout', 'Phase', 'Contract Holder', 'Coverage', 'Team Type', 'Team', 'Sub-Team', 'Resource Name', 'Role', 'Required Skill', 'Job Role', 'Speciality', 'JRS Services', 'Band']
const VALUE_NAMES = ['Hours', 'Fees']

/* Fields that are numeric (should be toNum'd instead of toText'd) */
const NUMERIC_FIELDS = new Set(['Hours', 'Fees', 'Weighted Hours', 'Base Cost Rate', 'Adder', 'Numeric Level', 'Band Level'])

/**
 * Build a {headerName → colIndex} map from the Staffing header row (row 27, 0-indexed 26).
 */
const buildColumnMap = (staffingRowData) => {
  if (!staffingRowData || !staffingRowData.length) return {}
  const headerRow = staffingRowData[26] // row 27 (0-indexed 26)
  if (!headerRow) return {}

  const map = {}
  for (const key of Object.keys(headerRow)) {
    if (key.charCodeAt(0) !== 99) continue // "c" prefix
    const col = Number(key.slice(1))
    const name = toText(headerRow[key]).trim()
    if (name && !(name in map)) {
      map[name] = col
    }
  }
  return map
}

/**
 * Detect FTE month columns from row 11 section markers and row 27 date headers.
 * Returns array of {col, label} with month labels like "Jan-25".
 */
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const parseExcelSerialMonth = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 1) return null
  const utcDays = Math.floor(num - 25569)
  const date = new Date(utcDays * 86400 * 1000)
  if (Number.isNaN(date.getTime())) return null
  const mon = MONTH_ABBR[date.getUTCMonth()]
  const yr = String(date.getUTCFullYear()).slice(-2)
  return `${mon}-${yr}`  // e.g. "Jan-26" — locale-independent
}

/**
 * Build a d-Mon-yy key (e.g. "1-Jan-26") matching PivotInfo's DateFormat2.
 */
const pivotInfoDateKey = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 1) return null
  const utcDays = Math.floor(num - 25569)
  const date = new Date(utcDays * 86400 * 1000)
  if (Number.isNaN(date.getTime())) return null
  const day = date.getUTCDate()
  const mon = MONTH_ABBR[date.getUTCMonth()]
  const yr = String(date.getUTCFullYear()).slice(-2)
  return `${day}-${mon}-${yr}` // e.g. "1-Jan-26"
}

export const detectFteColumns = (staffingRowData) => {
  if (!staffingRowData || staffingRowData.length < 27) return []
  const row11 = staffingRowData[10] || {}
  const headerRow = staffingRowData[26] || {}

  // Find max col
  let maxCol = 0
  for (const row of staffingRowData) {
    if (!row) continue
    for (const key of Object.keys(row)) {
      if (key.charCodeAt(0) !== 99) continue
      const c = Number(key.slice(1))
      if (c > maxCol) maxCol = c
    }
  }

  // Find section boundaries
  let hoursStart = maxCol + 1
  for (let col = 42; col <= maxCol; col++) {
    const label = toText(row11[`c${col}`]).trim().toUpperCase()
    if (label === 'HOURS') { hoursStart = col; break }
  }

  // FTE columns: 42 to hoursStart
  const cols = []
  for (let col = 42; col < hoursStart; col++) {
    const serial = toText(headerRow[`c${col}`]).trim()
    const label = parseExcelSerialMonth(serial) || serial || `M${col - 41}`
    cols.push({ col, label })
  }
  return cols
}

/**
 * Extract data rows from Staffing sheet.
 * Returns array of objects with named fields for easy pivoting.
 * Extracts ALL header-mapped columns so PivotInfo definitions
 * can reference any field (Work Location, Country, Band Level, etc.).
 */
export const extractStaffingRows = (staffingRowData) => {
  if (!staffingRowData || staffingRowData.length < 28) return []

  const colMap = buildColumnMap(staffingRowData)
  const fteMonths = detectFteColumns(staffingRowData)

  // Build set of FTE column indices to avoid double-counting them
  const fteColSet = new Set(fteMonths.map((mc) => mc.col))
  const headerRow = staffingRowData[26] || {}

  // Pre-compute PivotInfo date keys for FTE months (e.g. "1-Jan-26")
  const fteAltKeys = fteMonths.map((mc) => {
    const serial = toText(headerRow[`c${mc.col}`]).trim()
    const piKey = pivotInfoDateKey(serial)
    return (piKey && piKey !== mc.label) ? piKey : null
  })

  const rows = []
  for (let r = 27; r < staffingRowData.length; r++) {
    const row = staffingRowData[r]
    if (!row) continue

    // Skip empty rows (no roster data)
    const hasData = ROSTER_NAMES.some((name) => {
      const col = colMap[name]
      return col != null && toText(row[`c${col}`]).trim()
    })
    if (!hasData) continue

    const record = { _rowIndex: r }

    // Extract ALL header-mapped columns (roster, value, and any extra like
    // Work Location, Country, Numeric Level, Band Level, Weighted Hours, etc.)
    for (const [name, col] of Object.entries(colMap)) {
      if (fteColSet.has(col)) continue // FTE month cols handled below
      record[name] = NUMERIC_FIELDS.has(name)
        ? toNum(row[`c${col}`])
        : toText(row[`c${col}`]).trim()
    }

    // Monthly FTE values — store under both the short label (Jan-26)
    // and the PivotInfo d-Mon-yy key (1-Jan-26) so pivot field lookups match
    let totalFte = 0
    for (let mi = 0; mi < fteMonths.length; mi++) {
      const mc = fteMonths[mi]
      const val = toNum(row[`c${mc.col}`])
      record[mc.label] = val
      totalFte += val
      // Also store under PivotInfo's DateFormat2 key (e.g. "1-Jan-26")
      if (fteAltKeys[mi]) record[fteAltKeys[mi]] = val
    }
    record['Total FTE'] = totalFte

    rows.push(record)
  }
  return rows
}

/* ── Generic pivot aggregation ── */

/**
 * Pivot a dataset:
 *   rows:      array of row objects (from extractStaffingRows)
 *   groupBy:   array of field names to group by, e.g. ['Company', 'Team']
 *   values:    array of {field, agg} where agg is 'sum'|'count'|'avg'|'max'|'min'
 *   filter:    optional (row) => boolean predicate
 *
 * Returns:
 *   {
 *     groups:  array of { key: {Company: 'IBM', Team: 'Basis'}, values: {Hours: 1234, Fees: 5678} }
 *     totals:  { Hours: grand_total, Fees: grand_total }
 *   }
 */
export const pivot = (rows, groupBy, values, filter) => {
  const filtered = filter ? rows.filter(filter) : rows
  const groups = new Map()

  for (const row of filtered) {
    // Build group key
    const keyParts = groupBy.map((f) => row[f] ?? '')
    const keyStr = keyParts.join('\x00')

    let group = groups.get(keyStr)
    if (!group) {
      const key = {}
      groupBy.forEach((f, i) => { key[f] = keyParts[i] })
      group = { key, values: {}, _count: 0 }
      for (const v of values) {
        group.values[v.field] = 0
      }
      groups.set(keyStr, group)
    }

    group._count += 1
    for (const v of values) {
      const raw = toNum(row[v.field])
      if (v.agg === 'sum' || v.agg === 'avg') {
        group.values[v.field] += raw
      } else if (v.agg === 'max') {
        group.values[v.field] = Math.max(group.values[v.field], raw)
      } else if (v.agg === 'min') {
        if (group._count === 1) group.values[v.field] = raw
        else group.values[v.field] = Math.min(group.values[v.field], raw)
      } else if (v.agg === 'count') {
        group.values[v.field] = group._count
      }
    }
  }

  // Post-process averages
  for (const g of groups.values()) {
    for (const v of values) {
      if (v.agg === 'avg' && g._count > 0) {
        g.values[v.field] /= g._count
      }
    }
  }

  // Grand totals
  const totals = {}
  for (const v of values) {
    let total = 0
    for (const g of groups.values()) {
      total += g.values[v.field]
    }
    totals[v.field] = total
  }

  // Sort groups by key
  const result = Array.from(groups.values()).sort((a, b) => {
    for (const f of groupBy) {
      const cmp = String(a.key[f]).localeCompare(String(b.key[f]))
      if (cmp !== 0) return cmp
    }
    return 0
  })

  return { groups: result, totals, rowCount: filtered.length }
}

/* ── Pre-built GSSM pivot definitions ── */

/**
 * Returns the set of pre-configured pivot definitions matching the GSSM Excel workbook.
 * Each can be recalculated instantly from current Staffing data.
 */
export const GSSM_PIVOTS = [
  {
    id: 'company-team',
    name: 'By Company & Team',
    description: 'Hours and fees grouped by company and team',
    groupBy: ['Company', 'Team'],
    values: [
      { field: 'Hours', agg: 'sum' },
      { field: 'Fees', agg: 'sum' },
    ],
  },
  {
    id: 'team-role',
    name: 'By Team & Role',
    description: 'Hours and fees by team and role',
    groupBy: ['Team', 'Role'],
    values: [
      { field: 'Hours', agg: 'sum' },
      { field: 'Fees', agg: 'sum' },
      { field: 'Total FTE', agg: 'sum' },
    ],
  },
  {
    id: 'band-company',
    name: 'By Band & Company',
    description: 'Hours and fees by band level and company',
    groupBy: ['Band', 'Company'],
    values: [
      { field: 'Hours', agg: 'sum' },
      { field: 'Fees', agg: 'sum' },
    ],
  },
  {
    id: 'rollout-team',
    name: 'By Rollout & Team',
    description: 'Hours and fees by rollout wave and team',
    groupBy: ['Rollout', 'Team'],
    values: [
      { field: 'Hours', agg: 'sum' },
      { field: 'Fees', agg: 'sum' },
      { field: 'Total FTE', agg: 'sum' },
    ],
  },
  {
    id: 'phase-team',
    name: 'By Phase & Team',
    description: 'Hours and fees by project phase and team',
    groupBy: ['Phase', 'Team'],
    values: [
      { field: 'Hours', agg: 'sum' },
      { field: 'Fees', agg: 'sum' },
    ],
  },
  {
    id: 'team-monthly-fte',
    name: 'Monthly FTE by Team',
    description: 'FTE allocation per month grouped by team',
    groupBy: ['Team'],
    // values will be dynamically populated with month columns
    values: [],
    dynamic: 'fte-months',
  },
]

/**
 * Run all pre-built GSSM pivots against the current Staffing data.
 * Returns a map of pivotId → { pivotDef, result }
 */
export const refreshAllPivots = (staffingRowData) => {
  const dataRows = extractStaffingRows(staffingRowData)
  const fteMonths = detectFteColumns(staffingRowData)

  const results = {}
  for (const def of GSSM_PIVOTS) {
    let valuesDef = def.values
    // Dynamic FTE months
    if (def.dynamic === 'fte-months') {
      valuesDef = fteMonths.map((mc) => ({ field: mc.label, agg: 'sum' }))
    }

    const result = pivot(dataRows, def.groupBy, valuesDef, def.filter)
    results[def.id] = {
      def: { ...def, values: valuesDef },
      result,
    }
  }

  return { results, dataRows, fteMonths, refreshedAt: Date.now() }
}
