import { memo, useMemo } from 'react'

/* ── Display value formatter ── */
const fmtVal = (v) => {
  if (v == null || v === '') return ''
  if (typeof v === 'string') return v
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  if (n === 0) return '0'
  // Percent values (0-1 range with "%" in the column header)
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  if (Math.abs(n) < 0.01 && n !== 0) return n.toFixed(4)
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

/**
 * GeneratedSheetView — renders a generated pivot sheet as an Excel-like grid.
 * Receives the flattened grid from flattenPivotToGrid().
 *
 * @param {{ gridData: { grid, colCount, headerRowEnd, dataColStart } }} props
 */
function GeneratedSheetView({ gridData }) {
  if (!gridData?.grid) {
    return (
      <section className="sheet-form-panel">
        <div className="unmapped-notice">
          <p><strong>Generated sheet data not available.</strong></p>
        </div>
      </section>
    )
  }

  const { grid, colCount, dataColStart } = gridData

  // Detect if a row is a subtotal or grand total
  const rowMeta = useMemo(() => {
    return grid.map((row) => {
      const first = String(row[0] ?? '')
      if (first === 'Grand Total') return 'grand'
      if (first.endsWith(' Total')) return 'subtotal'
      return 'data'
    })
  }, [grid])

  return (
    <section className="sheet-form-panel gen-sheet-panel">
      <div className="gen-sheet-scroll">
        <table className="pm-excel-grid gen-sheet-table">
          <tbody>
            {grid.map((row, ri) => {
              // Rows 0-1: empty
              if (ri < 2) {
                return (
                  <tr key={ri} className="pm-grid-empty-row">
                    <td colSpan={colCount}>&nbsp;</td>
                  </tr>
                )
              }
              // Row 2: column group header
              if (ri === 2) {
                return (
                  <tr key={ri} className="pm-grid-group-header">
                    {row.map((cell, ci) => (
                      <td key={ci} className={ci >= dataColStart && cell ? 'pm-grid-group-label' : 'pm-grid-empty-cell'}>
                        {cell ?? ''}
                      </td>
                    ))}
                  </tr>
                )
              }
              // Row 3: headers
              if (ri === 3) {
                return (
                  <tr key={ri} className="pm-grid-header-row">
                    {row.map((cell, ci) => (
                      <th key={ci} className={ci >= dataColStart ? 'pm-grid-hdr pm-grid-hdr-data' : 'pm-grid-hdr pm-grid-hdr-label'}>
                        {cell ?? ''}
                      </th>
                    ))}
                  </tr>
                )
              }
              // Data rows
              const meta = rowMeta[ri]
              const rowClass = meta === 'grand' ? 'pm-grid-grand-total' : meta === 'subtotal' ? 'pm-grid-subtotal' : 'pm-grid-data-row'
              return (
                <tr key={ri} className={rowClass}>
                  {row.map((cell, ci) => {
                    const isDataCol = ci >= dataColStart
                    return (
                      <td key={ci} className={isDataCol ? 'pm-grid-cell pm-grid-cell-num' : 'pm-grid-cell pm-grid-cell-label'}>
                        {isDataCol ? fmtVal(cell) : (cell ?? '')}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(GeneratedSheetView)
