import { useState, useMemo, useEffect } from 'react'
import { Mail, MessageSquare, Phone, Video } from 'lucide-react'
import { dealService } from '../../../shared/services/dealService'
import { directoryService } from '../../../shared/services/directoryService'
import { describeRoles } from '../../../shared/utils/directory'
import { contactEmail, dealLabel, groupEmail, teamsCallLink, teamsChatLink } from '../handoff'
import { ContactIcon } from '../../../shared/ui/Icons'
import PersonLookup from '../../../shared/ui/PersonLookup'
import MeetingComposer from './MeetingComposer'
import OutlookEmailButton from './OutlookEmailButton'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** First and last initial of the first person named ("Dan C Berard / Matt Langer" -> DB). */
function contactInitials(name) {
  const words = String(name || '').split('/')[0].trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}

export default function Contacts({ deal, onUpdate }) {
  const [showForm, setShowForm] = useState(false)
  const [showDirectory, setShowDirectory] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: '', company: '', phone: '', notes: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [directory, setDirectory] = useState([])
  const [composer, setComposer] = useState(null)

  const contacts = deal.contacts || []
  const activities = deal.activities || []
  const label = dealLabel(deal)
  const reachable = contacts.filter(c => c.email)

  // Load global directory for "Add from directory"
  useEffect(() => {
    directoryService.people().then(d => { if (Array.isArray(d)) setDirectory(d) }).catch(() => {})
  }, [])

  // Map contact names → their pending activities
  const activityMap = useMemo(() => {
    const map = {}
    activities.forEach(a => {
      const name = a.reviewer_approver
      if (!name) return
      if (!map[name]) map[name] = []
      map[name].push(a)
    })
    return map
  }, [activities])

  // Directory contacts not yet on this deal
  const availableFromDirectory = useMemo(() => {
    const dealNames = new Set(contacts.map(c => c.name))
    return directory.filter(d => d.name?.trim() && !dealNames.has(d.name))
  }, [directory, contacts])

  const addContact = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required.'); return }
    if (!EMAIL_RE.test(form.email)) { setError('Enter a valid email address.'); return }
    setSaving(true)
    try {
      await dealService.addContact(deal.id, form)
      setForm({ name: '', email: '', role: '', company: '', phone: '', notes: '' })
      setShowForm(false)
      onUpdate()
    } catch (err) { setError(`Failed: ${err.message}`) }
    finally { setSaving(false) }
  }

  const addFromDirectory = async (dirContact) => {
    setSaving(true)
    try {
      await dealService.addContact(deal.id, {
        name: dirContact.name,
        email: dirContact.email || '',
        role: describeRoles(dirContact),
        company: dirContact.company || '',
        phone: dirContact.phone || '',
        notes: '',
        source_id: dirContact.id,
      })
      onUpdate()
    } catch (err) { setError(`Failed: ${err.message}`) }
    finally { setSaving(false) }
  }

  const deleteContact = async (id) => {
    if (deleteConfirm !== id) { setDeleteConfirm(id); setTimeout(() => setDeleteConfirm(null), 3000); return }
    try { await dealService.removeContact(deal.id, id); setDeleteConfirm(null); onUpdate() }
    catch (err) { setError(`Delete failed: ${err.message || 'Unknown error'}`) }
  }

  return (
    <div className="ct-container">
      <div className="ct-toolbar">
        <span className="ct-count">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</span>
        <div className="ct-toolbar-actions">
          {reachable.length > 0 && (
            <>
              <OutlookEmailButton
                className="btn btn-ghost btn-sm"
                message={groupEmail({ contacts: reachable, label })}
                dealId={deal.id}
                title="One Outlook email to every contact on this deal"
              >
                <Mail size={14} /> Email all
              </OutlookEmailButton>
              <button className="btn btn-secondary btn-sm" onClick={() => setComposer({})}>
                <Video size={14} /> Schedule meeting
              </button>
            </>
          )}
          {availableFromDirectory.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowDirectory(!showDirectory)}>
              {showDirectory ? 'Hide directory' : `+ From directory (${availableFromDirectory.length})`}
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add contact'}
          </button>
        </div>
      </div>

      {/* Add from directory panel */}
      {showDirectory && availableFromDirectory.length > 0 && (
        <div className="ct-directory-panel">
          <div className="ct-directory-hint">Add people from the global directory to this deal</div>
          <div className="ct-directory-chips">
            {availableFromDirectory.map(d => (
              <button key={d.id} className="ct-directory-chip" onClick={() => addFromDirectory(d)} disabled={saving}>
                <span className="ct-directory-chip-name">{d.name}</span>
                {describeRoles(d) && <span className="ct-directory-chip-meta">{describeRoles(d)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <form className="ct-form" onSubmit={addContact}>
          {error && <div className="ct-form-error">{error}</div>}
          <div className="ct-form-grid">
            <PersonLookup
              value={form.name}
              onChange={(name) => setForm({ ...form, name })}
              onPick={(person) => setForm((current) => ({
                ...current,
                name: person.name,
                email: person.email,
                company: person.company || current.company,
                phone: person.phone || current.phone,
              }))}
              placeholder="Name * (start typing)"
              required
            />
            <input type="email" placeholder="Email *" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            <input type="text" placeholder="Role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} />
            <input type="text" placeholder="Company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            <input type="tel" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <input type="text" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="ct-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
          </div>
        </form>
      )}

      {contacts.length === 0 && !showForm ? (
        <div className="ct-empty glass-panel">
          <span className="ct-empty-icon">
            <ContactIcon size={24} strokeWidth={1.5} />
          </span>
          <p>No contacts yet. Add stakeholders, approvers, and project leads.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Add first contact</button>
        </div>
      ) : (
        <div className="ct-grid">
          {contacts.map(c => {
            const acts = activityMap[c.name] || []
            const pending = acts.filter(a => a.status !== 'Completed' && a.status !== 'N/A')
            const completed = acts.filter(a => a.status === 'Completed')
            return (
              <div key={c.id} className="ct-card">
                <div className="ct-card-top">
                  <div className="ct-card-identity">
                    <div className="ct-avatar" aria-hidden="true">{contactInitials(c.name)}</div>
                    <div>
                      <div className="ct-name">{c.name}</div>
                      {c.role && <div className="ct-role">{c.role}</div>}
                    </div>
                  </div>
                  <div className="ct-card-top-actions">
                    <button
                      className={`ct-del ${deleteConfirm === c.id ? 'confirm' : ''}`}
                      onClick={() => deleteContact(c.id)}
                      aria-label={deleteConfirm === c.id ? `Confirm removing ${c.name}` : `Remove ${c.name} from this deal`}
                    >
                      {deleteConfirm === c.id ? 'Confirm?' : '\u00d7'}
                    </button>
                  </div>
                </div>
                <div className="ct-card-body">
                  {c.email && <a href={`mailto:${c.email}`} className="ct-detail">{c.email}</a>}
                  {c.company && <span className="ct-detail">{c.company}</span>}
                  {c.phone && <span className="ct-detail">{c.phone}</span>}
                  {c.notes && <span className="ct-detail muted">{c.notes}</span>}
                </div>
                {/* Activities this contact is assigned to */}
                {acts.length > 0 && (
                  <div className="ct-activities">
                    <div className="ct-activities-header">
                      {pending.length > 0 && <span className="ct-act-badge pending">{pending.length} pending</span>}
                      {completed.length > 0 && <span className="ct-act-badge done">{completed.length} done</span>}
                    </div>
                    <div className="ct-activities-list">
                      {acts.slice(0, 4).map(a => (
                        <span key={a.id} className={`ct-act-chip ${a.status === 'Completed' ? 'done' : ''}`} title={a.activity}>
                          {a.activity.length > 30 ? a.activity.slice(0, 28) + '…' : a.activity}
                        </span>
                      ))}
                      {acts.length > 4 && <span className="ct-act-chip more">+{acts.length - 4}</span>}
                    </div>
                  </div>
                )}
                {c.email && (
                  <div className="ct-comms">
                    <OutlookEmailButton
                      className="ct-comm"
                      message={contactEmail({ contact: c, pending, label })}
                      dealId={deal.id}
                      title={`Email ${c.name} in Outlook`}
                    >
                      <Mail size={13} /> Email
                    </OutlookEmailButton>
                    <a
                      className="ct-comm"
                      href={teamsChatLink({ users: [c.email], message: `Hi ${(c.name || '').split(' ')[0]}, re ${label}: ` })}
                      title={`Chat with ${c.name} in Teams`}
                    >
                      <MessageSquare size={13} /> Chat
                    </a>
                    <a className="ct-comm" href={teamsCallLink({ users: [c.email] })} title={`Call ${c.name} in Teams`}>
                      <Phone size={13} /> Call
                    </a>
                    <button
                      type="button"
                      className="ct-comm"
                      onClick={() => setComposer({ attendees: [c.email] })}
                      title={`Schedule a Teams meeting with ${c.name}`}
                    >
                      <Video size={13} /> Meet
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {composer && <MeetingComposer deal={deal} initial={composer} onClose={() => setComposer(null)} />}
    </div>
  )
}
