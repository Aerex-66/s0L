import { memo, useEffect, useMemo, useRef } from 'react'
import { TIMELINE_METHODOLOGY, PHASE_DISTRIBUTIONS, WEEKS_PER_MONTH } from '../../../../shared/constants'
import { getIndustriesForMarket, getMarkets, getSectors } from '../../../../shared/constants/referenceData'
import SAPApplicationGrid from './SAPApplicationGrid'

/** Reusable dual-option pill toggle for wizard forms */
const WizardDualToggle = memo(({ label, fieldKey, options, value, onUpdate, setupData }) => {
  const [optA, optB] = options
  const selected = value || optA
  const isB = selected === optB
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="wizard-dual-track">
        <div className="wizard-dual-slider" style={{ transform: isB ? 'translateX(100%)' : 'translateX(0)' }} />
        <button
          type="button"
          className={`wizard-dual-opt ${!isB ? 'wizard-dual-active' : ''}`}
          onClick={() => onUpdate({ ...setupData, [fieldKey]: optA })}
        >{optA}</button>
        <button
          type="button"
          className={`wizard-dual-opt ${isB ? 'wizard-dual-active' : ''}`}
          onClick={() => onUpdate({ ...setupData, [fieldKey]: optB })}
        >{optB}</button>
      </div>
    </div>
  )
})

