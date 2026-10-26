import { useState } from 'react'
import Papa from 'papaparse'
import { format as formatDate } from 'date-fns'
import Modal from '../../../shared/ui/Modal'
import { FormField, FormCheckbox } from '../../../shared/ui/FormField'

export default function ExportModal({ deals, onClose }) {
  const [exportFormat, setExportFormat] = useState('csv')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [selectedFields, setSelectedFields] = useState({
    project_name: true,
    client_name: true,
    opportunity_number: true,
    implementation_type: true,
    deal_type: true,
    market: true,
    sector: true,
    industry: true,
    rate_card: true,
    price_to_win: true,
    status: true,
    created_date: true,
    project_start_date: true,
  })
  const [exporting, setExporting] = useState(false)

  const allFields = [
    { key: 'project_name', label: 'Project Name' },
    { key: 'client_name', label: 'Client Name' },
    { key: 'opportunity_number', label: 'Opportunity Number' },
    { key: 'implementation_type', label: 'Implementation Type' },
    { key: 'deal_type', label: 'Deal Type' },
    { key: 'market', label: 'Market' },
    { key: 'sector', label: 'Sector' },
    { key: 'industry', label: 'Industry' },
    { key: 'rate_card', label: 'Rate Card' },
    { key: 'price_to_win', label: 'Price to Win' },
    { key: 'status', label: 'Status' },
    { key: 'created_date', label: 'Created Date' },
    { key: 'project_start_date', label: 'Project Start Date' },
    { key: 'tcv', label: 'TCV' },
    { key: 'gp_percent', label: 'GP %' },
  ]

  const toggleField = (key) => {
    setSelectedFields(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleAll = () => {
    const allSelected = Object.values(selectedFields).every(v => v)
    const newState = {}
    allFields.forEach(f => newState[f.key] = !allSelected)
    setSelectedFields(newState)
  }

  const getFilteredDeals = () => {
    let filtered = deals
    if (!includeArchived) {
      // Exclude closed statuses - use constants
      const closedStatuses = ['Closed Won', 'Closed Lost', 'Archived', 'Completed']
      filtered = deals.filter(d => !closedStatuses.includes(d.status))
    }
    return filtered
  }

  const getFieldValue = (deal, key) => {
    if (key === 'tcv' || key === 'gp_percent') {
      return deal.financials?.[key] || ''
    }

    if (key === 'project_start_date') {
      return deal.project_start_date || deal.timelines?.[0]?.project_start_date || ''
    }

    return deal[key] || ''
  }

  const exportToCSV = () => {
    const filtered = getFilteredDeals()
    const selectedKeys = allFields.filter(f => selectedFields[f.key]).map(f => f.key)
    const headers = allFields.filter(f => selectedFields[f.key]).map(f => f.label)

    const rows = filtered.map(deal => {
      return selectedKeys.map((key) => getFieldValue(deal, key))
    })

    const csv = Papa.unparse({
      fields: headers,
      data: rows
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `deals-export-${formatDate(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const exportToJSON = () => {
    const filtered = getFilteredDeals()
    const json = JSON.stringify(filtered, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `deals-export-${formatDate(new Date(), 'yyyy-MM-dd')}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      if (exportFormat === 'csv') {
        exportToCSV()
      } else if (exportFormat === 'json') {
        exportToJSON()
      }
      setTimeout(() => {
        onClose()
      }, 500)
    } catch (error) {
      alert(`Export failed: ${error.message}`)
    } finally {
      setExporting(false)
    }
  }

  const filteredCount = getFilteredDeals().length

  return (
    <Modal title="Export Deals" onClose={onClose} className="modal-medium">
      <div className="export-step">
            <FormField label="Export Format">
              <div className="format-options">
                <label className="format-option">
                  <input
                    type="radio"
                    value="csv"
                    checked={exportFormat === 'csv'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  <span className="format-icon">CSV</span>
                  <span>CSV</span>
                </label>
                <label className="format-option">
                  <input
                    type="radio"
                    value="json"
                    checked={exportFormat === 'json'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  <span className="format-icon">JSON</span>
                  <span>JSON</span>
                </label>
              </div>
            </FormField>

            <FormCheckbox
              label="Include closed/completed deals"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />

            <div className="form-group">
              <div className="fields-header">
                <label>Select Fields</label>
                <button className="btn-text" onClick={toggleAll}>
                  {Object.values(selectedFields).every(v => v) ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="field-checkboxes">
                {allFields.map(field => (
                  <label key={field.key} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedFields[field.key]}
                      onChange={() => toggleField(field.key)}
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="export-summary">
              Exporting {filteredCount} deals with {Object.values(selectedFields).filter(v => v).length} fields
            </div>
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button 
          className="btn btn-primary" 
          onClick={handleExport}
          disabled={exporting || Object.values(selectedFields).every(v => !v)}
        >
          {exporting ? 'Exporting...' : 'Export'}
        </button>
      </div>
    </Modal>
  )
}
