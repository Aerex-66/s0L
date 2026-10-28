import { dealStatusColor } from '../../shared/constants'
import { leadSolutioner, UNASSIGNED } from '../../shared/utils/solutioners'
import { practiceOf } from './practices'

export const GROUPINGS = [
  { id: 'none', label: 'None' },
  { id: 'solutioner', label: 'Solutioner', noun: ['solutioner', 'solutioners'] },
  { id: 'status', label: 'Status', noun: ['status', 'statuses'] },
  { id: 'practice', label: 'Practice', noun: ['practice', 'practices'] },
  { id: 'tcv', label: 'TCV', noun: ['TCV band', 'TCV bands'] },
]

// TCV bands, biggest first; TCVs are in dollars.
const TCV_BANDS = [
  { label: '$50M and up', min: 50e6 },
  { label: '$20M – $50M', min: 20e6 },
  { label: '$10M – $20M', min: 10e6 },
  { label: '$5M – $10M', min: 5e6 },
  { label: '$1M – $5M', min: 1e6 },
  { label: 'Under $1M', min: 0 },
]
export const NO_TCV = 'No TCV yet'
const BAND_ORDER = [...TCV_BANDS.map((band) => band.label), NO_TCV]

export const tcvBand = (tcv) => (tcv > 0 ? TCV_BANDS.find((band) => tcv >= band.min).label : NO_TCV)

export const NO_STATUS = 'No status'
export const NO_PRACTICE = 'No practice'

const text = (value) => String(value ?? '').trim()

// A–Z; the section for deals without a value comes last.
const alphabetical = (a, b) =>
  a.missing - b.missing || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })

// `missing` names the section for deals without a value.
const MODES = {
  solutioner: {
    of: (deal) => leadSolutioner(deal),
    missing: UNASSIGNED,
    sort: alphabetical,
  },
  status: {
    of: (deal) => text(deal.status) || NO_STATUS,
    missing: NO_STATUS,
    color: (label) => dealStatusColor(label),
    sort: alphabetical,
  },
  practice: {
    of: (deal) => text(deal.monday_group) || NO_PRACTICE,
    missing: NO_PRACTICE,
    color: (label) => (label === NO_PRACTICE ? undefined : practiceOf(label).color),
    sort: alphabetical,
  },
  tcv: {
    of: (deal, tcv) => tcvBand(tcv),
    missing: NO_TCV,
    // Bands read as amounts, so they keep their order (A–Z would put $10M before $5M).
    sort: (a, b) => BAND_ORDER.indexOf(a.key) - BAND_ORDER.indexOf(b.key),
  },
}

/**
 * Deals in sections, each { key, label, missing, color?, deals, count, tcv } with the deals in the order given:
 * per lead solutioner, status or practice (A–Z, the one without a value last) or TCV band
 * (biggest first); null for 'none'.
 */
export function groupDeals(deals, mode, tcvOf) {
  const grouping = MODES[mode]
  if (!grouping) return null
  const sections = new Map()
  for (const deal of deals) {
    const tcv = Number(tcvOf(deal)) || 0
    const key = grouping.of(deal, tcv)
    const section = sections.get(key)
      || { key, label: key, missing: key === grouping.missing, color: grouping.color?.(key), deals: [], count: 0, tcv: 0 }
    section.deals.push(deal)
    section.count += 1
    section.tcv += tcv > 0 ? tcv : 0
    sections.set(key, section)
  }
  return [...sections.values()].sort(grouping.sort)
}
