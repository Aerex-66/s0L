import { useState, useMemo, useCallback } from 'react'
import Modal from '../../../shared/ui/Modal'
import { FormField } from '../../../shared/ui/FormField'
import { dealService } from '../../../shared/services/dealService'
import {
  getImplementationTypes,
  getDealTypes,
  getSectors,
  getMarkets,
  getIndustriesForMarket,
  getAllIndustryNames,
} from '../../../shared/constants/referenceData'
import dealConstants from '../../../shared/constants/deal_constants.json'

const FIELD_SECTIONS = [
  {
    title: 'Deal Identity',
    fields: [
      { key: 'opportunity_number', label: 'Opportunity Number', type: 'text' },
      { key: 'client_name', label: 'Client Name', type: 'text' },
      { key: 'project_name', label: 'Project Name', type: 'text' },
      { key: 'opportunity_owner', label: 'Opportunity Owner', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: () => dealConstants.deal_statuses },
    ],
  },
  {
    title: 'Classification',
    fields: [
      { key: 'implementation_type', label: 'Implementation Type', type: 'select', options: getImplementationTypes },
      { key: 'deal_type', label: 'Deal Type', type: 'select', options: getDealTypes },
      { key: 'sector', label: 'Sector', type: 'select', options: getSectors },
      { key: 'market', label: 'Market', type: 'select', options: getMarkets },
      { key: 'industry', label: 'Industry', type: 'select', optionsFn: 'industry' },
      { key: 'service_line', label: 'Service Line', type: 'text' },
    ],
  },
  {
    title: 'Dates',
    fields: [
      { key: 'rfp_submission_date', label: 'RFP Submission Date', type: 'date' },
      { key: 'decision_date', label: 'Decision Date', type: 'date' },
    ],
  },
  {
    title: 'Commercial',
    fields: [
      { key: 'estimated_value', label: 'Estimated Value', type: 'text' },
      { key: 'price_to_win', label: 'Price to Win', type: 'text' },
      { key: 'rate_card', label: 'Rate Card Available', type: 'select', options: () => ['Yes', 'No'] },
    ],
  },
]

export default function DealDetailsPanel({ deal, onClose, onUpdate }) {
  const [formData, setFormData] = useState(() => {
    const d = deal || {}
    const result = {}
    for (const section of FIELD_SECTIONS) {
      for (const f of section.fields) {
        result[f.key] = d[f.key] ?? ''
      }
    }
    return result
  })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const industryOptions = useMemo(() => {
    if (formData.market) {
      const marketIndustries = getIndustriesForMarket(formData.market)
      if (marketIndustries.length > 0) return marketIndustries
    }
    return getAllIndustryNames()
  }, [formData.market])

  const handleChange = useCallback((key, value) => {
    setFormData(prev => {
      const next = { ...prev, [key]: value }
      // Reset industry when market changes if current industry isn't in the new market
      if (key === 'market' && value) {
        const valid = getIndustriesForMarket(value)
        if (valid.length > 0 && !valid.includes(prev.industry)) {
          next.industry = ''
        }
      }
      return next
    })
    setDirty(true)
  }, [])

  const handleSave = async () => {
    if (!deal?.id || !dirty) return
    setSaving(true)
    try {
      // Only send changed fields
      const payload = {}
      for (const section of FIELD_SECTIONS) {
        for (const f of section.fields) {
          const original = deal[f.key] ?? ''
          if (formData[f.key] !== original) {
            payload[f.key] = formData[f.key]
          }
        }
      }
      if (Object.keys(payload).length > 0) {
        await dealService.update(deal.id, payload)
        await onUpdate?.()
      }
      setDirty(false)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const renderField = (field) => {
    const value = formData[field.key] ?? ''

    if (field.type === 'select') {
      const opts = field.optionsFn === 'industry'
        ? industryOptions
        : (typeof field.options === 'function' ? field.options() : field.options || [])

      return (
        <FormField key={field.key} label={field.label}>
          <select
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
          >
            <option value="">—</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </FormField>
      )
    }

    if (field.type === 'date') {
      return (
        <FormField key={field.key} label={field.label}>
          <input
            type="date"
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
          />
        </FormField>
      )
    }

    return (
      <FormField key={field.key} label={field.label}>
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(field.key, e.target.value)}
        />
      </FormField>
    )
  }

  return (
    <Modal title="Deal Details" onClose={onClose} className="deal-details-modal">
      <div className="deal-details-sections">
        {FIELD_SECTIONS.map(section => (
          <div key={section.title} className="deal-details-section">
            <h4 className="deal-details-section-title">{section.title}</h4>
            <div className="deal-details-fields">
              {section.fields.map(renderField)}
            </div>
          </div>
        ))}
      </div>
      <div className="deal-details-footer">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  )
}
