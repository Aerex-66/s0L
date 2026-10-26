import { memo } from 'react'
import CellInput from '../components/CellInput'
import { CellSelect } from '../components/CellInput'
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

const formatPercent = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return (num * 100).toFixed(2) + '%'
}

const PCT_LABELS = new Set(['GP %', 'Rev App %', 'PTI %'])

function PTISheetView({ rowData = [], onCellEdit, isSolutioner }) {
  const onOff = cellText(rowData, 11, 1)
  const contractHolder = cellText(rowData, 14, 1)
  const riskRating = cellText(rowData, 15, 1)
  const daysToPay = cellText(rowData, 16, 1)
  const desiredPti = cellText(rowData, 17, 1)
  const colaClause = cellText(rowData, 18, 1)
  const bidType = cellText(rowData, 19, 1)

  const countryCode = cellText(rowData, 22, 1)
  const totalContingency = cellText(rowData, 23, 1)
  const localToUs = cellText(rowData, 24, 1)
  const billingCurrency = cellText(rowData, 25, 1)
  const modelCurrency = cellText(rowData, 26, 1)
  const currenciesAligned = cellText(rowData, 27, 1)

  const financial = [
    { label: 'Services Revenue', value: cellText(rowData, 30, 1) },
    { label: 'Labor Cost', value: cellText(rowData, 31, 1) },
    { label: 'PMR Cost', value: cellText(rowData, 32, 1) },
    { label: 'TVM Cost', value: cellText(rowData, 33, 1) },
    { label: 'Total Cost', value: cellText(rowData, 34, 1) },
    { label: 'GP', value: cellText(rowData, 35, 1) },
    { label: 'GP %', value: cellText(rowData, 36, 1) },
    { label: 'Rev App %', value: cellText(rowData, 37, 1) },
    { label: 'Rev App', value: cellText(rowData, 38, 1) },
    { label: 'PTI', value: cellText(rowData, 39, 1) },
    { label: 'PTI %', value: cellText(rowData, 40, 1) },
  ]

  const contractType = cellText(rowData, 41, 1)
  const priceType = cellText(rowData, 42, 1)
  const considerNonLabor = cellText(rowData, 43, 1)
  const preApprovedRates = cellText(rowData, 44, 1)

  const contextHeaders = []
  for (let col = 5; col <= 19; col += 1) {
    const header = cellText(rowData, 22, col)
    contextHeaders.push(header || `C${col + 1}`)
  }

  const contextRows = []
  for (let row = 23; row <= 25; row += 1) {
    const values = []
    for (let col = 5; col <= 19; col += 1) {
      values.push(cellText(rowData, row, col))
    }
    contextRows.push({ row, values })
  }

  return (
    <section className="sheet-form-panel pti-sheet-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('PTI_Estimator')}</h2>
        </div>
        <div className="stat-row">
          {financial.find(f => f.label === 'PTI %') && (
            <span className="stat-badge stat-badge--blue">PTI {formatPercent(financial.find(f => f.label === 'PTI %').value) || '—'}</span>
          )}
          {financial.find(f => f.label === 'GP %') && (
            <span className="stat-badge stat-badge--green">GP {formatPercent(financial.find(f => f.label === 'GP %').value) || '—'}</span>
          )}
        </div>
      </div>

      <div className="pti-layout">
        <div className="pti-left-col">
          <div className="pti-card">
            <h4>Estimator Control</h4>
            <label>
              <span>Estimator On/Off (B11)</span>
              <CellSelect value={onOff} rowIndex={10} colIndex={1} onCellEdit={onCellEdit}>
                <option value="On">On</option>
                <option value="Off">Off</option>
              </CellSelect>
            </label>
          </div>

          <div className="pti-card">
            <h4>Input Assumptions</h4>
            <div className="sheet-form-grid">
              <label>
                <span>Contract Holder (B14)</span>
                <CellInput value={contractHolder} rowIndex={13} colIndex={1} onCellEdit={onCellEdit} />
              </label>

              <label>
                <span>Risk Rating (B15)</span>
                <CellSelect value={riskRating} rowIndex={14} colIndex={1} onCellEdit={onCellEdit}>
                  {[...Array(10)].map((_, idx) => (
                    <option key={idx} value={String(idx)}>{idx}</option>
                  ))}
                </CellSelect>
              </label>

              <label>
                <span>Days to Pay (B16)</span>
                <CellInput type="number" value={daysToPay} rowIndex={15} colIndex={1} onCellEdit={onCellEdit} />
              </label>

              <label>
                <span>Desired PTI % (B17)</span>
                <CellInput value={desiredPti} rowIndex={16} colIndex={1} onCellEdit={onCellEdit} />
              </label>

              <label>
                <span>COLA Clause (B18)</span>
                <CellSelect value={colaClause} rowIndex={17} colIndex={1} onCellEdit={onCellEdit}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </CellSelect>
              </label>

              <label>
                <span>GBS Bid Type (B19)</span>
                <CellSelect value={bidType} rowIndex={18} colIndex={1} onCellEdit={onCellEdit}>
                  <option value="BCS">BCS</option>
                  <option value="AMS">AMS</option>
                </CellSelect>
              </label>
            </div>
          </div>

          <div className="pti-card">
            <h4>Commercial Policy</h4>
            <div className="sheet-form-grid">
              <label>
                <span>Contract Type (B41)</span>
                <CellSelect value={contractType} rowIndex={40} colIndex={1} onCellEdit={onCellEdit}>
                  <option value="Fixed Price">Fixed Price</option>
                  <option value="Time And Materials">Time And Materials</option>
                </CellSelect>
              </label>

              <label>
                <span>Price Type (B42)</span>
                <CellSelect value={priceType} rowIndex={41} colIndex={1} onCellEdit={onCellEdit}>
                  <option value="BAFO Price">BAFO Price</option>
                  <option value="Indicative Price">Indicative Price</option>
                  <option value="B&P Price">B&P Price</option>
                </CellSelect>
              </label>

              <label>
                <span>Consider Non-Labor Cost (B43)</span>
                <CellSelect value={considerNonLabor} rowIndex={42} colIndex={1} onCellEdit={onCellEdit}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </CellSelect>
              </label>

              <label>
                <span>Use Pre-Approved Rates? (B44)</span>
                <CellSelect value={preApprovedRates} rowIndex={43} colIndex={1} onCellEdit={onCellEdit}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </CellSelect>
              </label>
            </div>
          </div>
        </div>

        <div className="pti-right-col">
          <div className="pti-card">
            <h4>Formula Drivers (Read-Only)</h4>
            <div className="pti-driver-grid">
              <div><strong>Country Code</strong><span>{countryCode || '-'}</span></div>
              <div><strong>Total Contingency</strong><span>{formatDisplayValue(totalContingency) || '-'}</span></div>
              <div><strong>Local to US</strong><span>{formatDisplayValue(localToUs) || '-'}</span></div>
              <div><strong>Billing Currency</strong><span>{billingCurrency || '-'}</span></div>
              <div><strong>Model Currency</strong><span>{modelCurrency || '-'}</span></div>
              <div><strong>Currencies Aligned?</strong><span>{currenciesAligned || '-'}</span></div>
            </div>
          </div>

          <div className="pti-card">
            <h4>Estimated Financial Report (Read-Only)</h4>
            <div className="pti-financial-grid">
              {financial.map((item) => (
                <div key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{PCT_LABELS.has(item.label) ? (formatPercent(item.value) || '-') : (formatDisplayValue(item.value) || '-')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pti-card">
            <h4>Data Context (F21:T25)</h4>
            <div className="pti-context-table-wrap">
              <table className="pti-context-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    {contextHeaders.map((header, idx) => <th key={idx}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {contextRows.map((row) => (
                    <tr key={row.row}>
                      <td>{row.row}</td>
                      {row.values.map((value, idx) => <td key={idx}>{formatDisplayValue(value)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default memo(PTISheetView)
