import { memo, useMemo, useState } from 'react'
import { getSheetDisplayName } from '../utils/normalizer'

const cellText = (rowData = [], row0, col0) => {
  const row = rowData[row0] || {}
  const v = row[`c${col0}`]
  return v == null ? '' : String(v)
}

/**
 * Change log / scratch sheet view for GSSM Change Log, Sheet1, etc.
 * Read-only, minimal styling, emphasis on readable text.
 */
function ChangeLogSheetView({ rowData = [], sheetName }) {
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
    mc = Math.min(mc, 20)
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

  const displayName = getSheetDisplayName(sheetName || 'Log')

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{displayName}</h2>
        </div>
        <div className="stat-row">
          <span className="stat-badge stat-badge--neutral">{dataRows.length} entries</span>
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
        <table className="sheet-data-table sheet-data-table--changelog">
          <thead>
            <tr>
              <th className="th-row-num">#</th>
              {headers.map((h, i) => <th key={i}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, ri) => (
              <tr key={r} className={ri % 2 === 0 ? 'tr-even' : 'tr-odd'}>
                <td className="td-row-num">{ri + 1}</td>
                {headers.map((_, c) => (
                  <td key={c} className={c === 0 ? 'td-label' : 'td-text'}>
                    {cellText(rowData, r, c)}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={headers.length + 1} className="td-empty">No entries found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(ChangeLogSheetView)
