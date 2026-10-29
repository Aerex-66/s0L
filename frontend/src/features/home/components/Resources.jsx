import { useMemo } from 'react'
import { formatCurrency } from '../../../shared/utils/financialsHelpers'
import { UsersIcon } from '../../../shared/ui/Icons'

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function sortMonthKeys(keys) {
  return [...keys].sort((a, b) => {
    const [mA, yA] = a.split('-')
    const [mB, yB] = b.split('-')
    const ya = parseInt(yA, 10) || 0, yb = parseInt(yB, 10) || 0
    if (ya !== yb) return ya - yb
    return MONTH_ORDER.indexOf(mA) - MONTH_ORDER.indexOf(mB)
  })
}

function DistBar({ label, count, max }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="res-dist-row">
      <span className="res-dist-label">{label}</span>
      <div className="res-dist-bar-track">
        <div className="res-dist-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="res-dist-count">{count}</span>
    </div>
  )
}

const BOARD_STAFFING = [
  ['staffing_full', 'Deal staffing full'],
  ['staffing_bp', 'B&P'],
  ['staffing_asset', 'Asset'],
  ['staffing_associates', 'Associates'],
  ['staffing_total_band', 'Total band'],
  ['staffing_center_mix', 'Center mix'],
]

/** The staffing status columns on the monday board; they track the ask, GSSM holds the plan. */
function BoardStaffing({ deal }) {
  if (!deal?.monday_item_id) return null
  return (
    <section className="ws-panel" aria-labelledby="res-board">
      <div className="ws-panel-head">
        <h3 className="ws-panel-title" id="res-board">Staffing on the board</h3>
        <span className="ws-panel-note">From the monday board</span>
      </div>
      <ul className="ws-rows">
        {BOARD_STAFFING.map(([key, label]) => {
          const value = String(deal[key] ?? '').trim()
          const open = !value || value.toUpperCase() === 'N/A'
          return (
            <li key={key} className="ws-row">
              <span className="ws-row-label">{label}</span>
              <span className={`ws-row-value${open ? ' is-empty' : ''}`}>{value || '\u2014'}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function Resources({ deal }) {
  const staffing = deal?.staffing

  const synced = staffing?.synced_at
  const syncLabel = synced ? `Synced ${new Date(synced).toLocaleString()}` : null

  const monthlyFte = staffing?.monthly_fte
  const fteKeys = useMemo(() => (monthlyFte ? sortMonthKeys(Object.keys(monthlyFte)) : []), [monthlyFte])

  if (!staffing || !staffing.total_headcount) {
    return (
      <div className="res-container">
        <div className="ws-empty">
          <span className="ws-empty-icon" aria-hidden="true"><UsersIcon size={22} strokeWidth={1.5} /></span>
          <h3 className="ws-empty-title">No staffing plan yet</h3>
          <p className="ws-empty-text">
            Headcount, hours, fees, the band and team mix and the monthly FTE come from the Staffing sheet of this deal&apos;s
            GSSM workbook. Open <strong>GSSM</strong> in the menu on the left and import the workbook to fill this tab.
          </p>
        </div>
        <div className="ws-grid">
          <BoardStaffing deal={deal} />
        </div>
      </div>
    )
  }

  const maxBand = Math.max(...Object.values(staffing.band_distribution || {}), 1)
  const maxTeam = Math.max(...Object.values(staffing.team_distribution || {}), 1)

  return (
    <div className="res-container">
      {/* Hero metrics */}
      <div className="res-hero">
        <div className="res-hero-metric">
          <span className="res-hero-label">Headcount</span>
          <span className="res-hero-value">{staffing.total_headcount}</span>
        </div>
        <div className="res-hero-metric">
          <span className="res-hero-label">Hours</span>
          <span className="res-hero-value">{staffing.total_hours?.toLocaleString()}</span>
        </div>
        <div className="res-hero-metric">
          <span className="res-hero-label">Fees</span>
          <span className="res-hero-value">{formatCurrency(staffing.total_fees)}</span>
        </div>
        <div className="res-hero-metric">
          <span className="res-hero-label">Labor Cost</span>
          <span className="res-hero-value">{formatCurrency(staffing.total_labor_cost)}</span>
        </div>
        {syncLabel && <span className="res-hero-sync">{syncLabel}</span>}
      </div>

      <div className="res-grid">
        {/* Band distribution */}
        {Object.keys(staffing.band_distribution || {}).length > 0 && (
          <section className="res-section">
            <h3>Band Distribution</h3>
            <div className="res-dist">
              {Object.entries(staffing.band_distribution)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([band, count]) => (
                  <DistBar key={band} label={band} count={count} max={maxBand} />
              ))}
            </div>
          </section>
        )}

        {/* Team distribution */}
        {Object.keys(staffing.team_distribution || {}).length > 0 && (
          <section className="res-section">
            <h3>Team Distribution</h3>
            <div className="res-dist">
              {Object.entries(staffing.team_distribution)
                .sort(([,a], [,b]) => b - a)
                .map(([team, count]) => (
                  <DistBar key={team} label={team} count={count} max={maxTeam} />
              ))}
            </div>
          </section>
        )}

        {/* Location split */}
        {Object.keys(staffing.location_distribution || {}).length > 0 && (
          <section className="res-section">
            <h3>Location Split</h3>
            <div className="res-location-pills">
              {Object.entries(staffing.location_distribution)
                .sort(([,a], [,b]) => b - a)
                .map(([loc, count]) => (
                  <span key={loc} className="res-location-pill">
                    {loc} <strong>{count}</strong>
                  </span>
              ))}
            </div>
          </section>
        )}

        {/* Monthly FTE */}
        {fteKeys.length > 0 && (
          <section className="res-section res-section--wide">
            <h3>Monthly FTE</h3>
            <div className="res-fte-grid">
              {fteKeys.map(label => (
                <div key={label} className="res-fte-cell">
                  <span className="res-fte-month">{label}</span>
                  <span className="res-fte-value">{staffing.monthly_fte[label]}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <BoardStaffing deal={deal} />
      </div>
    </div>
  )
}
