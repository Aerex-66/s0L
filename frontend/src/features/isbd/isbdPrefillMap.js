/**
 * iSBD prefill — what each slide cell shows before the user types.
 * The field index decides where a value lives: deal and GSSM fields are read
 * from the deal record, derived fields are computed, iSBD-only content comes
 * from isbd_data (see useIsbdDocument). The template only says which keys a
 * slide shows and how to format them.
 */

import templateDef from './isbdSlideTemplate.json'
import { VOCABULARIES, getField, readPath } from '../../shared/constants/fieldIndex'
import { parseCurrency } from '../../shared/utils/financialsHelpers'

// ── helpers ─────────────────────────────────────────────────────────

/** Safely resolve a dot-path on an object.  '' returned for missing. */
const get = (obj, path) => {
  if (!obj || !path) return ''
  return path.split('.').reduce((o, k) => (o == null ? '' : o[k] ?? ''), obj)
}

const fmt = {
  // Currency stays an exact number in slide data; cells and the exported deck format it.
  currency: (v) => {
    if (v === '' || v == null) return ''
    const n = parseCurrency(v)
    return Number.isNaN(n) ? String(v) : String(n)
  },
  percent: (v) => (v === '' || v == null ? '' : `${v}%`),
  date: (v) => {
    if (!v) return ''
    try { return new Date(v).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) }
    catch { return v }
  },
}

// ── compute functions (named by the index's derive.compute) ────────

function findTeamMember(deal, role) {
  if (!deal.resources) return ''
  for (const group of ['leadership', 'specialists', 'process_leads']) {
    const list = deal.resources[group]
    if (!Array.isArray(list)) continue
    const match = list.find(r => r.role === role)
    if (match?.assigned_to) return match.assigned_to
  }
  if (Array.isArray(deal.contacts)) {
    const match = deal.contacts.find(c => c.role === role)
    if (match?.name) return match.name
  }
  return ''
}

const COMPUTE = {
  geo_market: (deal) => {
    const parts = [deal.market, deal.sector, deal.industry].filter(Boolean)
    return parts.length ? `Americas/${parts.join('/')}` : ''
  },
  current_date: () => new Date().toLocaleDateString('en-US'),
  team_member: (deal, opts) => findTeamMember(deal, opts?.role || ''),
  term_duration: (deal) => {
    const tl = deal.timelines?.[0]
    if (tl) return `${tl.total_duration} ${tl.duration_unit}`
    return ''
  },
  delivery_start: (deal) => {
    const tl = deal.timelines?.[0]
    return tl?.project_start_date || deal.project_start_date || ''
  },
  financial_assumptions: (deal) => {
    const f = deal.financials || {}
    const isbd = deal.isbd_data || {}
    const parts = []
    if (f.risk_rating) {
      const label = VOCABULARIES.risk_rating_label[String(f.risk_rating)]
      parts.push(`Risk Rating: ${f.risk_rating}${label ? ` (${label})` : ''}`)
    }
    if (f.contract_type) parts.push(`Contract Type: ${f.contract_type}`)
    if (f.price_type) parts.push(`Price Type: ${f.price_type}`)
    if (isbd.billing_timing) parts.push(isbd.billing_timing)
    if (isbd.payment_terms) parts.push(`${isbd.payment_terms} Payment Terms`)
    if (f.gp_percent) parts.push(`GP%: ${f.gp_percent}%`)
    if (f.pti_percent) parts.push(`PTI%: ${f.pti_percent}%`)
    return parts.join('\n')
  },
  total_resources: (deal) => {
    // Prefer GSSM staffing headcount if available, else fall back to resource arrays
    if (deal.staffing?.total_headcount) return deal.staffing.total_headcount
    const r = deal.resources || {}
    return (r.leadership?.length || 0) + (r.process_leads?.length || 0) + (r.specialists?.length || 0)
  },
  work_effort: (deal) => deal.staffing?.total_hours || '',
  onshore_offshore_pct: (deal) => {
    const loc = deal.staffing?.location_distribution
    if (!loc || Object.keys(loc).length === 0) return ''
    const total = Object.values(loc).reduce((s, v) => s + v, 0)
    if (total === 0) return ''
    return Object.entries(loc)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `${name} ${Math.round(count / total * 100)}%`)
      .join(' / ')
  },
}

// ── per-slide field usage and display formats, read from the template ──

function buildMapsFromTemplate() {
  const formats = {}
  const fieldUsage = {}
  const add = (used, node) => {
    if (!node?.key) return
    used.add(node.key)
    if (node.format) formats[node.key] = node.format
  }

  for (const [slideId, def] of Object.entries(templateDef.slideTypes || {})) {
    const used = new Set()
    for (const region of def.regions || []) {
      add(used, region)
      for (const row of region.rows || []) {
        add(used, row)
        add(used, row.paired)
      }
      for (const col of Array.isArray(region.columns) ? region.columns : []) {
        if (typeof col === 'object') add(used, col)
      }
    }
    if (used.size > 0) fieldUsage[slideId] = [...used]
  }
  return { formats, fieldUsage }
}

const { formats: FORMATS, fieldUsage: SLIDE_FIELD_USAGE } = buildMapsFromTemplate()
const SHOWN_KEYS = [...new Set(Object.values(SLIDE_FIELD_USAGE).flat())]

export { SLIDE_FIELD_USAGE }

function rawValue(deal, key) {
  const field = getField(key)
  if (!field) return undefined
  if (field.derive) {
    const { compute, path } = field.derive
    return compute ? COMPUTE[compute]?.(deal, field.derive) : get(deal, path)
  }
  if (field.owner === 'deal' || field.owner === 'gssm') return readPath(deal, key)
  return undefined
}

/**
 * { slideFieldKey → display value } for every shown field whose value comes
 * from the deal record or a computation (iSBD-only content is not included,
 * except narratives the index seeds with a computed draft).
 */
export function buildPrefillData(deal) {
  if (!deal) return {}
  const result = {}
  for (const key of SHOWN_KEYS) {
    let value = rawValue(deal, key)
    if (value === '' || value == null) continue
    const format = FORMATS[key]
    if (format && fmt[format]) value = fmt[format](value)
    if (value !== '' && value != null) result[key] = value
  }
  return result
}
