import { memo } from 'react'
import CellInput from '../components/CellInput'
import CollapsibleSection from '../components/CollapsibleSection'
import { getSheetDisplayName } from '../utils/normalizer'

const cellText = (rowData = [], rowOneBased, colZeroBased) => {
  const row = rowData[rowOneBased - 1] || {}
  const value = row[`c${colZeroBased}`]
  return value == null ? '' : String(value)
}

function CloudSheetView({ rowData = [], onCellEdit, isSolutioner }) {
  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('Cloud')}</h2>
        </div>
      </div>

      <CollapsibleSection label="Organization">
        <div className="sheet-form-grid">
          <label>
            <span>IOT (B6)</span>
            <CellInput value={cellText(rowData, 6, 1)} rowIndex={5} colIndex={1} onCellEdit={onCellEdit} />
          </label>
          <label>
            <span>IMT (B7)</span>
            <CellInput value={cellText(rowData, 7, 1)} rowIndex={6} colIndex={1} onCellEdit={onCellEdit} />
          </label>
          <label>
            <span>Brand (B8)</span>
            <CellInput value={cellText(rowData, 8, 1)} rowIndex={7} colIndex={1} onCellEdit={onCellEdit} />
          </label>
          <label>
            <span>Sector (B9)</span>
            <CellInput value={cellText(rowData, 9, 1)} rowIndex={8} colIndex={1} onCellEdit={onCellEdit} />
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection label="Project Information">
        <div className="sheet-form-grid">
          <label>
            <span>Client Name (B12)</span>
            <CellInput value={cellText(rowData, 12, 1)} rowIndex={11} colIndex={1} onCellEdit={onCellEdit} />
          </label>
          <label>
            <span>Project Name (B13)</span>
            <CellInput value={cellText(rowData, 13, 1)} rowIndex={12} colIndex={1} onCellEdit={onCellEdit} />
          </label>
          <label>
            <span>Scenario Name (B14)</span>
            <CellInput value={cellText(rowData, 14, 1)} rowIndex={13} colIndex={1} onCellEdit={onCellEdit} />
          </label>
          <label>
            <span>Siebel Number (B15)</span>
            <CellInput value={cellText(rowData, 15, 1)} rowIndex={14} colIndex={1} onCellEdit={onCellEdit} />
          </label>
          <label>
            <span>Decision Date (B16)</span>
            <CellInput value={cellText(rowData, 16, 1)} rowIndex={15} colIndex={1} onCellEdit={onCellEdit} />
          </label>
          <label>
            <span>File Version (B17)</span>
            <CellInput value={cellText(rowData, 17, 1)} rowIndex={16} colIndex={1} onCellEdit={onCellEdit} />
          </label>
          <label>
            <span>Version Date (B18)</span>
            <CellInput value={cellText(rowData, 18, 1)} rowIndex={17} colIndex={1} onCellEdit={onCellEdit} />
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection label="User Details">
        <div className="sheet-form-grid">
          <label>
            <span>User Name (B21)</span>
            <CellInput value={cellText(rowData, 21, 1)} rowIndex={20} colIndex={1} onCellEdit={onCellEdit} />
          </label>
          <label>
            <span>User Serial # (B22)</span>
            <CellInput value={cellText(rowData, 22, 1)} rowIndex={21} colIndex={1} onCellEdit={onCellEdit} />
          </label>
          <label>
            <span>User Notes ID (B23)</span>
            <CellInput value={cellText(rowData, 23, 1)} rowIndex={22} colIndex={1} onCellEdit={onCellEdit} />
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection label="Notes">
        <div className="sheet-form-grid">
          <label>
            <span>Version Notes (D6)</span>
            <CellInput as="textarea" value={cellText(rowData, 6, 3)} rowIndex={5} colIndex={3} onCellEdit={onCellEdit} rows={5} />
          </label>
        </div>
      </CollapsibleSection>

    </section>
  )
}

export default memo(CloudSheetView)
