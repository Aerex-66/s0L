import { useMemo, useState } from 'react'
import { isRequiredReferenceField, isRequiredTextField } from '../../../shared/constants/referenceData'
import { getAllIndustryNames, getImplementationTypes, getSectors, getDealTypes } from '../../../shared/constants/referenceData'
import Modal from '../../../shared/ui/Modal'
import { FormField } from '../../../shared/ui/FormField'

export default function NewDealModal({ onClose, onCreate }) {
  const [formData, setFormData] = useState({
    opportunity_number: '',
    client_name: '',
    project_name: '',
    rfp_submission_date: '',
    rate_card: 'Yes',
    price_to_win: '',
    sector: '',
    industry: '',
    implementation_type: '',
    deal_type: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onCreate(formData)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const industryOptions = useMemo(() => {
    return getAllIndustryNames()
  }, [])

  const implementationTypes = useMemo(() => getImplementationTypes(), [])
  const dealTypes = useMemo(() => getDealTypes(), [])
  const sectors = useMemo(() => getSectors(), [])

  return (
    <Modal title="Create New Deal" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Opportunity Number" required>
            <input
              type="text"
              name="opportunity_number"
              value={formData.opportunity_number}
              onChange={handleChange}
              required={isRequiredTextField('opportunity_number')}
            />
          </FormField>

          <FormField label="Client Name" required>
            <input
              type="text"
              name="client_name"
              value={formData.client_name}
              onChange={handleChange}
              required={isRequiredTextField('client_name')}
            />
          </FormField>

          <FormField label="Project Name" required>
            <input
              type="text"
              name="project_name"
              value={formData.project_name}
              onChange={handleChange}
              required={isRequiredTextField('project_name')}
            />
          </FormField>

          <FormField label="RFP Submission Date">
            <input
              type="date"
              name="rfp_submission_date"
              value={formData.rfp_submission_date}
              onChange={handleChange}
            />
          </FormField>

          <FormField label="Rate Card Available?" required>
            <select
              name="rate_card"
              value={formData.rate_card}
              onChange={handleChange}
              required
            >
              <option value="">Select option</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </FormField>

          <FormField label="Price to Win">
            <input
              type="text"
              name="price_to_win"
              value={formData.price_to_win}
              onChange={handleChange}
            />
          </FormField>

          <FormField label="Implementation Type" required>
            <select
              name="implementation_type"
              value={formData.implementation_type}
              onChange={handleChange}
              required={isRequiredReferenceField('implementation_type')}
            >
              <option value="">Select type</option>
              {implementationTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Deal Type" required>
            <select
              name="deal_type"
              value={formData.deal_type}
              onChange={handleChange}
              required
            >
              <option value="">Select deal type</option>
              {dealTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Sector" required>
            <select
              name="sector"
              value={formData.sector}
              onChange={handleChange}
              required={isRequiredReferenceField('sector')}
            >
              <option value="">Select sector</option>
              {sectors.map(sector => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Industry" required>
            <select
              name="industry"
              value={formData.industry}
              onChange={handleChange}
              required={isRequiredReferenceField('industry')}
            >
              <option value="">Select industry</option>
              {industryOptions.map((industry) => (
                <option key={industry} value={industry}>{industry}</option>
              ))}
            </select>
          </FormField>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Deal'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
