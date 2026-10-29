import { useMemo } from 'react'
import useStore from '../../../shared/useStore'
import { isDoneStatus } from '../../../shared/constants/uiStates'
import { getField, readPath } from '../../../shared/constants/fieldIndex'
import { requiredApprovals } from '../../../shared/utils/approvals'
import { formatShortDateWithYear } from '../../../shared/utils/formatters'
import { webLink } from '../../../shared/utils/webLink'
import { EditIcon, ExternalLinkIcon } from '../../../shared/ui/Icons'
import { daysBetween, toLocalDate } from '../dates'
import ReviewForms from './ReviewForms'

const OPEN_SEATS = new Set(['', 'tbd', 'n/a', 'na', 'none', '-', '—'])
const LINK_KEYS = ['onedrive_url', 'greenstar_url', 'greenstar_dca_link', 'gpe_url', 'gssm_url', 'rbk_url', 'dca_url', 'swb_url', 'adtd_url', 'tiger_url']
const KEY_DATES = [
  ['rfp_submission_date', 'RFP submission'],
  ['decision_date', 'Decision'],
  ['project_start_date', 'Project start'],
  ['sf_close_date', 'Salesforce close'],
  ['project_end_date', 'Project end'],
]

const SALESFORCE_LOOKUP = {
  not_returned: "The board's opportunity number wasn't found in Salesforce",
  not_an_id: "The board's opportunity number isn't a Salesforce ID",
  two_ids: 'The board names two opportunities',
}

const isOpen = (value) => OPEN_SEATS.has(String(value ?? '').trim().toLowerCase())
const shown = (value) => (value == null || String(value).trim() === '' ? null : String(value))
const date = (value) => formatShortDateWithYear(value)
const stamp = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

/** The soonest key date that hasn't passed yet. */
function nextDate(deal) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return KEY_DATES
    .map(([key, label]) => ({ label, value: deal[key], day: toLocalDate(deal[key]) }))
    .filter((d) => d.day && d.day >= today)
    .sort((a, b) => a.day - b.day)[0] || null
}

