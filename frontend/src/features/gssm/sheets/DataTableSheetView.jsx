import { memo, useMemo, useState } from 'react'
import CellInput from '../components/CellInput'
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
 * Generic data-entry table view for sheets like WRICEF List, RICEFW Estimation,
 * FS Estimation, RICEFW Split Guidance, SAP Metrics Input, Gen AI Assumptions,
 * Rates Adjustment, PMR Calculator.
 * Auto-detects header row and editable vs formula cells.
 */
function DataTableSheetView({ rowData = [], onCellEdit, formulas = [], sheetName, isSolutioner }) {
  const [query, setQuery] = useState('')

  const formulaSet = useMemo(() => {
    const s = new Set()
    for (const f of formulas) s.add(`${f.row - 1}:${f.col - 1}`)
    return s
  }, [formulas])

  const isFormula = (r, c) => formulaSet.has(`${r}:${c}`)

  const { headers, startRow, maxCol } = useMemo(() => {
    if (!rowData.length) return { headers: [], startRow: 1, maxCol: 0 }
    let mc = 0
    for (let r = 0; r < Math.min(rowData.length, 5); r++) {
      const row = rowData[r] || {}
      for (const k of Object.keys(row)) {
        if (k.startsWith('c')) mc = Math.max(mc, Number(k.slice(1)))
      }
    }
    const hdrs = []
    for (let c = 0; c <= mc; c++) {
      hdrs.push(cellText(rowData, 0, c) || `Col ${c + 1}`)
    }
    return { headers: hdrs, startRow: 1, maxCol: mc }
  }, [rowData])

  const dataRows = useMemo(() => {
    const rows = []
    for (let r = startRow; r < rowData.length; r++) {
      if (!rowData[r]) continue
      let hasData = false
      for (let c = 0; c <= maxCol; c++) {
        if (cellText(rowData, r, c).trim()) { hasData = true; break }
      }
      if (hasData) rows.push(r)
    }
    return rows
  }, [rowData, startRow, maxCol])

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

  // Count editable cells
  const editableCount = useMemo(() => {
    let count = 0
    for (const r of dataRows) {
      for (let c = 0; c <= maxCol; c++) {
        if (!isFormula(r, c)) count++
      }
    }
    return count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataRows, maxCol, formulaSet])

  const displayName = getSheetDisplayName(sheetName || 'Data')

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{displayName}</h2>
        </div>
        <div className="stat-row">
          <span className="stat-badge stat-badge--blue">{dataRows.length} rows</span>
          {editableCount > 0 && (
            <span className="stat-badge stat-badge--green">{editableCount} editable</span>
          )}
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
        <table className="sheet-data-table sheet-data-table--datatable">
          <thead>
            <tr>
              <th className="th-row-num">#</th>
              {headers.map((h, i) => (
                <th key={i} className={i === 0 ? 'th-key' : ''}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, ri) => (
              <tr key={r} className={ri % 2 === 0 ? 'tr-even' : 'tr-odd'}>
                <td className="td-row-num">{ri + 1}</td>
                {headers.map((_, c) => {
                  const val = cellText(rowData, r, c)
                  const formula = isFormula(r, c)
                  return (
                    <td key={c} className={formula ? 'td-formula' : 'td-editable'}>
                      {formula ? (
                        <span className="cell-formula-value">{formatNum(val)}</span>
                      ) : (
                        <CellInput value={val} rowIndex={r} colIndex={c} onCellEdit={onCellEdit} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={headers.length + 1} className="td-empty">No data found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(DataTableSheetView)
