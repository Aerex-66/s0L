import { memo } from 'react'
import { CellSelect } from '../components/CellInput'
import { useColumnToggle } from '../components/ColumnToggle'
import CollapsibleSection from '../components/CollapsibleSection'
import { getSheetDisplayName } from '../utils/normalizer'

const FOREX_COLUMNS = [
  { key: 'code', label: 'Country Code' },
  { key: 'country', label: 'IBM Country' },
  { key: 'iso', label: 'ISO Currency' },
  { key: 'perUsd', label: 'XXX per USD' },
  { key: 'gpeCurrency', label: 'GPE Currency' },
  { key: 'gpeAssumes', label: 'GPE Assumes' },
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

const CURR_OPTIONS = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD', 'SGD', 'CNY']

function ForexSheetView({ rowData = [], onCellEdit, isSolutioner }) {
  const homeCurrency = cellText(rowData, 1, 8)
  const { hiddenSet, ColumnToggleButton, ColumnTogglePanel } = useColumnToggle(FOREX_COLUMNS)

  const rows = []
  for (let row = 2; row <= rowData.length; row += 1) {
    const code = cellText(rowData, row, 0)
    const country = cellText(rowData, row, 1)
    if (!code && !country) continue
    rows.push({
      row,
      code,
      country,
      iso: cellText(rowData, row, 2),
      perUsd: cellText(rowData, row, 3),
      gpeCurrency: cellText(rowData, row, 4),
      gpeAssumes: cellText(rowData, row, 5),
    })
  }

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('Forex')}</h2>
        </div>
        {isSolutioner && (
          <div className="stat-row">
            <ColumnToggleButton />
          </div>
        )}
      </div>

      {isSolutioner && <ColumnTogglePanel />}

      <CollapsibleSection label="Settings">
        <div className="sheet-form-grid">
          <label>
            <span>Home Currency (I1)</span>
            <CellSelect value={homeCurrency} rowIndex={0} colIndex={8} onCellEdit={onCellEdit}>
              <option value="">Select currency</option>
              {CURR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </CellSelect>
          </label>
        </div>
      </CollapsibleSection>

      <div className="section-divider">Exchange Rates</div>
      <div className="sheet-data-table-wrap">
        <table className="sheet-data-table">
          <thead>
            <tr>
              {!hiddenSet.has('code') && <th className="th-key">Country Code</th>}
              {!hiddenSet.has('country') && <th>IBM Country</th>}
              {!hiddenSet.has('iso') && <th>ISO Currency</th>}
              {!hiddenSet.has('perUsd') && <th className="th-numeric">XXX per USD</th>}
              {!hiddenSet.has('gpeCurrency') && <th>GPE Currency</th>}
              {!hiddenSet.has('gpeAssumes') && <th className="th-numeric">GPE Assumes</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.row}>
                {!hiddenSet.has('code') && <td className="td-code">{item.code}</td>}
                {!hiddenSet.has('country') && <td>{item.country}</td>}
                {!hiddenSet.has('iso') && <td className="td-code">{item.iso}</td>}
                {!hiddenSet.has('perUsd') && <td className="td-rate">{formatDisplayValue(item.perUsd)}</td>}
                {!hiddenSet.has('gpeCurrency') && <td>{item.gpeCurrency}</td>}
                {!hiddenSet.has('gpeAssumes') && <td className="td-rate">{formatDisplayValue(item.gpeAssumes)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(ForexSheetView)