function initials(name) {
  return String(name).split(/[\s.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function Fact({ label, value }) {
  const text = shown(value)
  return (
    <div className="ws-fact">
      <dt>{label}</dt>
      <dd className={text ? undefined : 'is-empty'}>{text || '—'}</dd>
    </div>
  )
}

function Row({ label, value, sub, warning = false }) {
  return (
    <li className="ws-row">
      <span className="ws-row-label">{label}</span>
      <span className={`ws-row-value${value ? '' : ' is-empty'}${warning ? ' is-warning' : ''}`}>
        {value || '—'}
        {sub && <span className={`ws-row-sub${warning ? ' is-warning' : ''}`}>{sub}</span>}
      </span>
    </li>
  )
}

function Person({ role, name }) {
  const open = isOpen(name)
  return (
    <li className={`ws-person${open ? ' is-open' : ''}`}>
      <span className="ws-initials" aria-hidden="true">{open ? '?' : initials(name)}</span>
      <span>
        <span className="ws-person-name">{open ? 'Not assigned yet' : name}</span>
        <span className="ws-person-role">{role}</span>
      </span>
    </li>
  )
}

function projectSpan(deal) {
  const start = date(deal.project_start_date)
  const end = date(deal.project_end_date)
  if (!start && !end) return { value: null }
  const days = start && end ? daysBetween(deal.project_start_date, deal.project_end_date) : null
  const weeks = days != null ? Math.max(1, Math.round(days / 7)) : null
  return { value: `${start || '?'} → ${end || '?'}`, sub: weeks ? `${weeks} week${weeks === 1 ? '' : 's'}` : null }
}

function sources(deal) {
  const rows = []
  if (deal.monday_item_id) {
    const left = date(deal.monday_missing_since)
    rows.push(left
      ? { label: 'monday', value: 'Left the board', sub: `Missing since ${left}`, warning: true }
      : { label: 'monday', value: 'Linked', sub: stamp(deal.monday_synced_at) ? `Synced ${stamp(deal.monday_synced_at)}` : null })
  } else {
    rows.push({ label: 'monday', value: 'Not on the board' })
  }
  if (deal.salesforce_lookup === 'found') {
    rows.push({ label: 'Salesforce', value: 'Found', sub: stamp(deal.salesforce_checked_at) ? `Checked ${stamp(deal.salesforce_checked_at)}` : null })
  } else if (SALESFORCE_LOOKUP[deal.salesforce_lookup]) {
    rows.push({ label: 'Salesforce', value: 'Not matched', sub: SALESFORCE_LOOKUP[deal.salesforce_lookup], warning: true })
  } else {
    rows.push({ label: 'Salesforce', value: 'Not checked yet' })
  }
  rows.push(deal.gssm_workbook_id || deal.gssm_synced_at
    ? { label: 'GSSM', value: 'Workbook linked', sub: stamp(deal.gssm_synced_at) ? `Synced ${stamp(deal.gssm_synced_at)}` : null }
    : { label: 'GSSM', value: 'No workbook yet' })
  const docs = (deal.documents || []).length
  rows.push({ label: 'Documents', value: docs ? `${docs} uploaded` : 'None uploaded yet' })
  return rows
}

/** The deal at a glance: what the board, Salesforce and s0L know, and what's still open. */
export default function Overview({ deal, onOpenTab }) {
  const openDealDetails = useStore((s) => s.setShowDealDetails)

  const span = projectSpan(deal)
  const next = nextDate(deal)
  const nextIn = next ? daysBetween(new Date(), next.value) : null

  const approvals = useMemo(() => {
    const all = requiredApprovals(deal.activities).filter((a) => a.status !== 'N/A')
    const done = all.filter((a) => isDoneStatus(a.status)).length
    const blocked = all.filter((a) => a.status === 'Blocked').length
    const started = all.filter((a) => a.status === 'In Progress').length
    return { total: all.length, done, blocked, started, waiting: all.length - done - blocked - started }
  }, [deal.activities])

  const links = LINK_KEYS
    .map((key) => ({ key, label: getField(key)?.label || key, href: webLink(readPath(deal, key)) }))
    .filter((link) => link.href)

  const people = [
    ['Lead SSC', deal.lead_ssc],
    ['TT Executive', deal.tt_executive],
    ['Solution consultant 2', deal.solution_consultant_2],
    ['Solution consultant 3', deal.solution_consultant_3],
    ['Solution consultant 4', deal.solution_consultant_4],
  ]
  if (shown(deal.opportunity_owner)) people.push(['Opportunity owner', deal.opportunity_owner])
  const alsoOnBoard = [deal.monday_people, deal.monday_people_1].map(shown).filter(Boolean).join(', ')

  return (
    <div className="ov">
      <div className="ws-kpis">
        <div className="ws-kpi">
          <span className="ws-kpi-label">Close quarter</span>
          <span className={`ws-kpi-value${deal.close_quarter ? '' : ' is-empty'}`}>{deal.close_quarter || 'Not set'}</span>
          <span className="ws-kpi-sub">{deal.forecast_category ? `Call / upside: ${deal.forecast_category}` : 'No call or upside yet'}</span>
        </div>
        <div className="ws-kpi">
          <span className="ws-kpi-label">Sales stage</span>
          <span className={`ws-kpi-value${deal.sales_stage ? '' : ' is-empty'}`}>{deal.sales_stage || 'Not set'}</span>
          <span className="ws-kpi-sub">{deal.swb_stage ? `SWB: ${deal.swb_stage}` : 'No SWB level yet'}</span>
        </div>
        <div className="ws-kpi">
          <span className="ws-kpi-label">Approvals</span>
          <span className={`ws-kpi-value${approvals.total ? '' : ' is-empty'}`}>{approvals.total ? `${approvals.done}/${approvals.total}` : 'None yet'}</span>
          <span className="ws-kpi-sub">
            {approvals.total ? `${Math.round((approvals.done / approvals.total) * 100)}% approved${approvals.blocked ? ` · ${approvals.blocked} blocked` : ''}` : 'Set up in the Approvals tab'}
          </span>
        </div>
        <div className="ws-kpi">
          <span className="ws-kpi-label">Next date</span>
          <span className={`ws-kpi-value${next ? '' : ' is-empty'}`}>{next ? date(next.value) : 'Nothing ahead'}</span>
          <span className="ws-kpi-sub">
            {next ? `${next.label} · ${nextIn === 0 ? 'today' : `in ${nextIn} day${nextIn === 1 ? '' : 's'}`}` : 'No upcoming date on the record'}
          </span>
        </div>
      </div>

      <div className="ws-split">
        <div className="ws-stack">
          <section className="ws-panel" aria-labelledby="ov-deal">
            <div className="ws-panel-head">
              <h3 className="ws-panel-title" id="ov-deal">Profile</h3>
              <button type="button" className="cmd-btn ws-panel-action" onClick={() => openDealDetails(true)}>
                <EditIcon size={13} /> Edit details
              </button>
            </div>
            <dl className="ws-facts">
              <Fact label="Deal type" value={deal.deal_type} />
              <Fact label="Sector" value={deal.sector} />
              <Fact label="Industry" value={deal.industry} />
              <Fact label="Market" value={deal.market} />
              <Fact label="Lead service line" value={deal.lead_sl} />
              <Fact label="Currency" value={deal.currency} />
            </dl>
          </section>

          {shown(deal.solutioning_pov) && (
            <section className="ws-panel" aria-labelledby="ov-pov">
              <div className="ws-panel-head">
                <h3 className="ws-panel-title" id="ov-pov">Solutioning POV</h3>
                <span className="ws-panel-note">From the monday board</span>
              </div>
              <p className="ws-prose">{deal.solutioning_pov}</p>
            </section>
          )}

          <section className="ws-panel ov-approvals" aria-labelledby="ov-approvals">
            <div className="ws-panel-head">
              <h3 className="ws-panel-title" id="ov-approvals">Approvals</h3>
              <span className="ws-panel-note">{(deal.contacts || []).length} contacts on this deal</span>
              <button type="button" className="cmd-btn ws-panel-action" onClick={() => onOpenTab?.('activities')}>Open approvals</button>
            </div>
            {approvals.total ? (
              <>
                <div className="ov-approvals-total">
                  <strong>{approvals.done}/{approvals.total}</strong> approved
                </div>
                <div className="ws-bar" aria-hidden="true">
                  <i style={{ width: `${Math.round((approvals.done / approvals.total) * 100)}%`, '--bar-c': 'var(--status-success)' }} />
                </div>
                <ul className="ws-meters">
                  {[
                    ['Waiting', approvals.waiting, 'var(--status-gray)'],
                    ['In progress', approvals.started, 'var(--accent)'],
                    ['Blocked', approvals.blocked, 'var(--status-error)'],
                    ['Approved', approvals.done, 'var(--status-success)'],
                  ].map(([label, count, color]) => (
                    <li key={label} className="ws-meter">
                      <span className="ws-meter-name"><i className="deal-status-dot" style={{ '--status-c': color }} aria-hidden="true" />{label}</span>
                      <span className="ws-bar" aria-hidden="true"><i style={{ width: `${Math.round((count / approvals.total) * 100)}%`, '--bar-c': color }} /></span>
                      <span className="ws-meter-count">{count}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="ws-empty-text">No approvals on this deal. Configure the service areas in the Approvals tab.</p>
            )}
          </section>

          <ReviewForms deal={deal} />
        </div>

        <div className="ws-stack">
          <section className="ws-panel" aria-labelledby="ov-team">
            <div className="ws-panel-head">
              <h3 className="ws-panel-title" id="ov-team">Team</h3>
              {deal.monday_item_id && <span className="ws-panel-note">From the monday board</span>}
            </div>
            <ul className="ws-people">
              {people.map(([role, name]) => <Person key={role} role={role} name={name} />)}
            </ul>
            {alsoOnBoard && <p className="ov-also">Also on the board row: {alsoOnBoard}</p>}
          </section>

          <section className="ws-panel" aria-labelledby="ov-dates">
            <div className="ws-panel-head">
              <h3 className="ws-panel-title" id="ov-dates">Dates</h3>
            </div>
            <ul className="ws-rows">
              <Row label="Project" value={span.value} sub={span.sub} />
              <Row label="RFP submission" value={date(deal.rfp_submission_date)} />
              <Row label="Decision" value={date(deal.decision_date)} />
              {deal.sf_close_date && <Row label="Salesforce close date" value={date(deal.sf_close_date)} />}
              <Row label="Added to the board" value={date(deal.monday_created_at)} />
              <Row label="Status changed" value={date(deal.status_changed_at)} />
            </ul>
          </section>

          <section className="ws-panel" aria-labelledby="ov-sources">
            <div className="ws-panel-head">
              <h3 className="ws-panel-title" id="ov-sources">Where this deal comes from</h3>
            </div>
            <ul className="ws-rows">
              {sources(deal).map((row) => <Row key={row.label} {...row} />)}
            </ul>
          </section>

          {links.length > 0 && (
            <section className="ws-panel" aria-labelledby="ov-links">
              <div className="ws-panel-head">
                <h3 className="ws-panel-title" id="ov-links">Links</h3>
              </div>
              <div className="ws-links">
                {links.map((link) => (
                  <a key={link.key} className="ws-link" href={link.href} target="_blank" rel="noopener noreferrer">
                    <ExternalLinkIcon size={12} /> {link.label}
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
