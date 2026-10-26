import { useState, useMemo, useCallback } from 'react'
import { PHASE_DISTRIBUTIONS } from '../../../shared/constants'
import { REQUIRED_REFERENCE_FIELDS } from '../../../shared/constants/referenceData'
import { isEditable } from '../../../shared/constants/fieldIndex'
import { WizardStep0, WizardStep1, WizardStep2, WizardStep3 } from './wizard/WizardSteps'
import { dealService } from '../../../shared/services/dealService'
import Modal from '../../../shared/ui/Modal'
import { autoCalculateTimeline } from '../../../shared/utils/timelineHelpers'

export default function QuickSetupWizard({ deal, onComplete, mode = 'setup' }) {
  // mode can be 'setup' (full wizard) or 'timeline' (add new timeline only)
  const [step, setStep] = useState(mode === 'timeline' ? 1 : 0)
  const [saveError, setSaveError] = useState('')
  
  // Get existing resources for prepopulation
  const existingResources = deal.resources?.leadership || []
  const deliveryPartner = existingResources.find(r => r.role === 'Delivery Partner')?.assigned_to || ''
  const programManager = existingResources.find(r => r.role === 'Program Manager')?.assigned_to || ''
  const responseLead = existingResources.find(r => r.role === 'Response Lead')?.assigned_to || ''
  
  // Get existing timeline for prepopulation (use first timeline if exists)
  const existingTimeline = deal.timelines?.[0] || {
    name: 'Main Project',
    timeline: {},
    project_start_date: '',
    methodology: 'balanced'
  }
  
  const [setupData, setSetupData] = useState({
    // Deal Classification (Step 0) - prepopulate from existing deal
    market: deal.market || '',
    sector: deal.sector || '',
    industry: deal.industry || '',
    implementation_type: deal.implementation_type || 'Greenfield',
    client_type: deal.client_type || 'Existing',
    engagement_type: deal.engagement_type || 'Renewal / Extension',
    engagement_source: deal.engagement_source || 'RFI/RFP',
    review_status: deal.review_status || 'First',
    sap_applications: deal.sap_applications || [],
    
    // Timeline - prepopulate if editing
    timeline_name: mode === 'timeline' ? 'New Timeline' : (existingTimeline.name || 'Main Project'),
    total_duration: existingTimeline.total_duration || 12,
    duration_unit: existingTimeline.duration_unit || 'months',
    methodology: existingTimeline.methodology || 'balanced',
    project_start_date: existingTimeline.project_start_date || '',
    
    // Phases - prepopulate from existing timeline
    phases: existingTimeline.timeline && Object.keys(existingTimeline.timeline).length > 0
      ? existingTimeline.timeline
      : {
          Prepare: { duration: 2, unit: 'months' },
          Explore: { duration: 3, unit: 'months' },
          Build: { duration: 4, unit: 'months' },
          Test: { duration: 2, unit: 'months' },
          'Go-Live': { duration: 1, unit: 'months' },
          Hypercare: { duration: 2, unit: 'months' }
        },
    
    // Key Resources - prepopulate from existing deal
    delivery_partner: deliveryPartner,
    program_manager: programManager,
    response_lead: responseLead,
    
    // Financials - an early estimate until the GSSM workbook provides TCV
    estimated_value: deal.estimated_value || '',
  })

  const autoCalculatePhases = useCallback(() => {
    const phases = autoCalculateTimeline(
      setupData.total_duration,
      setupData.duration_unit,
      setupData.implementation_type,
      setupData.methodology,
      PHASE_DISTRIBUTIONS
    )
    setSetupData({ ...setupData, phases })
  }, [setupData])

  const saveSetup = async () => {
    try {
      setSaveError('')
      if (mode === 'timeline') {
        // Timeline-only mode: Add new timeline to existing deal
        const existingTimelines = deal.timelines || []
        
        const newTimeline = {
          name: setupData.timeline_name,
          implementation_type: setupData.implementation_type,
          methodology: setupData.methodology,
          total_duration: setupData.total_duration,
          duration_unit: setupData.duration_unit,
          project_start_date: setupData.project_start_date,
          timeline: setupData.phases
        }
        
        await dealService.updateTimeline(deal.id, {
          timelines: [...existingTimelines, newTimeline]
        })
      } else {
        // Full setup mode
        // Save deal classification
        await dealService.update(deal.id, {
          market: setupData.market,
          sector: setupData.sector,
          industry: setupData.industry,
          implementation_type: setupData.implementation_type,
          client_type: setupData.client_type,
          engagement_type: setupData.engagement_type,
          engagement_source: setupData.engagement_source,
          review_status: setupData.review_status,
          sap_applications: setupData.sap_applications,
          ...(setupData.estimated_value ? { estimated_value: setupData.estimated_value } : {}),
        })

        // Save timeline as multi-timeline structure (GSSM owns it once a workbook is linked)
        if (isEditable('timelines', deal)) await dealService.updateTimeline(deal.id, {
          timelines: [{
            name: setupData.timeline_name,
            implementation_type: setupData.implementation_type,
            methodology: setupData.methodology,
            total_duration: setupData.total_duration,
            duration_unit: setupData.duration_unit,
            project_start_date: setupData.project_start_date,
            timeline: setupData.phases
          }]
        })

        // Save resources
        await dealService.updateResources(deal.id, {
          leadership: [
            { role: 'Delivery Partner', assigned_to: setupData.delivery_partner, email: '' },
            { role: 'Program Manager', assigned_to: setupData.program_manager, email: '' },
            { role: 'Response Lead', assigned_to: setupData.response_lead, email: '' }
          ]
        })
      }

      onComplete()
    } catch (error) {
      console.error('Error saving setup:', error)
      setSaveError(`Unable to save wizard changes: ${error.message}`)
    }
  }

  const renderCurrentStep = useMemo(() => {
    if (step === 0) {
      return <WizardStep0 setupData={setupData} onUpdate={setSetupData} />
    } else if (step === 1) {
      return <WizardStep1 setupData={setupData} onUpdate={setSetupData} autoCalculatePhases={autoCalculatePhases} mode={mode} />
    } else if (step === 2) {
      return <WizardStep2 setupData={setupData} onUpdate={setSetupData} />
    } else if (step === 3) {
      return <WizardStep3 setupData={setupData} onUpdate={setSetupData} />
    }
    return null
  }, [step, setupData, autoCalculatePhases, mode])

  const canProceed = () => {
    if (mode === 'timeline') {
      // Timeline-only mode
      if (step === 1) {
        return setupData.timeline_name.trim() && setupData.total_duration > 0 && setupData.project_start_date
      }
      return true
    }
    
    // Full setup mode
    if (step === 0) {
      return REQUIRED_REFERENCE_FIELDS.every((fieldName) => Boolean(setupData[fieldName]))
    }
    if (step === 1) {
      return setupData.total_duration > 0 && setupData.project_start_date
    }
    if (step === 2) {
      return true
    }
    return true
  }

  const getMaxStep = () => mode === 'timeline' ? 1 : 3

  return (
    <Modal 
      title={mode === 'timeline' ? 'Add New Timeline' : 'Configure Solution'} 
      onClose={onComplete} 
      className="wizard-modal"
    >
      <div className="wizard-body-container">
        {saveError && (
          <div className="text-danger" style={{ padding: '0.5rem 1rem 0' }}>
            {saveError}
          </div>
        )}
        {mode !== 'timeline' && (
          <div className="wizard-progress-bar">
            <div className="wizard-step-indicator" data-active={step >= 0}>
              <div className="step-number">0</div>
              <span className="step-label">Classification</span>
            </div>
            <div className="wizard-step-indicator" data-active={step >= 1}>
              <div className="step-number">1</div>
              <span className="step-label">Timeline</span>
            </div>
            <div className="wizard-step-indicator" data-active={step >= 2}>
              <div className="step-number">2</div>
              <span className="step-label">Resources</span>
            </div>
            <div className="wizard-step-indicator" data-active={step >= 3}>
              <div className="step-number">3</div>
              <span className="step-label">Financials</span>
            </div>
          </div>
        )}

        <div className="wizard-content">
          {renderCurrentStep}
        </div>

        <div className="wizard-actions">
          <span className="wizard-footer-label">{mode === 'timeline' ? 'Add timeline' : 'Configure deal terms'}</span>
          <div className="wizard-actions-buttons">
            {step > (mode === 'timeline' ? 1 : 0) && (
              <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            {step < getMaxStep() ? (
              <button 
                className="btn btn-primary" 
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
              >
                Next
              </button>
            ) : (
              <button className="btn btn-primary" onClick={saveSetup} disabled={!canProceed()}>
                {mode === 'timeline' ? 'Add Timeline' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
