/**
 * iSBD save routing — the deck is a view of the deal. Only values the user
 * edited are written: deal-owned edits go back to the deal record (in the
 * deal's own format), iSBD-only content goes to isbd_data, and GSSM-owned or
 * derived values are never written from here.
 */
import { canonicalKey, getField, isEditable, ownerOf } from '../../shared/constants/fieldIndex'
import { parseCurrency } from '../../shared/utils/financialsHelpers'
import { toDisplayCurrency } from './cellValues'

const NUMERIC_TYPES = new Set(['currency', 'number'])

/** Values as the exported deck should show them (currency compact, everything else as-is). */
export function formatForDeck(flat) {
  return Object.fromEntries(Object.entries(flat).map(([key, value]) => (
    [key, getField(canonicalKey(key))?.type === 'currency' && value !== '' ? toDisplayCurrency(value) : value]
  )))
}

/** Rename old editor keys to index keys; a value already under the index key wins. */
export function canonicalizeSlideData(data) {
  const out = {}
  const entries = Object.entries(data || {}).sort(([a], [b]) => (canonicalKey(a) !== a) - (canonicalKey(b) !== b))
  for (const [raw, value] of entries) {
    const key = canonicalKey(raw)
    if (!(key in out)) out[key] = value
  }
  return out
}

/**
 * Merge slide data into one flat map. Edited values win over displayed ones,
 * and among edits the later slide wins; unedited values keep first-slide order.
 */
export function mergeEditedSlides(slides) {
  const flat = {}
  const edited = new Set()
  for (const slide of slides) {
    for (const [key, value] of Object.entries(slide.data || {})) {
      if (value === '' || value == null || key in flat) continue
      flat[key] = value
    }
  }
  for (const slide of slides) {
    for (const key of slide.edited || []) {
      if (!(key in (slide.data || {}))) continue
      flat[key] = slide.data[key]
      edited.add(key)
    }
  }
  return { flat, edited }
}

function toDealFormat(field, value) {
  if (NUMERIC_TYPES.has(field.type)) {
    const n = parseCurrency(value)
    return Number.isNaN(n) ? value : String(n)
  }
  if (field.type === 'date') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10)
  }
  return value
}

export function splitIsbdSave(flat, deal, edited) {
  const dealUpdate = {}
  const isbdData = {}
  const editedKeys = new Set([...(edited || [])].map(canonicalKey))
  for (const [key, value] of Object.entries(canonicalizeSlideData(flat))) {
    if (!editedKeys.has(key)) continue
    const owner = ownerOf(key)
    if (!owner || owner === 'isbd') {
      isbdData[key] = value
      continue
    }
    if (!isEditable(key, deal)) continue
    const field = getField(key)
    if (field.path !== key) continue
    const next = toDealFormat(field, value)
    if (String(next) !== String(deal?.[key] ?? '')) dealUpdate[key] = next
  }
  return { dealUpdate, isbdData }
}
