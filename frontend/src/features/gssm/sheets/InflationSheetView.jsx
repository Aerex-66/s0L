import { memo } from 'react'
import CellInput from '../components/CellInput'
import { getSheetDisplayName } from '../utils/normalizer'

const cellText = (rowData = [], rowOneBased, colZeroBased) => {
  const row = rowData[rowOneBased - 1] || {}
  const value = row[`c${colZeroBased}`]
  return value == null ? '' : String(value)
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

function InflationSheetView({ rowData = [], onCellEdit, isSolutioner }) {
  const headers = []
  for (let col = 1; col <= 19; col += 1) {
    headers.push(cellText(rowData, 1, col) || `Y${col}`)
  }

  const rows = []
  for (let row = 3; row <= 13; row += 1) {
    const category = cellText(rowData, row, 0)
    if (!category) continue
    const values = []
    for (let col = 1; col <= 19; col += 1) {
      values.push(cellText(rowData, row, col))
    }
    rows.push({ row, category, values })
  }

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('Inflation')}</h2>
        </div>
      </div>

      <div className="section-divider">Rate Table</div>
      <div className="sheet-data-table-wrap">
        <table className="sheet-data-table">
          <thead>
            <tr>
              <th>Inflation Category</th>
              {headers.map((header, idx) => <th key={idx}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.row} className={item.row < 4 ? 'inflation-header-row' : undefined}>
                <td>{item.category}</td>
                {item.values.map((value, idx) => {
                  const colZero = idx + 1
                  const editable = item.row >= 4
                  return (
                    <td key={idx} className={editable ? 'td-editable' : undefined}>
                      {editable ? (
                        <CellInput
                          value={value}
                          rowIndex={item.row - 1}
                          colIndex={colZero}
                          onCellEdit={onCellEdit}
                        />
                      ) : (
                        formatDisplayValue(value)
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

export default memo(InflationSheetView)
