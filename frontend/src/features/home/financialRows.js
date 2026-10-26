/**
 * Home financials, straight from the field index: every GSSM-owned financial
 * value (read-only — GSSM is the only writer) plus the deal-owned GP target.
 *
 * state: 'linked'   — values came from a GSSM sync
 *        'pre_gssm' — values were typed before GSSM was linked (shown, not editable)
 *        'unlinked' — no GSSM values yet
 */
import { fieldsWhere, isEditable, readPath } from '../../shared/constants/fieldIndex'

const FINANCIAL_FIELDS = fieldsWhere((field) => field.path?.startsWith('financials.'))

export function financialRows(deal) {
  const rows = FINANCIAL_FIELDS.map(([key, field]) => ({
    key,
    label: field.label,
    type: field.type,
    value: readPath(deal, key) ?? '',
    editable: isEditable(key, deal),
  }))
  const hasGssmValues = rows.some((row) => !row.editable && row.value !== '')
  const state = deal?.gssm_synced_at ? 'linked' : hasGssmValues ? 'pre_gssm' : 'unlinked'
  return { state, rows }
}
