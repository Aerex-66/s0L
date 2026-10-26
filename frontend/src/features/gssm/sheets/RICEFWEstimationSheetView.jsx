import { memo, useMemo, useState, Fragment } from 'react'
import CellInput from '../components/CellInput'
import { getSheetDisplayName } from '../utils/normalizer'

/* ── helpers ── */
const cell = (rd, r, c) => {
  const row = rd[r] || {}
  const v = row[`c${c}`]
  return v == null ? '' : String(v)
}

const num = (v) => {
  const t = String(v ?? '').trim().replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

const fmt = (v, decimals = 0) => {
  const n = typeof v === 'number' ? v : num(v)
  if (!Number.isFinite(n) || n === 0) return ''
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })
}

const fmtPct = (v) => {
  const n = num(v)
  if (!Number.isFinite(n) || n === 0) return ''
  return `${(n * 100).toFixed(0)}%`
}

/* ── RICEFW type classification ── */
const TYPE_META = {
  R: { label: 'Reports',       icon: '📊', color: '#3b82f6' },
  I: { label: 'Interfaces',    icon: '🔗', color: '#8b5cf6' },
  C: { label: 'Conversions',   icon: '🔄', color: '#f59e0b' },
  E: { label: 'Enhancements',  icon: '⚙️', color: '#10b981' },
  F: { label: 'Forms',         icon: '📋', color: '#ec4899' },
  W: { label: 'Workflow',      icon: '🔀', color: '#06b6d4' },
}

const classifyType = (name) => {
  const lower = (name || '').toLowerCase()
  if (lower.includes('report')) return 'R'
  if (lower.includes('interface') || lower.includes('pi ') || lower.includes('btp') || lower.includes('cpi') || lower.includes('backend dev')) return 'I'
  if (lower.includes('conversion')) return 'C'
  if (lower.includes('enhancement')) return 'E'
  if (lower.includes('form')) return 'F'
  if (lower.includes('workflow')) return 'W'
  return null
}

const COMPLEXITY_COLORS = {
  'v-high': '#dc2626', 'high': '#ea580c', 'medium': '#d97706', 'low': '#16a34a', 'v-low': '#15803d',
}

/*
  ═══════════════════════════════════════════════════════════
  Structured form parser for the RICEFW Estimation sheet.

  The sheet is NOT a flat table — it's a multi-section form with
  repeating blocks per object type across 3 year column groups.

  Year column offsets (0-based rowData columns):
    Year 1: label=c2, count=c3, objects=c4, hours=c5
    Year 2: label=c7, count=c8, objects=c9, hours=c10
    Year 3: label=c12, count=c13, objects=c14, hours=c15

  Each object type section:
    Title row:  [label] [count] "Objects" "Hours"
    Complexity: [V-High|High|Medium|Low|V-Low] [%] [obj] [hrs]
    Total row:  [...] "Total" [sum obj] [sum hrs]

  Right-side summary (rows 9+ in 0-based):
    Hours:  c17=type, c18=y1, c19=y2, c20=y3, c21=total
    Counts: c23=y1, c24=y2, c25=y3, c26=total
    Cx:     c28=vh,  c29=h,  c30=m,  c31=l,  c32=vl, c33=total

  Parent groups in col B (c1): "End to End PI Interfaces for S/4", etc.
  ═══════════════════════════════════════════════════════════
*/

const YEAR_GROUPS = [
  { label: 0, count: 3, objects: 4, hours: 5 },  // cols C-F
  { label: 0, count: 8, objects: 9, hours: 10 },  // cols H-K (label repeats from year 1)
  { label: 0, count: 13, objects: 14, hours: 15 }, // cols M-P
]
// Label column for year group names
const YG_LABEL = [2, 7, 12]
// Summary table columns (0-based)
const SUM = { type: 17, y1hrs: 18, y2hrs: 19, y3hrs: 20, totalHrs: 21 }
const CNT = { y1: 23, y2: 24, y3: 25, total: 26 }

