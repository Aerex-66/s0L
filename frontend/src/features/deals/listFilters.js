import { isSolutionerDeal, solutionerNames } from '../../shared/utils/solutioners'

/** The list view's filters: each keeps the deals with one value of a field; the solutioner filter matches lead or SC2–SC4. */
export const LIST_FILTERS = [
  { key: 'status', label: 'Status', field: 'status' },
  { key: 'practice', label: 'Practice', field: 'monday_group' },
  { key: 'implementation_type', label: 'Impl type', field: 'implementation_type' },
  { key: 'solutioner', label: 'Solutioner' },
  { key: 'close_quarter', label: 'Close quarter', field: 'close_quarter' },
  { key: 'sales_stage', label: 'Sales stage', field: 'sales_stage' },
]

// Implementation type can hold several values.
const valuesOf = (deal, field) => [deal?.[field]].flat().map((value) => String(value ?? '').trim()).filter(Boolean)

/** The values each filter can take, from the deals on hand. */
export function filterOptions(deals) {
  return Object.fromEntries(LIST_FILTERS.map(({ key, field }) => [key, field
    ? [...new Set(deals.flatMap((deal) => valuesOf(deal, field)))].sort((a, b) => a.localeCompare(b))
    : solutionerNames(deals)]))
}

export function applyFilters(deals, filters) {
  const active = LIST_FILTERS.filter(({ key }) => filters?.[key])
  if (!active.length) return deals
  return deals.filter((deal) => active.every(({ key, field }) => (field
    ? valuesOf(deal, field).includes(filters[key])
    : isSolutionerDeal(deal, filters[key]))))
}

const SEARCHED_FIELDS = [
  'project_name', 'client_name', 'opportunity_number', 'status', 'sales_stage', 'monday_group', 'implementation_type',
  'sector', 'industry', 'close_quarter', 'lead_ssc', 'solution_consultant_2', 'solution_consultant_3',
  'solution_consultant_4', 'tt_executive',
]

/** The deals with the text in any searched field (case ignored); all of them for no text. */
export function searchDeals(deals, term) {
  const needle = String(term ?? '').trim().toLowerCase()
  if (!needle) return deals
  return deals.filter((deal) => SEARCHED_FIELDS.some((key) => String(deal[key] ?? '').toLowerCase().includes(needle)))
}
