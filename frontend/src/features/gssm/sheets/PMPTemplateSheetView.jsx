import { memo } from 'react'
import CellInput from '../components/CellInput'
import { useColumnToggle } from '../components/ColumnToggle'
import CollapsibleSection from '../components/CollapsibleSection'
import { getSheetDisplayName } from '../utils/normalizer'

const PMP_COLUMNS = [
  { key: 'roleType', label: 'Role Type' },
  { key: 'status', label: 'Status' },
  { key: 'owner', label: 'Owner' },
  { key: 'delegate', label: 'Delegate' },
  { key: 'preferredChannel', label: 'Preferred Channel' },
  { key: 'laborCategory', label: 'Labor Category' },
  { key: 'title', label: 'Title' },
  { key: 'requiredSkills', label: 'Required Skills' },
]

const cellText = (rowData = [], rowOneBased, colZeroBased) => {
  const row = rowData[rowOneBased - 1] || {}
  const value = row[`c${colZeroBased}`]
  return value == null ? '' : String(value)
}

const LEFT_FIELDS = [
  { label: 'Opportunity Name', row: 1, col: 6 },
  { label: 'Opportunity ID', row: 2, col: 6 },
  { label: 'Client Name', row: 3, col: 6 },
  { label: 'Plan Type', row: 5, col: 6 },
  { label: 'Plan LoB', row: 6, col: 6 },
  { label: 'Plan Status', row: 7, col: 6 },
  { label: 'Plan Start Date', row: 10, col: 6 },
  { label: 'Plan End Date', row: 11, col: 6 },
  { label: 'Geo Plan Owner', row: 12, col: 6 },
  { label: 'Geo Plan Delegate', row: 13, col: 6 },
  { label: 'GIC Plan Owner', row: 14, col: 6 },
  { label: 'GIC Plan Delegate', row: 15, col: 6 },
]

const RIGHT_FIELDS = [
  { label: 'Contract Owner', row: 1, col: 8 },
  { label: 'Contract Type', row: 2, col: 8 },
  { label: 'Country', row: 4, col: 8 },
  { label: 'State / Province', row: 5, col: 8 },
  { label: 'City', row: 6, col: 8 },
  { label: 'Account Name', row: 11, col: 8 },
  { label: 'Contract Owning Country', row: 12, col: 8 },
  { label: 'Sector', row: 13, col: 8 },
  { label: 'Industry', row: 14, col: 8 },
  { label: 'Delivery Center Type', row: 16, col: 8 },
]

function PMPTemplateSheetView({ rowData = [], onCellEdit, isSolutioner }) {
  const { hiddenSet, ColumnToggleButton, ColumnTogglePanel } = useColumnToggle(PMP_COLUMNS)
  const rosterRows = []
  for (let row = 20; row <= Math.min(rowData.length, 120); row += 1) {
    const roleType = cellText(rowData, row, 1)
    const title = cellText(rowData, row, 8)
    if (!roleType && !title) continue
    rosterRows.push({
      row,
      roleType,
      status: cellText(rowData, row, 2),
      owner: cellText(rowData, row, 3),
      delegate: cellText(rowData, row, 4),
      preferredChannel: cellText(rowData, row, 6),
      laborCategory: cellText(rowData, row, 7),
      title,
      requiredSkills: cellText(rowData, row, 9),
    })
  }

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('PMP Template')}</h2>
        </div>
        {isSolutioner && (
          <div className="stat-row">
            <ColumnToggleButton />
          </div>
        )}
      </div>

      {isSolutioner && <ColumnTogglePanel />}

      <CollapsibleSection label="Plan Details & Contract">
        <div className="pmp-meta-grid">
        <div className="pmp-card">
          <h4>Plan Details</h4>
          <div className="sheet-form-grid">
            {LEFT_FIELDS.map((field) => (
              <label key={`${field.row}-${field.col}`}>
                <span>{field.label}</span>
                <CellInput
                  value={cellText(rowData, field.row, field.col)}
                  rowIndex={field.row - 1}
                  colIndex={field.col}
                  onCellEdit={onCellEdit}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="pmp-card">
          <h4>Contract & Account</h4>
          <div className="sheet-form-grid">
            {RIGHT_FIELDS.map((field) => (
              <label key={`${field.row}-${field.col}`}>
                <span>{field.label}</span>
                <CellInput
                  value={cellText(rowData, field.row, field.col)}
                  rowIndex={field.row - 1}
                  colIndex={field.col}
                  onCellEdit={onCellEdit}
                />
              </label>
            ))}
          </div>
        </div>
        </div>
      </CollapsibleSection>

      <div className="section-divider">Resource Roster</div>
      <div className="sheet-data-table-wrap" style={{ maxHeight: '58vh' }}>
        <table className="sheet-data-table">
          <thead>
            <tr>
              {!hiddenSet.has('roleType') && <th>Role Type</th>}
              {!hiddenSet.has('status') && <th>Status</th>}
              {!hiddenSet.has('owner') && <th>Owner</th>}
              {!hiddenSet.has('delegate') && <th>Delegate</th>}
              {!hiddenSet.has('preferredChannel') && <th>Preferred Channel</th>}
              {!hiddenSet.has('laborCategory') && <th>Labor Category</th>}
              {!hiddenSet.has('title') && <th>Title</th>}
              {!hiddenSet.has('requiredSkills') && <th>Required Skills</th>}
            </tr>
          </thead>
          <tbody>
            {rosterRows.map((item) => (
              <tr key={item.row}>
                {!hiddenSet.has('roleType') && <td className="td-role-type">{item.roleType}</td>}
                {!hiddenSet.has('status') && <td>{item.status}</td>}
                {!hiddenSet.has('owner') && <td>{item.owner}</td>}
                {!hiddenSet.has('delegate') && <td>{item.delegate}</td>}
                {!hiddenSet.has('preferredChannel') && <td>{item.preferredChannel}</td>}
                {!hiddenSet.has('laborCategory') && <td>{item.laborCategory}</td>}
                {!hiddenSet.has('title') && <td>{item.title}</td>}
                {!hiddenSet.has('requiredSkills') && <td>{item.requiredSkills}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(PMPTemplateSheetView)
