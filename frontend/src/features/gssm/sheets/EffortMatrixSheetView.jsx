import { memo } from 'react'
import CellInput from '../components/CellInput'
import { CellSelect } from '../components/CellInput'
import { useColumnToggle } from '../components/ColumnToggle'
import CollapsibleSection from '../components/CollapsibleSection'
import { getSheetDisplayName } from '../utils/normalizer'

const EFFORT_COLUMNS = [
  { key: 'objectType', label: 'Object Type' },
  { key: 'extensibility', label: 'Extensibility' },
  { key: 'mixPct', label: '% Mix' },
  { key: 'role', label: 'JR/S Role' },
  { key: 'category', label: 'Category' },
  { key: 'high3', label: '3pt High' },
  { key: 'med3', label: '3pt Med' },
  { key: 'low3', label: '3pt Low' },
  { key: 'vhigh5', label: '5pt VHigh' },
  { key: 'high5', label: '5pt High' },
  { key: 'med5', label: '5pt Med' },
  { key: 'low5', label: '5pt Low' },
]

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

function EffortMatrixSheetView({ rowData = [], onCellEdit, isSolutioner }) {
  const { hiddenSet, ColumnToggleButton, ColumnTogglePanel } = useColumnToggle(EFFORT_COLUMNS)
  const sharedDelivery = cellText(rowData, 3, 2)
  const complexityScale = cellText(rowData, 4, 2)
  const btpLicense = cellText(rowData, 8, 2)
  const deployment = cellText(rowData, 9, 2)
  const autoColor = cellText(rowData, 10, 2)

  const effortSavings = cellText(rowData, 5, 2)
  const realizationFactor = cellText(rowData, 6, 2)

  const rows = []
  for (let row = 14; row <= 48; row += 1) {
    const objectType = cellText(rowData, row, 1)
    if (!objectType) continue
    rows.push({
      row,
      objectType,
      extensibility: cellText(rowData, row, 2),
      mixPct: cellText(rowData, row, 3),
      role: cellText(rowData, row, 4),
      category: cellText(rowData, row, 5),
      high3: cellText(rowData, row, 7),
      med3: cellText(rowData, row, 8),
      low3: cellText(rowData, row, 9),
      vhigh5: cellText(rowData, row, 11),
      high5: cellText(rowData, row, 12),
      med5: cellText(rowData, row, 13),
      low5: cellText(rowData, row, 14),
    })
  }

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('Effort Matrix')}</h2>
        </div>
        {isSolutioner && (
          <div className="stat-row">
            <ColumnToggleButton />
          </div>
        )}
      </div>

      {isSolutioner && <ColumnTogglePanel />}

      <CollapsibleSection label="Configuration">
        <div className="sheet-form-grid">
          <label>
            <span>Shared Delivery (C3)</span>
            <CellSelect value={sharedDelivery} rowIndex={2} colIndex={2} onCellEdit={onCellEdit}>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </CellSelect>
          </label>

        <label>
          <span>Complexity Scale (C4)</span>
          <CellSelect value={complexityScale} rowIndex={3} colIndex={2} onCellEdit={onCellEdit}>
            <option value="3">3</option>
            <option value="5">5</option>
          </CellSelect>
        </label>

        <label>
          <span>BTP Extension License (C8)</span>
          <CellSelect value={btpLicense} rowIndex={7} colIndex={2} onCellEdit={onCellEdit}>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </CellSelect>
        </label>

        <label>
          <span>S/4 Deployment Option (C9)</span>
          <CellSelect value={deployment} rowIndex={8} colIndex={2} onCellEdit={onCellEdit}>
            <option value="On-premise/Private Cloud">On-premise/Private Cloud</option>
            <option value="Public Cloud">Public Cloud</option>
            <option value="Hybrid">Hybrid</option>
          </CellSelect>
        </label>

        <label>
          <span>Auto Color / Driver Toggle (C10)</span>
          <CellSelect value={autoColor} rowIndex={9} colIndex={2} onCellEdit={onCellEdit}>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </CellSelect>
        </label>

        <label>
          <span>Effort Savings (C5, read-only)</span>
          <input value={formatDisplayValue(effortSavings)} readOnly />
        </label>

        <label>
          <span>Realization Factor (C6, read-only)</span>
          <input value={formatDisplayValue(realizationFactor)} readOnly />
        </label>
        </div>
      </CollapsibleSection>

      <div className="section-divider">Estimation Table</div>
      <div className="sheet-data-table-wrap">
        <table className="sheet-data-table">
          <thead>
            <tr>
              {!hiddenSet.has('objectType') && <th className="th-label">Object Type</th>}
              {!hiddenSet.has('extensibility') && <th className="th-label">Extensibility</th>}
              {!hiddenSet.has('mixPct') && <th className="th-editable">% Mix (D)</th>}
              {!hiddenSet.has('role') && <th className="th-label">JR/S Role</th>}
              {!hiddenSet.has('category') && <th className="th-label">Category</th>}
              {!hiddenSet.has('high3') && <th className="th-numeric">3pt High</th>}
              {!hiddenSet.has('med3') && <th className="th-numeric">3pt Med</th>}
              {!hiddenSet.has('low3') && <th className="th-numeric">3pt Low</th>}
              {!hiddenSet.has('vhigh5') && <th className="th-numeric">5pt VHigh</th>}
              {!hiddenSet.has('high5') && <th className="th-numeric">5pt High</th>}
              {!hiddenSet.has('med5') && <th className="th-numeric">5pt Med</th>}
              {!hiddenSet.has('low5') && <th className="th-numeric">5pt Low</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.row}>
                {!hiddenSet.has('objectType') && <td>{item.objectType}</td>}
                {!hiddenSet.has('extensibility') && <td>{item.extensibility}</td>}
                {!hiddenSet.has('mixPct') && <td className="td-editable">
                  <CellInput
                    value={item.mixPct}
                    rowIndex={item.row - 1}
                    colIndex={3}
                    onCellEdit={onCellEdit}
                  />
                </td>}
                {!hiddenSet.has('role') && <td>{item.role}</td>}
                {!hiddenSet.has('category') && <td>{item.category}</td>}
                {!hiddenSet.has('high3') && <td className="td-complexity-high">{formatDisplayValue(item.high3)}</td>}
                {!hiddenSet.has('med3') && <td className="td-complexity-med">{formatDisplayValue(item.med3)}</td>}
                {!hiddenSet.has('low3') && <td className="td-complexity-low">{formatDisplayValue(item.low3)}</td>}
                {!hiddenSet.has('vhigh5') && <td className="td-complexity-high">{formatDisplayValue(item.vhigh5)}</td>}
                {!hiddenSet.has('high5') && <td className="td-complexity-high">{formatDisplayValue(item.high5)}</td>}
                {!hiddenSet.has('med5') && <td className="td-complexity-med">{formatDisplayValue(item.med5)}</td>}
                {!hiddenSet.has('low5') && <td className="td-complexity-low">{formatDisplayValue(item.low5)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(EffortMatrixSheetView)
