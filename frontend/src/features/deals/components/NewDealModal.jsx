import { useEffect, useMemo, useState } from 'react'
import {
  getAllIndustryNames, getDealTypes, getImplementationTypes, getSectors,
  isRequiredReferenceField, isRequiredTextField,
} from '../../../shared/constants/referenceData'
import { mondayService } from '../../../shared/services/mondayService'
import useDealStore from '../../../shared/dealStore'
import Modal from '../../../shared/ui/Modal'
import { FormField } from '../../../shared/ui/FormField'
import { boardClient, newDealPayload } from '../newDealPayload'
import ClientPicker from './ClientPicker'

const LOCAL_FIELDS = [
  'opportunity_number', 'client_name', 'project_name', 'rfp_submission_date', 'rate_card',
  'price_to_win', 'currency', 'sector', 'industry', 'implementation_type', 'deal_type',
]
const PEOPLE = [['lead_ssc', 'Lead SSC'], ['tt_executive', 'TT Exec'], ['solution_consultant_2', 'SSC2'], ['solution_consultant_3', 'SSC3']]
const EMPTY = {
  group: '', opportunity_number: '', client_name: '', project_name: '', rfp_submission_date: '',
  rate_card: 'Yes', price_to_win: '', currency: '', sector: '', industry: '', implementation_type: '', deal_type: '',
  lead_ssc: '', tt_executive: '', solution_consultant_2: '', solution_consultant_3: '',
}

/**
 * New deal. Signed in to monday, it adds the row to the board (with the board's own lists) and the
 * linked deal to s0L; TT Execs choose the people and may add a new client, anyone else is the Lead SSC.
 * Not signed in, the deal stays in s0L.
 */
export default function NewDealModal({ onClose, onCreate, onAdded }) {
  const [formData, setFormData] = useState(EMPTY)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [board, setBoard] = useState({ status: 'loading' })
  const [error, setError] = useState('')
  const mondayName = useDealStore((s) => s.mondayMe?.name || '')
  const openNamePicker = useDealStore((s) => s.openNamePicker)
  const deals = useDealStore((s) => s.deals)

  // Asked again after a name is picked, so the form knows who is filling it in.
  useEffect(() => {
    let alive = true
    mondayService.newDealOptions()
      .then((body) => { if (alive) setBoard({ status: 'ready', ...body }) })
      .catch(() => { if (alive) setBoard({ status: 'offline' }) })
    return () => { alive = false }
  }, [mondayName])

  const onBoard = board.status === 'ready'
  const me = onBoard ? board.me : null
  const lists = useMemo(() => (onBoard
    ? { implementation_type: board.options.implementation_type || [], sector: board.options.sector || [], industry: board.options.industry || [] }
    : { implementation_type: getImplementationTypes(), sector: getSectors(), industry: getAllIndustryNames() }
  ), [onBoard, board])
  const dealTypes = useMemo(() => getDealTypes(), [])
  const clients = onBoard ? board.options.client_name || [] : []
  // Off the board, the currencies deals already use stand in for monday's list.
  const currencies = useMemo(() => (onBoard
    ? board.options.currency || []
    : [...new Set(deals.map((deal) => deal.currency).filter(Boolean))].sort()
  ), [onBoard, board, deals])

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    setError('')
    if (onBoard && !me.name) {
      openNamePicker()
      return
    }
    if (onBoard && !me.is_exec && !boardClient(formData.client_name, clients)) {
      setError("Pick a client from the board's list. Only TT Execs can add a new client.")
      return
    }
    setIsSubmitting(true)
    try {
      if (onBoard) {
        await onAdded(await mondayService.addDeal(newDealPayload(formData, me.is_exec)))
      } else {
        await onCreate(Object.fromEntries(LOCAL_FIELDS.map((key) => [key, formData[key]])))
      }
    } catch (failure) {
      setError(failure.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const select = (name, label, options, placeholder, required) => (
    <FormField label={label} required={required}>
      <select name={name} value={formData[name]} onChange={handleChange} required={required}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </FormField>
  )

  return (
    <Modal title="Create New Deal" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {board.status === 'loading' && <p className="modal-note">Loading the board&apos;s lists from monday…</p>}
        {board.status === 'offline' && (
          <p className="modal-note">Not connected to monday, so this deal stays in s0L. Click the monday icon at the top to connect.</p>
        )}
        {onBoard && !me.name && (
          <p className="modal-note">
            Pick your name on the board first, so monday knows who added this deal.{' '}
            <button type="button" className="chip chip--interactive" onClick={openNamePicker}>Pick my name</button>
          </p>
        )}

        <div className="modal-form-grid">
          {onBoard && select('group', 'Practice', board.groups, 'Select practice', true)}

          <FormField label="Opportunity Number" required>
            <input
              type="text"
              name="opportunity_number"
              value={formData.opportunity_number}
              onChange={handleChange}
              placeholder="e.g. 006gR000003elCzQAI"
              required={isRequiredTextField('opportunity_number')}
            />
          </FormField>

          <FormField label="Client Name" required>
            {onBoard ? (
              <ClientPicker
                value={formData.client_name}
                clients={clients}
                canAdd={Boolean(me?.is_exec)}
                onChange={(client) => setFormData((form) => ({ ...form, client_name: client }))}
              />
            ) : (
              <input
                type="text"
                name="client_name"
                value={formData.client_name}
                onChange={handleChange}
                placeholder="Client organization"
                required={isRequiredTextField('client_name')}
              />
            )}
          </FormField>

          <FormField label="Project Name" required className="modal-form-span-2">
            <input
              type="text"
              name="project_name"
              value={formData.project_name}
              onChange={handleChange}
              placeholder="Deal or transformation name"
              required={isRequiredTextField('project_name')}
            />
          </FormField>

          {select('implementation_type', 'Implementation Type', lists.implementation_type, 'Select type', isRequiredReferenceField('implementation_type'))}
          {select('deal_type', 'Deal Type', dealTypes, 'Select deal type', true)}
          {select('sector', 'Sector', lists.sector, 'Select sector', isRequiredReferenceField('sector'))}
          {select('industry', 'Industry', lists.industry, 'Select industry', isRequiredReferenceField('industry'))}

          <FormField label="RFP Submission Date">
            <input
              type="date"
              name="rfp_submission_date"
              value={formData.rfp_submission_date}
              onChange={handleChange}
            />
          </FormField>

          {select('rate_card', 'Rate Card Available?', ['Yes', 'No'], 'Select option', true)}

          <FormField label="Price to Win / Expected TCV">
            <input
              type="text"
              name="price_to_win"
              value={formData.price_to_win}
              onChange={handleChange}
              placeholder="e.g. 12.5M"
            />
          </FormField>

          {select('currency', 'Currency', currencies, 'Select currency', currencies.length > 0)}

          {onBoard && me.is_exec && PEOPLE.map(([name, label]) => (
            <div key={name}>{select(name, label, board.options[name] || [], '—', false)}</div>
          ))}
          {onBoard && me.name && !me.is_exec && (
            <FormField label="Lead SSC">
              <input type="text" value={`${me.name} (you)`} readOnly />
            </FormField>
          )}
        </div>

        {error && <div className="text-danger mb-sm" role="alert">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting || board.status === 'loading'}>
            {onBoard
              ? (isSubmitting ? 'Adding to monday…' : 'Create on monday')
              : (isSubmitting ? 'Creating...' : 'Create Deal')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
