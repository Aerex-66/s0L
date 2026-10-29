import { useMemo, useState } from 'react'
import useStore from '../../shared/useStore'
import useDealStore from '../../shared/dealStore'
import { dealStatusColor, isDoneStatus } from '../../shared/constants/uiStates'
import { formatCompactMillions, formatShortDateWithYear } from '../../shared/utils/formatters'
import { BarChart3 } from 'lucide-react'
import { outcomes, similarDeals, tcvOf, tcvStanding } from './similarity'
import './MetricsModule.css'

const FIRST_ROWS = 12
const DAY_MS = 86400000

function daysSince(value) {
  if (!value) return null
  const start = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(start.getTime()) ? null : Math.max(0, Math.round((Date.now() - start) / DAY_MS))
}

function ordinal(n) {
  const v = n % 100
  return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'}`
}

const share = (part, whole) => (whole > 0 ? Math.max(part > 0 ? 2 : 0, Math.round((part / whole) * 100)) : 0)
const days = (n) => `${n} day${n === 1 ? '' : 's'}`

function Kpi({ label, value, sub }) {
  return (
    <div className="ws-kpi">
      <span className="ws-kpi-label">{label}</span>
      <span className={`ws-kpi-value${value ? '' : ' is-empty'}`}>{value || '—'}</span>
      <span className="ws-kpi-sub">{sub}</span>
    </div>
  )
}

function Meters({ rows, whole }) {
  return (
    <ul className="ws-meters">
      {rows.map(({ label, value, display, color, strong }) => (
        <li key={label} className={`ws-meter${strong ? ' metrics-meter--this' : ''}`}>
          <span className="ws-meter-name">
            {color && <i className="deal-status-dot" style={{ '--status-c': color }} aria-hidden="true" />}
            {label}
          </span>
          <span className="ws-bar" aria-hidden="true"><i style={{ width: `${share(value, whole)}%`, '--bar-c': color || 'var(--text-tertiary)' }} /></span>
          <span className="ws-meter-count">{display ?? value}</span>
        </li>
      ))}
    </ul>
  )
}