function parseSections(rowData) {
  if (!rowData?.length) return { sections: [], groups: [], years: [], summaryRows: [], additionalRows: [], grandTotalRow: -1, totalsRow: -1 }

  // Detect year labels from the year header row (0-based row 9 = NDJSON row 10)
  const years = []
  for (const labelCol of YG_LABEL) {
    const v = cell(rowData, 9, labelCol).trim()
    years.push(v || '')
  }

  // Scan for section title rows: rows where "Objects" appears in the objects column
  const sections = []
  let r = 10 // start after year header (0-based)
  while (r < rowData.length) {
    const objLabel = cell(rowData, r, 4).trim().toLowerCase()
    const hrsLabel = cell(rowData, r, 5).trim().toLowerCase()
    if (objLabel === 'objects' && hrsLabel === 'hours') {
      const titleName = cell(rowData, r, 2).trim()
      const parentGroup = cell(rowData, r, 1).trim()
      if (!titleName) { r++; continue }

      const titleRow = r

      // Read count values per year from the title row
      const countByYear = YEAR_GROUPS.map(yg => num(cell(rowData, r, yg.count)))

      // Scan complexity rows
      const complexityRows = []
      let cr = r + 1
      let totalRow = -1
      while (cr < rowData.length && cr < r + 8) {
        const label = cell(rowData, cr, 3).trim()
        if (label.toLowerCase() === 'total' || label === 'Total') {
          totalRow = cr
          break
        }
        // Skip empty rows
        const cxLabel = cell(rowData, cr, 2).trim()
        if (!cxLabel && !label) { cr++; continue }
        // A complexity row has a label like V-High, High, Medium, Low, V-Low
        // or a space (hidden level). Skip pure spaces.
        const isHidden = (cxLabel === ' ' || cxLabel === '')
        if (!isHidden || cell(rowData, cr, 3).trim()) {
          const cxData = []
          for (const yg of YEAR_GROUPS) {
            cxData.push({
              pct: cell(rowData, cr, yg.count),
              objects: cell(rowData, cr, yg.objects),
              hours: cell(rowData, cr, yg.hours),
            })
          }
          complexityRows.push({
            row: cr,
            label: cxLabel || cell(rowData, cr, 3).trim(),
            hidden: isHidden,
            years: cxData,
          })
        }
        cr++
      }

      // Total row data
      const totalData = totalRow >= 0 ? YEAR_GROUPS.map(yg => ({
        objects: cell(rowData, totalRow, yg.objects),
        hours: cell(rowData, totalRow, yg.hours),
      })) : []

      // Classify RICEFW type
      const typeCode = classifyType(titleName)

      // Compute total hours across years from the total row
      const totalHours = totalData.reduce((s, td) => s + num(td.hours), 0)
      const totalObjects = totalData.reduce((s, td) => s + num(td.objects), 0)

      sections.push({
        titleRow,
        name: titleName,
        parentGroup,
        typeCode,
        countByYear,
        complexityRows: complexityRows.filter(c => !c.hidden),
        totalRow,
        totalData,
        totalHours,
        totalObjects,
      })

      r = totalRow >= 0 ? totalRow + 1 : cr
    } else {
      r++
    }
  }

  // Build parent groups
  const groupMap = new Map()
  const standalone = []
  for (const sec of sections) {
    if (sec.parentGroup) {
      if (!groupMap.has(sec.parentGroup)) groupMap.set(sec.parentGroup, [])
      groupMap.get(sec.parentGroup).push(sec)
    } else {
      standalone.push(sec)
    }
  }
  const groups = []
  for (const sec of sections) {
    if (sec.parentGroup && groupMap.has(sec.parentGroup)) {
      const children = groupMap.get(sec.parentGroup)
      if (children[0] === sec) groups.push({ name: sec.parentGroup, children })
      // skip subsequent children
    } else if (!sec.parentGroup) {
      groups.push({ name: null, children: [sec] })
    }
  }

  // Parse summary table (right side, rows 9+ 0-based, cols c17-c21)
  const summaryRows = []
  for (let sr = 10; sr < Math.min(rowData.length, 40); sr++) {
    const typeName = cell(rowData, sr, SUM.type).trim()
    if (!typeName) continue
    if (typeName.toLowerCase() === 'total') {
      summaryRows.push({
        row: sr, name: typeName, isTotal: true,
        y1: num(cell(rowData, sr, SUM.y1hrs)), y2: num(cell(rowData, sr, SUM.y2hrs)),
        y3: num(cell(rowData, sr, SUM.y3hrs)), total: num(cell(rowData, sr, SUM.totalHrs)),
      })
      break
    }
    summaryRows.push({
      row: sr, name: typeName, isTotal: false,
      y1: num(cell(rowData, sr, SUM.y1hrs)), y2: num(cell(rowData, sr, SUM.y2hrs)),
      y3: num(cell(rowData, sr, SUM.y3hrs)), total: num(cell(rowData, sr, SUM.totalHrs)),
    })
  }

  // Parse additional effort rows (after summary total)
  const additionalRows = []
  let grandTotalRow = -1
  const summaryTotalIdx = summaryRows.findIndex(s => s.isTotal)
  if (summaryTotalIdx >= 0) {
    const startR = summaryRows[summaryTotalIdx].row + 1
    for (let sr = startR; sr < Math.min(rowData.length, startR + 20); sr++) {
      const label = cell(rowData, sr, SUM.type).trim()
      if (!label) continue
      if (label.toLowerCase() === 'grand total') {
        grandTotalRow = sr
        break
      }
      if (label.toLowerCase() === 'additional effort' || label.toLowerCase() === 'sub total') continue
      additionalRows.push({
        row: sr, name: label,
        y1: num(cell(rowData, sr, SUM.y1hrs)), y2: num(cell(rowData, sr, SUM.y2hrs)),
        y3: num(cell(rowData, sr, SUM.y3hrs)), total: num(cell(rowData, sr, SUM.totalHrs)),
      })
    }
  }

  // Bottom totals row
  let totalsRow = -1
  for (let sr = rowData.length - 10; sr < rowData.length; sr++) {
    if (sr < 0) continue
    if (cell(rowData, sr, 2).trim().toLowerCase() === 'totals') { totalsRow = sr; break }
  }

  return { sections, groups, years, summaryRows, additionalRows, grandTotalRow, totalsRow }
}

