import { useMemo, useState } from 'react'
import { FIELD_INDEX, isEditable, readPath } from '../../shared/constants/fieldIndex'
import { DownloadIcon } from '../../shared/ui/Icons'
import './AdminModule.css'

const OWNERS = [
  { id: 'monday', label: 'monday', about: 'Comes from the monday board. Read-only here once the deal is linked to a board row: change it on the board.' },
  { id: 'salesforce', label: 'Salesforce', about: 'Comes from IBM Sales Cloud and is read-only. A value Salesforce leaves blank never overwrites one.' },
  { id: 'gssm', label: 'GSSM', about: "Comes from the deal's GSSM workbook and is read-only here: change the workbook." },
  { id: 'deal', label: 's0L', about: 'Entered in s0L: Home, Deal details and the setup wizard.' },
  { id: 'isbd', label: 'iSBD', about: 'Entered in the iSBD editor; it lives only in the deck.' },
  { id: 'derived', label: 'Computed', about: 'Worked out from other fields when shown; never stored.' },
  { id: 'system', label: 'System', about: 'Set by s0L itself.' },
]
const OWNER_LABEL = Object.fromEntries(OWNERS.map((o) => [o.id, o.label]))

const SALESFORCE_LOOKUP = {
  found: 'Found',
  not_returned: 'Not found in Salesforce',
  not_an_id: "The board's number isn't a Salesforce ID",
  two_ids: 'The board names two opportunities',
}

const isBlank = (value) => value == null || value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)

function sectionName(section) {
  return String(section)
    .split('_')
    .map((word, i) => ({ isbd: 'iSBD', gssm: 'GSSM', tda: 'TDA' }[word] || (i === 0 ? word[0].toUpperCase() + word.slice(1) : word)))
    .join(' ')
}

