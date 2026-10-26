import { useState, useMemo } from 'react'
import { FormField } from '../../../shared/ui/FormField'

const ROLE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'SAL', label: 'SAL' },
  { id: 'PAL', label: 'PAL' },
  { id: 'other', label: 'Other' },
]

const EMPTY_FORM = { name: '', email: '', role: '', area: '', company: '', phone: '', slack: '', notes: '' }

export default function DirectoryTab({
  contacts,
  onAdd,
  onUpdate,
  onDelete,
  savedId,
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [filter, setFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = contacts || []
    if (filter === 'SAL') list = list.filter(c => c.role === 'SAL')
    else if (filter === 'PAL') list = list.filter(c => c.role === 'PAL')
    else if (filter === 'other') list = list.filter(c => c.role !== 'SAL' && c.role !== 'PAL')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.area || '').toLowerCase().includes(q) ||
        (c.role || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [contacts, filter, search])

  const handleAdd = () => {
    if (!form.name.trim()) return
    onAdd(form)
    setForm(EMPTY_FORM)
    setShowForm(false)
  }

  const startEdit = (c) => {
    setEditingId(c.id)
    setEditForm({
      name: c.name || '', email: c.email || '', role: c.role || '',
      area: c.area || '', company: c.company || '', phone: c.phone || '',
      slack: c.slack || '', notes: c.notes || '',
    })
  }

  const saveEdit = (id) => {
    onUpdate(id, editForm)
    setEditingId(null)
  }

  return (
    <div className="settings-section">
      <div className="dir-header">
        <h3>People Directory</h3>
        <p className="section-description">
          Unified contact directory — SAL/PAL approvers, team leads, and other contacts.
          SAL/PAL entries auto-populate new deals.
        </p>
      </div>

      <div className="dir-toolbar">
        <div className="dir-filters">
          {ROLE_FILTERS.map(f => (
            <button
              key={f.id}
              className={`filter-chip ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {f.id !== 'all' && (
                <span className="filter-chip-count">
                  {f.id === 'other'
                    ? (contacts || []).filter(c => c.role !== 'SAL' && c.role !== 'PAL').length
                    : (contacts || []).filter(c => c.role === f.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="dir-actions">
          <input
            type="text"
            className="dir-search"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add Person'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="dir-add-form">
          <div className="dir-form-grid">
            <FormField label="Name" required>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </FormField>
            <FormField label="Email">
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@ibm.com" />
            </FormField>
            <FormField label="Role">
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="">Select role...</option>
                <option value="SAL">SAL</option>
                <option value="PAL">PAL</option>
                <option value="SLDL">Service Line Delivery Lead</option>
                <option value="Deal Manager">Deal Manager</option>
                <option value="Program Manager">Program Manager</option>
                <option value="Compliance Officer">Compliance Officer</option>
                <option value="Other">Other</option>
              </select>
            </FormField>
            <FormField label="Service Area">
              <input type="text" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} placeholder="e.g. RTR, OTC" />
            </FormField>
            <FormField label="Company">
              <input type="text" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company" />
            </FormField>
            <FormField label="Phone">
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
            </FormField>
            <FormField label="Slack">
              <input type="text" value={form.slack} onChange={e => setForm({ ...form, slack: e.target.value })} placeholder="@username" />
            </FormField>
            <FormField label="Notes">
              <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes" />
            </FormField>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!form.name.trim()}>Save</button>
        </div>
      )}

      <div className="dir-count">{filtered.length} of {(contacts || []).length} people</div>

      <div className="dir-grid">
        {filtered.map(c => (
          <div key={c.id} className={`dir-card ${c.approver_key ? 'is-approver' : ''}`}>
            {editingId === c.id ? (
              <div className="dir-card-edit">
                <div className="dir-form-grid compact">
                  <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
                  <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} placeholder="Email" />
                  <input type="text" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Phone" />
                  <input type="text" value={editForm.slack} onChange={e => setEditForm({ ...editForm, slack: e.target.value })} placeholder="Slack" />
                </div>
                <div className="dir-card-edit-actions">
                  <button className="btn btn-primary btn-xs" onClick={() => saveEdit(c.id)}>Save</button>
                  <button className="btn btn-secondary btn-xs" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="dir-card-top">
                  <div className="dir-card-identity">
                    <div className="dir-avatar" data-role={c.role}>{(c.name || '?')[0].toUpperCase()}</div>
                    <div className="dir-card-info">
                      <span className="dir-card-name">{c.name}</span>
                      <span className="dir-card-meta">
                        {c.role && <span className={`dir-role-badge ${(c.role || '').toLowerCase()}`}>{c.role}</span>}
                        {c.area && <span className="dir-card-area">{c.area}</span>}
                      </span>
                    </div>
                  </div>
                  <div className="dir-card-actions">
                    {savedId === c.id && <span className="save-confirmation">✓</span>}
                    <button className="btn-icon" onClick={() => startEdit(c)} title="Edit">✎</button>
                    <button className="btn-icon btn-danger-icon" onClick={() => onDelete(c.id)} title="Remove">×</button>
                  </div>
                </div>
                <div className="dir-card-body">
                  {c.email && <a href={`mailto:${c.email}`} className="dir-detail link">{c.email}</a>}
                  {c.phone && <span className="dir-detail">{c.phone}</span>}
                  {c.slack && <span className="dir-detail">Slack: {c.slack}</span>}
                  {c.company && <span className="dir-detail">{c.company}</span>}
                  {c.notes && <span className="dir-detail muted">{c.notes}</span>}
                </div>
              </>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="dir-empty">No matching contacts</div>
        )}
      </div>
    </div>
  )
}
