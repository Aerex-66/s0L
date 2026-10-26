import { memo } from 'react'
import CellInput from '../components/CellInput'
import { CellSelect } from '../components/CellInput'
import CollapsibleSection from '../components/CollapsibleSection'
import { getSheetDisplayName } from '../utils/normalizer'

const HOME_OPTIONS = {
  iot: [
    'North America IOT',
    'Europe IOT',
    'Japan IOT',
    'Asia Pacific IOT',
    'Greater China Group IOT',
    'Latin America IOT',
    'Middle East & Africa IOT',
  ],
  brandPractice: ['Consulting Svcs', 'AMSI SI', 'AMS SO'],
  sector: ['Communications', 'Distribution', 'Financial', 'Industrial', 'Public'],
  serviceLines: [
    'Business Applications',
    'Strategy & Transformation',
    'Business Operations',
    'Hybrid Cloud and Data',
    'Application Operations',
    'Cybersecurity',
  ],
}

const cellText = (rowData = [], rowOneBased, colZeroBased) => {
  const row = rowData[rowOneBased - 1] || {}
  const value = row[`c${colZeroBased}`]
  return value == null ? '' : String(value)
}

function HomeSheetView({ rowData = [], onCellEdit, onOpportunityChange, isSolutioner }) {
  const iot = cellText(rowData, 13, 9)
  const brandPractice = cellText(rowData, 15, 9)
  const sector = cellText(rowData, 16, 9)
  const serviceLines = cellText(rowData, 18, 9)
  const clientName = cellText(rowData, 20, 9)
  const projectName = cellText(rowData, 21, 9)
  const opportunityNumber = cellText(rowData, 22, 9)
  const approximateTcv = cellText(rowData, 23, 9)

  // Wrapper for opportunity input that also notifies parent
  const handleOpportunityEdit = ({ rowIndex, colIndex, value }) => {
    if (typeof onCellEdit === 'function') {
      onCellEdit({ rowIndex, colIndex, value })
    }
    if (typeof onOpportunityChange === 'function') {
      onOpportunityChange(value)
    }
  }

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('Home')}</h2>
        </div>
      </div>

      <CollapsibleSection label="Project Details">
        <div className="sheet-form-grid">
        <label>
          <span>IOT (J13)</span>
          <CellSelect value={iot} rowIndex={12} colIndex={9} onCellEdit={onCellEdit}>
            <option value="">Select IOT</option>
            {HOME_OPTIONS.iot.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CellSelect>
        </label>

        <label>
          <span>Brand / Practice (J15)</span>
          <CellSelect value={brandPractice} rowIndex={14} colIndex={9} onCellEdit={onCellEdit}>
            <option value="">Select Brand / Practice</option>
            {HOME_OPTIONS.brandPractice.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CellSelect>
        </label>

        <label>
          <span>Sector (J16)</span>
          <CellSelect value={sector} rowIndex={15} colIndex={9} onCellEdit={onCellEdit}>
            <option value="">Select Sector</option>
            {HOME_OPTIONS.sector.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CellSelect>
        </label>

        <label>
          <span>Service Lines (J18)</span>
          <CellSelect value={serviceLines} rowIndex={17} colIndex={9} onCellEdit={onCellEdit}>
            {HOME_OPTIONS.serviceLines.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CellSelect>
        </label>

        <label>
          <span>Client Name (J20)</span>
          <CellInput value={clientName} rowIndex={19} colIndex={9} onCellEdit={onCellEdit} />
        </label>

        <label>
          <span>Project Name (J21)</span>
          <CellInput value={projectName} rowIndex={20} colIndex={9} onCellEdit={onCellEdit} />
        </label>

        <label>
          <span>Opportunity Number (J22)</span>
          <CellInput value={opportunityNumber} rowIndex={21} colIndex={9} onCellEdit={handleOpportunityEdit} />
        </label>

        <label>
          <span>Approximate TCV (J23)</span>
          <CellInput value={approximateTcv} rowIndex={22} colIndex={9} onCellEdit={onCellEdit} />
        </label>
        </div>
      </CollapsibleSection>
    </section>
  )
}

export default memo(HomeSheetView)