export const WizardStep0 = memo(({ setupData, onUpdate }) => {
  const markets = getMarkets()
  const sectors = getSectors()
  const availableIndustries = getIndustriesForMarket(setupData.market)

  return (
    <div className="wizard-step">
      <h3>Step 0: Deal Classification</h3>
      <p>Classify your deal to get tailored recommendations and phase distributions.</p>

      <div className="wizard-form">
        <div className="form-group">
          <label>Market *</label>
          <select
            value={setupData.market}
            onChange={(e) => onUpdate({ ...setupData, market: e.target.value, industry: '' })}
          >
            <option value="">Select Market</option>
            {markets.map((marketName) => (
              <option key={marketName} value={marketName}>{marketName}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Sector *</label>
          <select
            value={setupData.sector}
            onChange={(e) => onUpdate({ ...setupData, sector: e.target.value })}
          >
            <option value="">Select Sector</option>
            {sectors.map((sector) => (
              <option key={sector} value={sector}>{sector}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Industry *</label>
          <select
            value={setupData.industry}
            onChange={(e) => onUpdate({ ...setupData, industry: e.target.value })}
            disabled={!setupData.market}
          >
            <option value="">Select Industry</option>
            {availableIndustries.map((industry) => (
              <option key={industry} value={industry}>{industry}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Implementation Type *</label>
          <select
            value={setupData.implementation_type}
            onChange={(e) => onUpdate({ ...setupData, implementation_type: e.target.value })}
          >
            <option value="Greenfield">Greenfield</option>
            <option value="Brownfield">Brownfield</option>
            <option value="Bluefield">Bluefield (Selective Data Transition)</option>
            <option value="Upgrade">Technical Upgrade</option>
          </select>
        </div>

        {/* Dual-option toggle fields matching the Executive Summary slide */}
        <WizardDualToggle
          label="Client"
          fieldKey="client_type"
          options={['Existing', 'New']}
          value={setupData.client_type}
          onUpdate={onUpdate}
          setupData={setupData}
        />

        <WizardDualToggle
          label="Engagement Type"
          fieldKey="engagement_type"
          options={['Renewal / Extension', 'New Business']}
          value={setupData.engagement_type}
          onUpdate={onUpdate}
          setupData={setupData}
        />

        <WizardDualToggle
          label="Engagement Source"
          fieldKey="engagement_source"
          options={['RFI/RFP', 'Unsolicited']}
          value={setupData.engagement_source}
          onUpdate={onUpdate}
          setupData={setupData}
        />

        <WizardDualToggle
          label="Review Status"
          fieldKey="review_status"
          options={['First', 'Repeat']}
          value={setupData.review_status}
          onUpdate={onUpdate}
          setupData={setupData}
        />
        <p className="wizard-help-text">
          Repeat deals include the Solution History slide in the iSBD
        </p>

        <div className="form-group-full">
          <label>SAP Applications</label>
          <p className="wizard-help-text">
            Select all SAP modules and applications in scope for this deal
          </p>
          <SAPApplicationGrid
            selectedApps={setupData.sap_applications}
            onToggle={(apps) => onUpdate({ ...setupData, sap_applications: apps })}
          />
        </div>
      </div>
    </div>
  )
})

export const WizardStep1 = memo(({ setupData, onUpdate, mode }) => {
  // Track whether user has manually edited individual phase durations
  const manuallyEdited = useRef(false)

  // Only auto-recalculate when methodology, implementation_type, duration, or unit change
  // — NOT when individual phase durations are tweaked by the user
  useEffect(() => {
    if (manuallyEdited.current) return

    const totalWeeks = setupData.duration_unit === 'months'
      ? setupData.total_duration * WEEKS_PER_MONTH
      : setupData.total_duration

    const typeDistributions = PHASE_DISTRIBUTIONS[setupData.implementation_type] || PHASE_DISTRIBUTIONS.Greenfield
    const dist = typeDistributions[setupData.methodology] || typeDistributions.balanced
    const nextPhases = {}

    Object.entries(dist).forEach(([phase, percentage]) => {
      const weeks = Math.round(totalWeeks * percentage)
      if (setupData.duration_unit === 'months') {
        nextPhases[phase] = {
          duration: Math.max(1, Math.round(weeks / WEEKS_PER_MONTH)),
          unit: 'months'
        }
      } else {
        nextPhases[phase] = {
          duration: Math.max(1, weeks),
          unit: 'weeks'
        }
      }
    })

    const currentSerialized = JSON.stringify(setupData.phases || {})
    const nextSerialized = JSON.stringify(nextPhases)
    if (currentSerialized !== nextSerialized) {
      onUpdate({ ...setupData, phases: nextPhases })
    }
  }, [setupData.methodology, setupData.implementation_type, setupData.total_duration, setupData.duration_unit, onUpdate])

  // Reset manual flag when methodology or implementation changes
  useEffect(() => {
    manuallyEdited.current = false
  }, [setupData.methodology, setupData.implementation_type])

  const totalDuration = useMemo(() => {
    const sum = Object.values(setupData.phases).reduce((acc, phase) => {
      const weeks = phase.unit === 'months' ? phase.duration * WEEKS_PER_MONTH : phase.duration
      return acc + weeks
    }, 0)
    return setupData.duration_unit === 'months'
      ? `${Math.round(sum / WEEKS_PER_MONTH)} months`
      : `${Math.round(sum)} weeks`
  }, [setupData.phases, setupData.duration_unit])

  return (
    <div className="wizard-step">
      <h3>Step 1: Project Timeline</h3>
      <p>Configure your timeline - phases update in real-time based on your selections.</p>

      <div className="wizard-form wizard-grid-two">
        <div>
          {mode === 'timeline' && (
            <div className="form-group">
              <label>Timeline Name *</label>
              <input
                type="text"
                value={setupData.timeline_name}
                onChange={(e) => onUpdate({ ...setupData, timeline_name: e.target.value })}
                placeholder="e.g., Phase 2, Workstream B, Parallel Project"
              />
              <small className="wizard-hint">
                Give this timeline a descriptive name to distinguish it from other project timelines
              </small>
            </div>
          )}

          <div className="form-group">
            <label>Total Project Duration *</label>
            <div className="wizard-duration-row">
              <input
                type="number"
                min="1"
                value={setupData.total_duration}
                onChange={(e) => onUpdate({ ...setupData, total_duration: parseInt(e.target.value, 10) || 1 })}
                className="wizard-flex-1"
              />
              <select
                value={setupData.duration_unit}
                onChange={(e) => onUpdate({ ...setupData, duration_unit: e.target.value })}
                className="wizard-flex-1"
              >
                <option value="months">Months</option>
                <option value="weeks">Weeks</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Timeline Methodology *</label>
            <div className="wizard-method-list">
              {TIMELINE_METHODOLOGY.map((method) => (
                <label
                  key={method.value}
                  className={`wizard-method-option ${setupData.methodology === method.value ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="methodology"
                    value={method.value}
                    checked={setupData.methodology === method.value}
                    onChange={(e) => onUpdate({ ...setupData, methodology: e.target.value })}
                    className="wizard-method-radio"
                  />
                  <div>
                    <strong>{method.label}</strong>
                    <div className="wizard-method-description">
                      {method.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Project Start Date *</label>
            <input
              type="date"
              value={setupData.project_start_date}
              onChange={(e) => onUpdate({ ...setupData, project_start_date: e.target.value })}
            />
          </div>
        </div>

        <div>
          <div className="phase-preview phase-preview-sticky">
            <h4 className="phase-preview-title">Live Phase Preview</h4>
            <div className="phase-preview-total">
              Total: {totalDuration}
            </div>
            <div className="phase-preview-list">
              {Object.entries(setupData.phases).map(([phase, data], index) => {
                const typeDistributions = PHASE_DISTRIBUTIONS[setupData.implementation_type] || PHASE_DISTRIBUTIONS.Greenfield
                const dist = typeDistributions[setupData.methodology] || typeDistributions.balanced
                const percentage = Math.round((dist[phase] || 0) * 100)

                return (
                  <div
                    key={phase}
                    className="phase-preview-row-draggable"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('phaseIndex', index.toString())
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const fromIndex = parseInt(e.dataTransfer.getData('phaseIndex'), 10)
                      const toIndex = index

                      if (fromIndex === toIndex) return

                      const phaseEntries = Object.entries(setupData.phases)
                      const [movedPhase] = phaseEntries.splice(fromIndex, 1)
                      phaseEntries.splice(toIndex, 0, movedPhase)

                      const reorderedPhases = Object.fromEntries(phaseEntries)
                      onUpdate({ ...setupData, phases: reorderedPhases })
                    }}
                  >
                    <div className="phase-row-top">
                      <div className="phase-row-left">
                        <span className="phase-row-grip">⋮⋮</span>
                        <strong>{phase}</strong>
                      </div>
                      <div className="phase-row-right">
                        <input
                          type="number"
                          min="1"
                          value={data.duration}
                          onChange={(e) => {
                            const newPhases = { ...setupData.phases }
                            newPhases[phase] = { ...data, duration: parseInt(e.target.value, 10) || 1 }
                            onUpdate({ ...setupData, phases: newPhases })
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="phase-duration-input"
                        />
                        <span>{data.unit}</span>
                        <span className="phase-percentage">({percentage}%)</span>
                      </div>
                    </div>
                    <div className="phase-progress-track">
                      <div style={{
                        height: '100%',
                        width: `${percentage}%`,
                        backgroundColor: 'var(--primary-color)',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

export const WizardStep2 = memo(({ setupData, onUpdate }) => (
  <div className="wizard-step">
    <h3>Step 2: Key Resources</h3>
    <p>Assign your core leadership team (you can add more resources later).</p>

    <div className="wizard-form">
      <div className="form-group">
        <label>Delivery Partner</label>
        <input
          type="text"
          value={setupData.delivery_partner}
          onChange={(e) => onUpdate({ ...setupData, delivery_partner: e.target.value })}
          placeholder="Primary delivery organization"
        />
      </div>

      <div className="form-group">
        <label>Program Manager</label>
        <input
          type="text"
          value={setupData.program_manager}
          onChange={(e) => onUpdate({ ...setupData, program_manager: e.target.value })}
          placeholder="Name"
        />
      </div>

      <div className="form-group">
        <label>Response Lead</label>
        <input
          type="text"
          value={setupData.response_lead}
          onChange={(e) => onUpdate({ ...setupData, response_lead: e.target.value })}
          placeholder="Name"
        />
      </div>
    </div>
  </div>
))

export const WizardStep3 = memo(({ setupData, onUpdate }) => (
  <div className="wizard-step">
    <h3>Step 3: Financial Overview</h3>
    <p>An early estimate is enough here — revenue, cost, price type and GP come from the GSSM workbook once it is linked.</p>

    <div className="wizard-form">
      <div className="form-group">
        <label>Estimated Value</label>
        <input
          type="text"
          value={setupData.estimated_value}
          onChange={(e) => onUpdate({ ...setupData, estimated_value: e.target.value })}
          placeholder="e.g., 2500000"
        />
        <small className="wizard-hint">
          Estimated total value of the engagement until GSSM provides TCV
        </small>
      </div>
    </div>
  </div>
))

WizardStep0.displayName = 'WizardStep0'
WizardStep1.displayName = 'WizardStep1'
WizardStep2.displayName = 'WizardStep2'
WizardStep3.displayName = 'WizardStep3'
