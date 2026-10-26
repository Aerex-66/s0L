import { useEffect, useRef, useState } from 'react'
import { dealService } from '../../../shared/services/dealService'
import { formatCompactCurrency, formatCurrency } from '../../../shared/utils/financialsHelpers'
import { VOCABULARIES } from '../../../shared/constants/fieldIndex'
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
        <section className="fin-section">
          <h3>No GSSM numbers yet</h3>
          <p>Open this deal&apos;s workbook in the GSSM module. Revenue, cost, GP and PTI appear here automatically once it syncs.</p>
        </section>
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

      <section className="fin-section">
        <h3>Target</h3>
        <div className="fin-fields">
          <label className="fin-field">
            <span>{target.label}</span>
            <input type="number" value={targetDraft} onChange={(e) => saveTarget(e.target.value)} placeholder="%" />
          </label>
        </div>
      </section>
    </div>
  )
}