/* ── Section card component ── */
/* ── Inline complexity detail (renders as rows in the parent flat table) ── */
function CxDetailRows({ sec, years, rowData, formulaSet, onCellEdit }) {
  const visibleYears = years.map((label, i) => ({ label, idx: i })).filter(y => y.label)
  const isFormula = (r, c) => formulaSet.has(`${r}:${c}`)
  const typeColor = sec.typeCode && TYPE_META[sec.typeCode] ? TYPE_META[sec.typeCode].color : '#6b7280'

  const rows = []

  // Complexity header row
  rows.push(
    <tr key={`cxh-${sec.titleRow}`} className="rfw-cx-hdr-row">
      <td className="rfw-cx-inline-td" />
      <td className="rfw-cx-inline-td rfw-cx-inline-td--label">Complexity</td>
      {visibleYears.map(y => (
        <Fragment key={y.idx}>
          <td className="rfw-cx-inline-td rfw-cx-inline-td--sub rfw-ys">dist %</td>
          <td className="rfw-cx-inline-td rfw-cx-inline-td--sub">hours</td>
        </Fragment>
      ))}
      <td className="rfw-cx-inline-td rfw-ys" />
    </tr>
  )

  // Complexity data rows
  for (const cx of sec.complexityRows) {
    const cxLower = cx.label.toLowerCase().trim()
    const cxColor = COMPLEXITY_COLORS[cxLower] || COMPLEXITY_COLORS[cxLower.replace('very ', 'v-')] || '#6b7280'
    rows.push(
      <tr key={`cx-${cx.row}`} className="rfw-cx-inline-row" style={{ '--rfw-card-accent': typeColor }}>
        <td className="rfw-cx-inline-td" />
        <td className="rfw-cx-inline-td rfw-cx-inline-td--name">
          <span className="rfw-cx-chip" style={{ '--rfw-cx-color': cxColor }}>{cx.label}</span>
        </td>
        {visibleYears.map(y => {
          const yd = cx.years[y.idx]
          const pctCol = YEAR_GROUPS[y.idx].count
          const pctFml = isFormula(cx.row, pctCol)
          return (
            <Fragment key={y.idx}>
              <td className="rfw-cx-inline-td rfw-cx-inline-td--edit rfw-ys">
                {pctFml ? (
                  <span className="rfw-cx-inline-pct">{fmtPct(yd.pct)}</span>
                ) : (
                  <CellInput value={yd.pct} rowIndex={cx.row} colIndex={pctCol} onCellEdit={onCellEdit} />
                )}
              </td>
              <td className="rfw-cx-inline-td rfw-cx-inline-td--hrs">{fmt(yd.hours, 1)}</td>
            </Fragment>
          )
        })}
        <td className="rfw-cx-inline-td rfw-cx-inline-td--hrs rfw-ys">
          {fmt(cx.years.reduce((s, y) => s + num(y.hours), 0), 1)}
        </td>
      </tr>
    )
  }

  // Total row
  if (sec.totalData.length > 0) {
    rows.push(
      <tr key={`cxt-${sec.titleRow}`} className="rfw-cx-inline-total">
        <td className="rfw-cx-inline-td" />
        <td className="rfw-cx-inline-td rfw-cx-inline-td--total-label">Total</td>
        {visibleYears.map(y => {
          const td = sec.totalData[y.idx]
          return (
            <Fragment key={y.idx}>
              <td className="rfw-cx-inline-td rfw-ys" />
              <td className="rfw-cx-inline-td rfw-cx-inline-td--total-hrs">{fmt(td?.hours, 1)}</td>
            </Fragment>
          )
        })}
        <td className="rfw-cx-inline-td rfw-cx-inline-td--total-hrs rfw-ys">
          {fmt(sec.totalData.reduce((s, td) => s + num(td?.hours), 0), 1)}
        </td>
      </tr>
    )
  }

  return rows
}

