import { memo, useMemo, useState } from 'react'
import { getSheetDisplayName } from '../utils/normalizer'

const cellText = (rowData = [], row0, col0) => {
  const row = rowData[row0] || {}
  const v = row[`c${col0}`]
  return v == null ? '' : String(v)
}

const formatNum = (v) => {
  const t = String(v ?? '').trim()
  if (!t) return ''
  const n = Number(t.replace(/,/g, ''))
  if (!Number.isFinite(n)) return t
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/**
 * Summary/aggregation view for formula-heavy output sheets like
 * FTE_By_Role, FTE_Flat_IBM_Summary_15, DF_Team, iSBD Summary.
 * All cells are read-only. Formatted nicely with numeric alignment.
 */
function SummarySheetView({ rowData = [], sheetName }) {
  const [query, setQuery] = useState('')

  const { headers, maxCol } = useMemo(() => {
    if (!rowData.length) return { headers: [], maxCol: 0 }
    let mc = 0
    for (let r = 0; r < Math.min(rowData.length, 5); r++) {
      const row = rowData[r] || {}
      for (const k of Object.keys(row)) {
        if (k.startsWith('c')) mc = Math.max(mc, Number(k.slice(1)))
      }
    }
    mc = Math.min(mc, 40)
    const hdrs = []
    for (let c = 0; c <= mc; c++) {
      hdrs.push(cellText(rowData, 0, c) || `Col ${c + 1}`)
    }
    return { headers: hdrs, maxCol: mc }
  }, [rowData])

  const dataRows = useMemo(() => {
    const rows = []
    for (let r = 1; r < rowData.length; r++) {
      if (!rowData[r]) continue
      let hasData = false
      for (let c = 0; c <= maxCol; c++) {
        if (cellText(rowData, r, c).trim()) { hasData = true; break }
      }
      if (hasData) rows.push(r)
    }
    return rows
  }, [rowData, maxCol])

  const filtered = useMemo(() => {
    if (!query.trim()) return dataRows
    const q = query.toLowerCase()
    return dataRows.filter((r) => {
      for (let c = 0; c <= maxCol; c++) {
        if (cellText(rowData, r, c).toLowerCase().includes(q)) return true
      }
      return false
    })
  }, [dataRows, query, rowData, maxCol])

  const displayName = getSheetDisplayName(sheetName || 'Summary')

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{displayName}</h2>
          <span className="sheet-panel-badge sheet-panel-badge--summary">Summary</span>
        </div>
        <div className="stat-row">
          <span className="stat-badge stat-badge--blue">{dataRows.length} rows</span>
          <input
            className="sheet-search-input"
            type="text"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="sheet-data-table-wrap">
        <table className="sheet-data-table sheet-data-table--summary">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className={i === 0 ? 'th-key' : 'th-numeric'}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, ri) => {
              // Detect section header rows (only first column has value)
              let nonEmpty = 0
              for (let c = 0; c <= maxCol; c++) {
                if (cellText(rowData, r, c).trim()) nonEmpty++
              }
              const isSection = nonEmpty === 1 && cellText(rowData, r, 0).trim()
              return (
                <tr key={r} className={isSection ? 'tr-section-header' : ri % 2 === 0 ? 'tr-even' : 'tr-odd'}>
                  {isSection ? (
                    <td colSpan={headers.length} className="td-section-label">
                      {cellText(rowData, r, 0)}
                    </td>
                  ) : (
                    headers.map((_, c) => (
                      <td key={c} className={c === 0 ? 'td-label' : 'td-summary-num'}>
                        {formatNum(cellText(rowData, r, c))}
                      </td>
                    ))
                  )}
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={headers.length} className="td-empty">No data found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(SummarySheetView)
