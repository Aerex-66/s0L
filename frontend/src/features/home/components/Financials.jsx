import { useEffect, useRef, useState } from 'react'
import { dealService } from '../../../shared/services/dealService'
import { formatCompactCurrency, formatCurrency } from '../../../shared/utils/financialsHelpers'
import { formatCompactMillions, formatShortDateWithYear } from '../../../shared/utils/formatters'
import { VOCABULARIES } from '../../../shared/constants/fieldIndex'
import { DollarSign } from 'lucide-react'
import { financialRows } from '../financialRows'

/*
 * GSSM owns every number here except the GP target: values arrive through the
 * GSSM sync and are shown read-only. Change them in the GSSM module.
 */
const SECTIONS = [
  { title: 'Financial Report', keys: ['tcv', 'services_revenue', 'labor_cost', 'pmr_cost', 'tvm_cost', 'total_cost', 'gp_amount', 'gp_percent', 'rev_app_percent', 'rev_app', 'pti', 'pti_percent'] },
  { title: 'PTI Assumptions', keys: ['contract_holder', 'risk_rating', 'days_to_pay', 'desired_pti_percent', 'cola_clause', 'gbs_bid_type', 'total_contingency'] },
  { title: 'Commercial Policy', keys: ['contract_type', 'price_type', 'consider_non_labor', 'pre_approved_rates'] },
]

function display(row) {
  if (row.value === '' || row.value == null) return '\u2014'
  if (row.type === 'currency') return formatCurrency(row.value)
  if (row.type === 'percent') return `${row.value}%`
  if (row.key === 'risk_rating') {
    const label = VOCABULARIES.risk_rating_label[String(row.value)]
    return label ? `${row.value} \u00b7 ${label}` : String(row.value)
  }
  return String(row.value)
}

function SourceChip({ state, syncedAt }) {
  if (state === 'linked') {
    return <span className="chip fin-sync-badge">{`From GSSM${syncedAt ? ` · synced ${new Date(syncedAt).toLocaleString()}` : ''}`}</span>
  }
  if (state === 'pre_gssm') {
    return <span className="chip fin-sync-badge">{'Entered before GSSM was linked · replaced on first sync'}</span>
  }
  return null
}

/** What the monday board and Salesforce say about the money, whether or not a workbook is linked. */
function CommercialPanel({ deal }) {
  const rows = [
    ['TCV on the board', formatCompactMillions(deal.estimated_value) !== '—' ? formatCompactMillions(deal.estimated_value) : null, deal.currency],
    ['Close quarter', deal.close_quarter],
    ['Call / upside', deal.forecast_category],
    ['Sales stage', deal.sales_stage],
  ]
  if (deal.salesforce_lookup === 'found') {
    rows.push(
      ['Salesforce amount', deal.sf_amount ? formatCurrency(deal.sf_amount) : null, deal.sf_currency],
      ['Salesforce stage', deal.sf_stage],
      ['Salesforce forecast', deal.sf_forecast_category],
      ['Salesforce close date', formatShortDateWithYear(deal.sf_close_date)],
    )
  }
  return (
    <section className="ws-panel" aria-labelledby="fin-commercial">
      <div className="ws-panel-head">
        <h3 className="ws-panel-title" id="fin-commercial">Commercial</h3>
        <span className="ws-panel-note">{deal.salesforce_lookup === 'found' ? 'From the monday board and Salesforce' : 'From the monday board'}</span>
      </div>
      <ul className="ws-rows">
        {rows.map(([label, value, sub]) => (
          <li key={label} className="ws-row">
            <span className="ws-row-label">{label}</span>
            <span className={`ws-row-value${value ? '' : ' is-empty'}`}>
              {value || '—'}
              {value && sub && <span className="ws-row-sub">{sub}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Financials({ deal, onUpdate }) {
  const { state, rows } = financialRows(deal)
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]))
  const target = byKey.service_line_target
  const [targetDraft, setTargetDraft] = useState(target.value ?? '')
  const debounceRef = useRef(null)

  useEffect(() => { setTargetDraft(target.value ?? '') }, [target.value])
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const saveTarget = (value) => {
    setTargetDraft(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        await dealService.updateFinancials(deal.id, { service_line_target: value })
        onUpdate?.()
      } catch (e) { console.error('GP target save error:', e) }
    }, 800)
  }

  const gp = parseFloat(byKey.gp_percent.value)
  const gpBelow = Number.isFinite(gp) && gp < parseFloat(targetDraft)
  const hero = [
    { label: 'Revenue', value: formatCompactCurrency(byKey.services_revenue.value) },
    { label: 'Total Cost', value: formatCompactCurrency(byKey.total_cost.value) },
    { label: 'GP %', value: byKey.gp_percent.value ? `${byKey.gp_percent.value}%` : '', tone: gpBelow ? 'danger' : 'success' },
    { label: 'GP $', value: formatCompactCurrency(byKey.gp_amount.value) },
    { label: 'PTI %', value: byKey.pti_percent.value ? `${byKey.pti_percent.value}%` : '', tone: 'accent' },
  ]

  return (
    <div className="fin-container">
      <SourceChip state={state} syncedAt={deal.gssm_synced_at} />

      {state === 'unlinked' ? (
        <div className="ws-empty">
          <span className="ws-empty-icon" aria-hidden="true"><DollarSign size={22} strokeWidth={1.5} /></span>
          <h3 className="ws-empty-title">No GSSM numbers yet</h3>
          <p className="ws-empty-text">
            Revenue, cost, GP and PTI come from this deal&apos;s GSSM workbook. Open <strong>GSSM</strong> in the menu on the
            left and import the workbook: the numbers appear here as soon as it syncs, read-only, so Home and GSSM never disagree.
          </p>
        </div>
      ) : (
        <>
          <div className="fin-hero">
            {hero.map(({ label, value, tone }) => (
              <div key={label} className="fin-hero-metric">
                <span className="fin-hero-label">{label}</span>
                <span className={`fin-hero-value${tone === 'accent' ? ' fin-hero-value--accent' : tone ? ` ${tone}` : ''}`}>{value || '\u2014'}</span>
              </div>
            ))}
          </div>

          <div className="fin-grid">
            {SECTIONS.map(({ title, keys }) => (
              <section key={title} className="fin-section">
                <h3>{title}</h3>
                <div className="fin-report-table">
                  {keys.map((key) => (
                    <div key={key} className="fin-report-row">
                      <span className="fin-report-label">{byKey[key].label}</span>
                      <span className="fin-report-display">{display(byKey[key])}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      <div className="ws-grid fin-board">
        <CommercialPanel deal={deal} />
        <section className="ws-panel" aria-labelledby="fin-target">
          <div className="ws-panel-head">
            <h3 className="ws-panel-title" id="fin-target">Target</h3>
            <span className="ws-panel-note">A GP % under this target shows in red</span>
          </div>
          <label className="fin-field fin-target">
            <span>{target.label}</span>
            <span className="fin-target-input">
              <input type="number" inputMode="decimal" value={targetDraft} onChange={(e) => saveTarget(e.target.value)} placeholder="e.g. 32" />
              <i aria-hidden="true">%</i>
            </span>
          </label>
        </section>
      </div>
    </div>
  )
}
