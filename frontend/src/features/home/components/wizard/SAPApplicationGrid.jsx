import { memo } from 'react'
import { SAP_APPLICATIONS } from '../../../../shared/constants/sapApplications'

const SAPApplicationGrid = memo(({ selectedApps, onToggle }) => {
  const toggleApp = (acronym) => {
    const newApps = selectedApps.includes(acronym)
      ? selectedApps.filter(app => app !== acronym)
      : [...selectedApps, acronym]
    onToggle(newApps)
  }

  const renderCategory = (title, badge, apps) => {
    const filteredApps = apps.filter(acronym => SAP_APPLICATIONS[acronym])
    if (filteredApps.length === 0) return null

    return (
      <div className="sap-apps-category" key={title}>
        <div className="sap-apps-category-header">
          <h5>{title}</h5>
          <span className={`category-badge ${badge}`}>{badge}</span>
        </div>
        <div className="sap-apps-grid">
          {filteredApps.map(acronym => {
            const app = SAP_APPLICATIONS[acronym]
            return (
              <label key={acronym} className="sap-app-item">
                <input
                  type="checkbox"
                  checked={selectedApps.includes(acronym)}
                  onChange={() => toggleApp(acronym)}
                />
                <div className="app-info">
                  <span className="app-acronym">{acronym}</span>
                  <span className="app-name">{app.processArea}</span>
                </div>
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="sap-apps-container">
      {renderCategory('Finance & Accounting', 'Core ERP', 
        ['FI', 'CO', 'TR', 'RA'])}
      
      {renderCategory('Enterprise Platform & Data', 'Core ERP', 
        ['S/4HANA', 'MDG'])}
      
      {renderCategory('Supply Chain & Logistics', 'LoB', 
        ['MM', 'SD', 'PP', 'QM', 'PM', 'EWM', 'TM', 'aATP', 'IBP', 'GTS'])}
      
      {renderCategory('Human Resources', 'LoB', 
        ['HCM', 'SF', 'Payroll', 'Time'])}
      
      {renderCategory('Customer & Commerce', 'LoB', 
        ['CRM', 'C4C', 'Commerce', 'CPQ', 'Billing'])}
      
      {renderCategory('Enterprise Services', 'LoB', 
        ['SRM', 'Ariba', 'Concur', 'Fieldglass'])}
      
      {renderCategory('Analytics & Intelligence', 'Analytics', 
        ['BW', 'HANA', 'Analytics Cloud', 'Data Intelligence'])}
      
      {renderCategory('Industry Solutions', 'industry', 
        ['IS-U', 'Retail', 'OGE', 'Auto', 'A&D', 'LS', 'Chem', 'PSCD', 'Banking', 'Insurance'])}
    </div>
  )
})

SAPApplicationGrid.displayName = 'SAPApplicationGrid'

export default SAPApplicationGrid