/* ── Main component ── */
function RICEFWEstimationSheetView({ rowData = [], onCellEdit, formulas = [], sheetName }) {
  const [query, setQuery] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)

  const formulaSet = useMemo(() => {
    const s = new Set()
    for (const f of formulas) s.add(`${f.row - 1}:${f.col - 1}`)
    return s
  }, [formulas])

  const { sections, groups, years, summaryRows, additionalRows, grandTotalRow, totalsRow } = useMemo(
    () => parseSections(rowData), [rowData]
  )

  const displayName = getSheetDisplayName(sheetName || 'RICEFW Estimation')

  // Grand totals from summary table
  const summaryTotal = summaryRows.find(s => s.isTotal)
  const grandTotal = grandTotalRow >= 0 ? {
    y1: num(cell(rowData, grandTotalRow, SUM.y1hrs)),
    y2: num(cell(rowData, grandTotalRow, SUM.y2hrs)),
    y3: num(cell(rowData, grandTotalRow, SUM.y3hrs)),
    total: num(cell(rowData, grandTotalRow, SUM.totalHrs)),
  } : null

  const totals = totalsRow >= 0 ? {
    count: num(cell(rowData, totalsRow, 3)),
    objects: num(cell(rowData, totalsRow, 4)),
    hours: num(cell(rowData, totalsRow, 5)),
  } : null

  const totalHours = summaryTotal?.total || totals?.hours || 0
  const totalObjects = sections.reduce((s, sec) => s + sec.totalObjects, 0)

  // Filter sections by search query
  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groups
    const q = query.toLowerCase()
    return groups.map(g => ({
      ...g,
      children: g.children.filter(sec => sec.name.toLowerCase().includes(q)),
    })).filter(g => g.children.length > 0)
  }, [groups, query])

  // Effort by type for summary bars
  const byType = useMemo(() => {
    const map = {}
    for (const sec of sections) {
      const t = sec.typeCode || '?'
      if (!map[t]) map[t] = { count: 0, hours: 0, objects: 0 }
      map[t].count++
      map[t].hours += sec.totalHours
      map[t].objects += sec.totalObjects
    }
    return map
  }, [sections])

  const maxTypeHours = Math.max(...Object.values(byType).map(t => t.hours), 1)

  // Visible years
  const visibleYears = years.map((label, i) => ({ label, idx: i })).filter(y => y.label)

  // Empty state
  if (sections.length === 0) {
    return (
      <section className="sheet-form-panel rfw-estimation">
        <div className="sheet-panel-header">
          <div className="sheet-panel-header-left">
            <h2 className="sheet-panel-title">{displayName}</h2>
            <span className="sheet-panel-badge rfw-badge">RICEFW</span>
          </div>
        </div>
        <div className="rfw-empty">
          <span className="rfw-empty-icon">📋</span>
          <p className="rfw-empty-title">No RICEFW objects found</p>
          <p className="rfw-empty-hint">Ensure the sheet follows the standard GSSM RICEFW Estimation layout with object type sections and complexity breakdowns.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="sheet-form-panel rfw-estimation">
      {/* ── Header ── */}
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{displayName}</h2>
          <span className="sheet-panel-badge rfw-badge">RICEFW</span>
        </div>
        <div className="stat-row">
          <span className="stat-badge stat-badge--blue">{sections.length} types</span>
          {totalObjects > 0 && <span className="stat-badge stat-badge--green">{fmt(totalObjects)} objects</span>}
          {totalHours > 0 && <span className="stat-badge stat-badge--purple">{fmt(totalHours, 0)} hrs</span>}
          <input
            className="sheet-search-input"
            type="text"
            placeholder="Search types…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Summary dashboard ── */}
      <div className="rfw-dashboard">
        {/* Hours summary table */}
        <div className="rfw-types-card">
          <h3 className="fs-card-title">Development Hours Summary</h3>
          {summaryRows.length > 0 && (
            <table className="rfw-summary-table">
              <thead>
                <tr>
                  <th className="rfw-st-th">Object Type</th>
                  {visibleYears.map(y => <th key={y.idx} className="rfw-st-th rfw-st-th--num">{y.label}</th>)}
                  <th className="rfw-st-th rfw-st-th--num rfw-st-th--total">Total</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.filter(s => !s.isTotal).map(s => {
                  const hasHours = s.total > 0
                  return (
                    <tr key={s.row} className={hasHours ? 'rfw-st-row' : 'rfw-st-row rfw-st-row--zero'}>
                      <td className="rfw-st-td rfw-st-td--name">{s.name}</td>
                      {visibleYears.map(y => {
                        const v = y.idx === 0 ? s.y1 : y.idx === 1 ? s.y2 : s.y3
                        return <td key={y.idx} className="rfw-st-td rfw-st-td--num">{fmt(v, 1)}</td>
                      })}
                      <td className="rfw-st-td rfw-st-td--num rfw-st-td--total">{fmt(s.total, 1)}</td>
                    </tr>
                  )
                })}
                {summaryTotal && (
                  <tr className="rfw-st-total-row">
                    <td className="rfw-st-td rfw-st-td--name">Subtotal</td>
                    {visibleYears.map(y => {
                      const v = y.idx === 0 ? summaryTotal.y1 : y.idx === 1 ? summaryTotal.y2 : summaryTotal.y3
                      return <td key={y.idx} className="rfw-st-td rfw-st-td--num">{fmt(v, 1)}</td>
                    })}
                    <td className="rfw-st-td rfw-st-td--num rfw-st-td--total">{fmt(summaryTotal.total, 1)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {/* Additional effort */}
          {additionalRows.length > 0 && (
            <div className="rfw-additional">
              <div className="rfw-additional-label">Additional Effort</div>
              <table className="rfw-summary-table rfw-summary-table--additional">
                <tbody>
                  {additionalRows.map(ar => (
                    <tr key={ar.row} className="rfw-st-row">
                      <td className="rfw-st-td rfw-st-td--name">{ar.name}</td>
                      {visibleYears.map(y => {
                        const v = y.idx === 0 ? ar.y1 : y.idx === 1 ? ar.y2 : ar.y3
                        return <td key={y.idx} className="rfw-st-td rfw-st-td--num">{fmt(v, 1)}</td>
                      })}
                      <td className="rfw-st-td rfw-st-td--num rfw-st-td--total">{fmt(ar.total, 1)}</td>
                    </tr>
                  ))}
                  {grandTotal && (
                    <tr className="rfw-st-grand-row">
                      <td className="rfw-st-td rfw-st-td--name">Grand Total</td>
                      {visibleYears.map(y => {
                        const v = y.idx === 0 ? grandTotal.y1 : y.idx === 1 ? grandTotal.y2 : grandTotal.y3
                        return <td key={y.idx} className="rfw-st-td rfw-st-td--num">{fmt(v, 1)}</td>
                      })}
                      <td className="rfw-st-td rfw-st-td--num rfw-st-td--total">{fmt(grandTotal.total, 1)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Totals + effort by type */}
        <div className="rfw-summary-card">
          <h3 className="fs-card-title">Effort by Type</h3>
          <div className="rfw-effort-bars">
            {Object.entries(byType).sort((a, b) => b[1].hours - a[1].hours).map(([code, data]) => {
              const meta = TYPE_META[code]
              const barW = maxTypeHours > 0 ? (data.hours / maxTypeHours) * 100 : 0
              const pct = totalHours > 0 ? ((data.hours / totalHours) * 100).toFixed(0) : 0
              return (
                <div key={code} className="rfw-bar-row">
                  <div className="rfw-bar-label">
                    <span className="rfw-bar-icon">{meta?.icon || '📦'}</span>
                    <span className="rfw-bar-name">{meta?.label || code}</span>
                    <span className="rfw-bar-count">{data.count} types</span>
                  </div>
                  <div className="rfw-bar-track">
                    <div className="rfw-bar-fill" style={{ width: `${barW}%`, backgroundColor: meta?.color || '#6b7280' }}>
                      {barW > 35 && <span className="rfw-bar-inside-label">{fmt(data.hours, 0)}</span>}
                    </div>
                  </div>
                  {barW <= 35 && <span className="rfw-bar-hours">{fmt(data.hours, 0)} hrs</span>}
                  <span className="rfw-bar-pct">{pct}%</span>
                </div>
              )
            })}
          </div>
          {/* Big number totals */}
          <div className="rfw-summary-numbers">
            <div className="rfw-summary-item rfw-summary-item--primary">
              <span className="rfw-summary-value">{fmt(totalObjects)}</span>
              <span className="rfw-summary-label">Total Objects</span>
            </div>
            {totalHours > 0 && (
              <div className="rfw-summary-item rfw-summary-item--primary">
                <span className="rfw-summary-value rfw-summary-value--hours">{fmt(totalHours, 0)}</span>
                <span className="rfw-summary-label">Development Hours</span>
              </div>
            )}
            {grandTotal && grandTotal.total > 0 && (
              <div className="rfw-summary-item rfw-summary-item--primary">
                <span className="rfw-summary-value rfw-summary-value--avg">{fmt(grandTotal.total, 0)}</span>
                <span className="rfw-summary-label">Grand Total (incl. overhead)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Detail: flat compact table ── */}
      <div className="section-divider rfw-detail-divider">
        <span>Object Type Detail</span>
        {query.trim() && (
          <span className="rfw-filter-count">
            ({filteredGroups.reduce((s, g) => s + g.children.length, 0)} of {sections.length} types)
          </span>
        )}
      </div>

      <div className="rfw-flat-wrap">
        <table className="rfw-flat-table">
          <thead>
            <tr>
              <th className="rfw-flat-th rfw-flat-th--type" rowSpan={2}>Type</th>
              <th className="rfw-flat-th rfw-flat-th--name" rowSpan={2}>Object Type</th>
              {visibleYears.map(y => (
                <th key={`yh-${y.idx}`} className="rfw-flat-th rfw-flat-th--year rfw-ys" colSpan={2}>{y.label}</th>
              ))}
              <th className="rfw-flat-th rfw-flat-th--num rfw-flat-th--total rfw-ys" rowSpan={2}>Total</th>
            </tr>
            <tr>
              {visibleYears.map(y => (
                <Fragment key={`ys-${y.idx}`}>
                  <th className="rfw-flat-th rfw-flat-th--sub rfw-flat-th--edit rfw-ys">count</th>
                  <th className="rfw-flat-th rfw-flat-th--sub">hours</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredGroups.flatMap(group => {
              const rows = []
              const colCount = 2 + visibleYears.length * 2 + 1
              if (group.name) {
                const groupHours = group.children.reduce((s, c) => s + c.totalHours, 0)
                rows.push(
                  <tr key={`g-${group.name}`} className="rfw-flat-group-row">
                    <td colSpan={colCount} className="rfw-flat-group-td">
                      {group.name}
                      {groupHours > 0 && <span className="rfw-flat-group-hrs">{fmt(groupHours, 0)} hrs</span>}
                    </td>
                  </tr>
                )
              }
              for (const sec of group.children) {
                const typeMeta = sec.typeCode && TYPE_META[sec.typeCode] ? TYPE_META[sec.typeCode] : null
                const typeColor = typeMeta ? typeMeta.color : '#6b7280'
                const isExpanded = expandedRow === sec.titleRow
                const hasHours = sec.totalHours > 0
                rows.push(
                  <tr key={sec.titleRow} className={`rfw-flat-row${isExpanded ? ' rfw-flat-row--expanded' : ''}${!hasHours ? ' rfw-flat-row--zero' : ''}`}
                    style={{ '--rfw-card-accent': typeColor }}>
                    <td className="rfw-flat-td rfw-flat-td--type">
                      <span className="rfw-flat-badge" style={{ background: typeColor }}>
                        {typeMeta ? typeMeta.icon : '📦'} {sec.typeCode || '?'}
                      </span>
                    </td>
                    <td className="rfw-flat-td rfw-flat-td--name" onClick={() => setExpandedRow(isExpanded ? null : sec.titleRow)}>
                      {sec.name}
                      <span className={`rfw-flat-chevron${isExpanded ? ' rfw-flat-chevron--open' : ''}`}>›</span>
                    </td>
                    {visibleYears.map(y => {
                      const countCol = YEAR_GROUPS[y.idx].count
                      const isFml = formulaSet.has(`${sec.titleRow}:${countCol}`)
                      const td = sec.totalData[y.idx]
                      return (
                        <Fragment key={y.idx}>
                          <td className="rfw-flat-td rfw-flat-td--edit rfw-ys" onClick={e => e.stopPropagation()}>
                            {isFml ? (
                              <span className="rfw-flat-count">{fmt(cell(rowData, sec.titleRow, countCol))}</span>
                            ) : (
                              <CellInput value={cell(rowData, sec.titleRow, countCol)} rowIndex={sec.titleRow} colIndex={countCol} onCellEdit={onCellEdit} />
                            )}
                          </td>
                          <td className="rfw-flat-td rfw-flat-td--hrs">{fmt(td?.hours, 1)}</td>
                        </Fragment>
                      )
                    })}
                    <td className="rfw-flat-td rfw-flat-td--num rfw-flat-td--total rfw-ys">{fmt(sec.totalHours, 1)}</td>
                  </tr>
                )
                if (isExpanded) {
                  rows.push(
                    ...CxDetailRows({ sec, years, rowData, formulaSet, onCellEdit })
                  )
                }
              }
              return rows
            })}
          </tbody>
        </table>
      </div>

      {filteredGroups.length === 0 && query.trim() && (
        <div className="rfw-empty">
          <p className="rfw-empty-title">No matching types</p>
          <button type="button" className="rfw-filter-clear" onClick={() => setQuery('')}>Clear search</button>
        </div>
      )}
    </section>
  )
}

export default memo(RICEFWEstimationSheetView)