/** How this deal compares with the deals like it, and how long it has been moving. */
export default function MetricsModule({ deal }) {
  const deals = useDealStore((s) => s.deals)
  const setCurrentDealId = useStore((s) => s.setCurrentDealId)
  const [showAll, setShowAll] = useState(false)

  const similar = useMemo(() => similarDeals(deal, deals), [deal, deals])
  const peers = useMemo(() => similar.map((s) => s.deal), [similar])
  const tcv = tcvOf(deal)
  const standing = useMemo(() => tcvStanding(tcv, peers), [tcv, peers])
  const results = useMemo(() => outcomes(peers), [peers])

  const activities = (deal.activities || []).filter((a) => a.status !== 'N/A')
  const approved = activities.filter((a) => isDoneStatus(a.status)).length
  const onBoard = daysSince(deal.monday_created_at || deal.created_date)
  const inStatus = daysSince(deal.status_changed_at)
  const decided = results.won + results.lost

  const sizeRows = standing ? [
    { label: 'This deal', value: tcv, display: tcv ? formatCompactMillions(tcv) : '—', color: 'var(--accent)', strong: true },
    { label: 'Median of similar deals', value: standing.median, display: formatCompactMillions(standing.median) },
    { label: 'Biggest similar deal', value: standing.biggest, display: formatCompactMillions(standing.biggest) },
    { label: 'Smallest similar deal', value: standing.smallest, display: formatCompactMillions(standing.smallest) },
  ] : []

  const outcomeRows = [
    { label: 'Won', value: results.won, color: 'var(--status-success)' },
    { label: 'Lost', value: results.lost, color: 'var(--status-error)' },
    { label: 'Submitted or closed', value: results.otherClosed, color: 'var(--accent)' },
    { label: 'Still open', value: results.open, color: 'var(--status-gray)' },
  ]

  const rows = showAll ? similar : similar.slice(0, FIRST_ROWS)
  const openDeal = (id) => setCurrentDealId(id)

  return (
    <div className="ws-page metrics-module">
      <div className="ws-page-head">
        <h2 className="ws-page-title">Metrics</h2>
        <span className="ws-page-note">
          {similar.length
            ? `Compared with ${similar.length} similar deal${similar.length === 1 ? '' : 's'}: the same practice, and the same implementation type or industry`
            : 'How this deal compares with deals like it'}
        </span>
      </div>

      <div className="ws-kpis">
        <Kpi
          label="TCV"
          value={tcv ? formatCompactMillions(tcv) : null}
          sub={standing?.rank ? `${ordinal(standing.rank)} biggest of ${standing.count + 1} like it` : 'Nothing to rank it against yet'}
        />
        <Kpi
          label="Similar deals won"
          value={results.winRate == null ? null : `${Math.round(results.winRate * 100)}%`}
          sub={decided ? `${results.won} won of ${decided} decided` : 'No similar deal decided yet'}
        />
        <Kpi
          label="On the board"
          value={onBoard == null ? null : days(onBoard)}
          sub={onBoard == null ? 'Not on the monday board' : `Since ${formatShortDateWithYear(deal.monday_created_at || deal.created_date)}`}
        />
        <Kpi
          label="In this status"
          value={inStatus == null ? null : days(inStatus)}
          sub={deal.status || 'No status'}
        />
        <Kpi
          label="Approvals"
          value={activities.length ? `${approved}/${activities.length}` : null}
          sub={activities.length ? `${Math.round((approved / activities.length) * 100)}% approved` : 'No approvals on this deal'}
        />
      </div>

      {similar.length === 0 ? (
        <div className="ws-empty">
          <span className="ws-empty-icon" aria-hidden="true"><BarChart3 size={22} strokeWidth={1.5} /></span>
          <h3 className="ws-empty-title">No similar deals yet</h3>
          <p className="ws-empty-text">
            Similar deals share this deal&apos;s practice and its implementation type or industry. Once the board has the
            implementation type or industry for this deal, its size and the outcomes of deals like it show here.
          </p>
        </div>
      ) : (
        <>
          <div className="ws-grid">
            <section className="ws-panel" aria-labelledby="metrics-size">
              <div className="ws-panel-head">
                <h3 className="ws-panel-title" id="metrics-size">Size</h3>
                <span className="ws-panel-note">TCV against {standing ? standing.count : 0} similar deals with one</span>
              </div>
              {standing
                ? <Meters rows={sizeRows} whole={Math.max(tcv, standing.biggest)} />
                : <p className="ws-empty-text">None of the similar deals has a TCV yet.</p>}
            </section>

            <section className="ws-panel" aria-labelledby="metrics-outcomes">
              <div className="ws-panel-head">
                <h3 className="ws-panel-title" id="metrics-outcomes">How similar deals went</h3>
                <span className="ws-panel-note">{peers.length} deals</span>
              </div>
              <Meters rows={outcomeRows} whole={peers.length} />
            </section>
          </div>

          <section className="ws-panel" aria-labelledby="metrics-similar">
            <div className="ws-panel-head">
              <h3 className="ws-panel-title" id="metrics-similar">Similar deals</h3>
              <span className="ws-panel-note">Click a deal to see its metrics</span>
            </div>
            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Implementation type</th>
                    <th className="is-num">TCV</th>
                    <th>Lead SSC</th>
                    <th>Why it&apos;s similar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ deal: other, reasons }) => (
                    <tr
                      key={other.id}
                      className="is-link"
                      tabIndex={0}
                      onClick={() => openDeal(other.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') openDeal(other.id) }}
                    >
                      <td className="is-strong">{other.client_name || '—'}</td>
                      <td title={other.project_name}>{other.project_name || '—'}</td>
                      <td>
                        <i className="deal-status-dot" style={{ '--status-c': dealStatusColor(other.status) }} aria-hidden="true" />
                        {other.status || 'No status'}
                      </td>
                      <td>{other.implementation_type || '—'}</td>
                      <td className="is-num">{tcvOf(other) ? formatCompactMillions(tcvOf(other)) : '—'}</td>
                      <td>{other.lead_ssc || '—'}</td>
                      <td>{reasons.map((reason) => <span key={reason} className="ws-tag">{reason}</span>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {similar.length > FIRST_ROWS && (
              <button type="button" className="cmd-btn ws-more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${similar.length}`}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  )
}
