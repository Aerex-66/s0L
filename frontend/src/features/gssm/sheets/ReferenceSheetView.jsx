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
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

/**
 * Read-only reference/lookup table view for variable sheets (vars__*),
 * lookup tables (OKBands, BandOrdering, WorkLocations, etc.), and
 * internal calculation sheets (Background, JRSS, PhaseMatrix, etc.).
 */
function ReferenceSheetView({ rowData = [], sheetName }) {
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
    // Cap at 30 columns to keep readable
    mc = Math.min(mc, 30)
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

  const displayName = getSheetDisplayName(sheetName || 'Reference')

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{displayName}</h2>
          <span className="sheet-panel-badge sheet-panel-badge--ref">Reference</span>
        </div>
        <div className="stat-row">
          <span className="stat-badge stat-badge--neutral">{dataRows.length} rows</span>
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
        <table className="sheet-data-table sheet-data-table--reference">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className={i === 0 ? 'th-key' : ''}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, ri) => (
              <tr key={r} className={ri % 2 === 0 ? 'tr-even' : 'tr-odd'}>
                {headers.map((_, c) => (
                  <td key={c} className={c === 0 ? 'td-label' : 'td-ref'}>
                    {formatNum(cellText(rowData, r, c))}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={headers.length} className="td-empty">No data found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(ReferenceSheetView)
