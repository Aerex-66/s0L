/**
 * Currency cells: the stored value is the exact number; '$5.2M' style is
 * display only. Clicking into a cell and out again must never change a value.
 */
import { formatCompactCurrency, parseCurrency } from '../../shared/utils/financialsHelpers'

export const toDisplayCurrency = (value) => {
  const n = parseCurrency(value)
  return Number.isNaN(n) ? String(value ?? '') : formatCompactCurrency(String(n))
}

/** True only when the typed draft is a different number from the stored value. */
export function isCurrencyEdit(stored, draft) {
  const before = parseCurrency(stored)
  const after = parseCurrency(draft)
  if (Number.isNaN(after)) return String(draft ?? '').trim() !== String(stored ?? '').trim()
  return Number.isNaN(before) || before !== after
}
