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

function GPESheetView({ rowData = [], onCellEdit, formulas = [], sheetName, isSolutioner }) {
  const [query, setQuery] = useState('')

  const formulaSet = useMemo(() => {
    const s = new Set()
    for (const f of formulas) s.add(`${f.row - 1}:${f.col - 1}`)
    return s
  }, [formulas])

  const isFormula = (r, c) => formulaSet.has(`${r}:${c}`)

  // Auto-detect header row and columns from data
  const { headers, dataRows, maxCol } = useMemo(() => {
    if (!rowData.length) return { headers: [], dataRows: [], maxCol: 0 }

    // Find max column with data
    let mc = 0
    for (let r = 0; r < Math.min(rowData.length, 5); r++) {
      const row = rowData[r] || {}
      for (const k of Object.keys(row)) {
        if (k.startsWith('c')) mc = Math.max(mc, Number(k.slice(1)))
      }
    }

    // First row as headers
    const hdrs = []
    for (let c = 0; c <= mc; c++) {
      hdrs.push(cellText(rowData, 0, c) || `Col ${c + 1}`)
    }

    // Remaining rows as data
    const rows = []
    for (let r = 1; r < rowData.length; r++) {
      const rd = rowData[r]
      if (!rd) continue
      // Check if row has any non-empty cell
      let hasData = false
      for (let c = 0; c <= mc; c++) {
        if (cellText(rowData, r, c).trim()) { hasData = true; break }
      }
      if (!hasData) continue
      rows.push(r)
    }
    return { headers: hdrs, dataRows: rows, maxCol: mc }
  }, [rowData])

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

  const displayName = getSheetDisplayName(sheetName || 'GPE')

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{displayName}</h2>
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
        <table className="sheet-data-table sheet-data-table--gpe">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className={i === 0 ? 'th-key' : 'th-numeric'}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r}>
                {headers.map((_, c) => {
                  const val = cellText(rowData, r, c)
                  const formula = isFormula(r, c)
                  return (
                    <td key={c} className={formula ? 'td-formula' : c > 0 ? 'td-editable' : 'td-label'}>
                      {formula || c === 0 ? (
                        <span className={formula ? 'cell-formula-value' : ''}>{formatNum(val)}</span>
                      ) : (
                        <CellInput value={val} rowIndex={r} colIndex={c} onCellEdit={onCellEdit} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(GPESheetView)