function shownValue(value) {
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  if (typeof value === 'object') return `${Object.keys(value).length} entr${Object.keys(value).length === 1 ? 'y' : 'ies'}`
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function stamp(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

/** The deal record itself: where every value comes from, who may change it, and its links to the outside. */
export default function AdminModule({ deal }) {
  const [owner, setOwner] = useState('all')
  const [query, setQuery] = useState('')
  const [showEmpty, setShowEmpty] = useState(false)

  const fields = useMemo(() => Object.entries(FIELD_INDEX).map(([key, entry]) => {
    const value = entry.owner === 'derived' ? undefined : readPath(deal, key)
    return {
      key,
      label: entry.label,
      section: sectionName(entry.section),
      owner: entry.owner,
      value,
      filled: entry.owner !== 'derived' && !isBlank(value),
      editable: entry.owner === 'derived' || entry.owner === 'system' ? null : isEditable(key, deal),
    }
  }), [deal])

  const stored = fields.filter((f) => f.owner !== 'derived')
  const filledBy = (id) => stored.filter((f) => f.owner === id && f.filled).length
  const filled = stored.filter((f) => f.filled).length

  const needle = query.trim().toLowerCase()
  const visible = fields.filter((f) =>
    (owner === 'all' || f.owner === owner) &&
    (showEmpty || f.filled) &&
    (!needle || `${f.label} ${f.key} ${f.section} ${f.filled ? shownValue(f.value) : ''}`.toLowerCase().includes(needle)))

  const downloadRecord = () => {
    const blob = new Blob([JSON.stringify(deal, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `s0L-deal-${deal.opportunity_number || deal.id}.json`.replace(/[^\w.-]+/g, '_')
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const links = [
    ['Deal ID', deal.id, true],
    ['Created in s0L', stamp(deal.created_date)],
    ['monday row', deal.monday_item_id, true, deal.monday_group ? `Group: ${deal.monday_group}` : null],
    ['Last monday sync', stamp(deal.monday_synced_at), false, deal.monday_missing_since ? `Left the board ${stamp(deal.monday_missing_since)}` : null],
    ['Salesforce opportunity', deal.salesforce_id, true, SALESFORCE_LOOKUP[deal.salesforce_lookup] || (deal.salesforce_checked_at ? null : 'Not checked yet')],
    ['Last Salesforce check', stamp(deal.salesforce_checked_at)],
    ['GSSM workbook', deal.gssm_workbook_id, true],
    ['Last GSSM sync', stamp(deal.gssm_synced_at)],
  ]

  return (
    <div className="ws-page admin-module">
      <div className="ws-page-head">
        <h2 className="ws-page-title">Admin</h2>
        <span className="ws-page-note">This deal&apos;s record: where each value comes from and who may change it</span>
        <div className="ws-page-actions">
          <button type="button" className="cmd-btn" onClick={downloadRecord}>
            <DownloadIcon size={13} /> Download the record
          </button>
        </div>
      </div>

      <div className="ws-kpis">
        <div className="ws-kpi">
          <span className="ws-kpi-label">Filled</span>
          <span className="ws-kpi-value">{filled}/{stored.length}</span>
          <span className="ws-kpi-sub">{Math.round((filled / Math.max(1, stored.length)) * 100)}% of the stored fields</span>
        </div>
        {[
          ['monday', deal.monday_item_id ? 'Linked to a board row' : 'Not on the board'],
          ['salesforce', SALESFORCE_LOOKUP[deal.salesforce_lookup] || 'Not checked yet'],
          ['gssm', deal.gssm_workbook_id || deal.gssm_synced_at ? 'Workbook linked' : 'No workbook yet'],
          ['deal', 'Entered in s0L'],
        ].map(([id, sub]) => (
          <button
            key={id}
            type="button"
            className={`ws-kpi admin-kpi${owner === id ? ' is-active' : ''}`}
            onClick={() => setOwner(owner === id ? 'all' : id)}
            aria-pressed={owner === id}
          >
            <span className="ws-kpi-label">From {OWNER_LABEL[id]}</span>
            <span className="ws-kpi-value">{filledBy(id)}</span>
            <span className="ws-kpi-sub">{sub}</span>
          </button>
        ))}
      </div>

      <div className="ws-split">
        <section className="ws-panel" aria-labelledby="admin-fields">
          <div className="ws-panel-head">
            <h3 className="ws-panel-title" id="admin-fields">Fields</h3>
            <span className="ws-panel-note">{visible.length} shown</span>
          </div>
          <div className="toolbar-strip admin-toolbar">
            <div className="toolbar-strip-group" role="group" aria-label="Who owns the field">
              <span className="toolbar-strip-label">Owner</span>
              {[{ id: 'all', label: 'All' }, ...OWNERS].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`chip chip--interactive${owner === o.id ? ' chip--active' : ''}`}
                  aria-pressed={owner === o.id}
                  onClick={() => setOwner(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="toolbar-strip-group">
              <label className="admin-toggle">
                <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
                Show empty fields
              </label>
              <input
                className="admin-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a field…"
                aria-label="Find a field"
              />
            </div>
          </div>

          {visible.length ? (
            <div className="ws-table-wrap admin-table-wrap">
              <table className="ws-table admin-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Section</th>
                    <th>Owner</th>
                    <th>Change here</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((f) => (
                    <tr key={f.key}>
                      <td className="is-strong" title={f.key}>{f.label}</td>
                      <td>{f.section}</td>
                      <td><span className={`ws-tag admin-owner admin-owner--${f.owner}`}>{OWNER_LABEL[f.owner] || f.owner}</span></td>
                      <td className={f.editable ? undefined : 'admin-muted'}>{f.editable == null ? '—' : f.editable ? 'Yes' : 'Read-only'}</td>
                      <td className={f.filled ? 'admin-value' : 'admin-muted'} title={f.filled ? shownValue(f.value) : undefined}>
                        {f.owner === 'derived' ? 'Computed when shown' : f.filled ? shownValue(f.value) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ws-empty-text">No field matches. Try another owner, or show the empty fields.</p>
          )}
        </section>

        <div className="ws-stack">
          <section className="ws-panel" aria-labelledby="admin-links">
            <div className="ws-panel-head">
              <h3 className="ws-panel-title" id="admin-links">Links</h3>
            </div>
            <ul className="ws-rows">
              {links.map(([label, value, mono, sub]) => (
                <li key={label} className="ws-row">
                  <span className="ws-row-label">{label}</span>
                  <span className={`ws-row-value${value ? '' : ' is-empty'}`}>
                    {value ? <span className={mono ? 'ws-mono' : undefined}>{value}</span> : '—'}
                    {sub && <span className="ws-row-sub">{sub}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="ws-panel" aria-labelledby="admin-owners">
            <div className="ws-panel-head">
              <h3 className="ws-panel-title" id="admin-owners">Who owns what</h3>
              <span className="ws-panel-note">One owner per field, so no two screens disagree</span>
            </div>
            <dl className="admin-owners">
              {OWNERS.map((o) => (
                <div key={o.id} className="admin-owners-row">
                  <dt><span className={`ws-tag admin-owner admin-owner--${o.id}`}>{o.label}</span></dt>
                  <dd>{o.about}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
