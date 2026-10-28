/**
 * fieldIndex — React-side loader for shared/field_index.json, the single
 * declaration of every cross-module field (key, path, owner, old names,
 * GSSM cell, iSBD labels). Mirrors core/shared/field_index.py.
 */
import index from '../../../../shared/field_index.json'

export const FIELD_INDEX = index.fields
export const RECORDS = index.records
export const VOCABULARIES = index.vocabularies

const PUNCTUATION = { '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '-' }

/** Canonical form of a human label; must match normalize_label() in field_index.py. */
export function normalizeLabel(label) {
  if (!label) return ''
  return String(label).normalize('NFKC')
    .replace(/[\u2018\u2019\u201C\u201D\u2013\u2014]/g, (ch) => PUNCTUATION[ch])
    .replace(/\s+/g, ' ').trim()
    .replace(/\s*\/\s*/g, '/')
    .replace(/[\s:*]+$/, '')
    .toLowerCase()
}

function parseA1(ref) {
  const match = /^(.+)!([A-Z]+)([0-9]+)$/.exec(ref)
  if (!match) throw new Error(`bad GSSM cell reference ${ref}`)
  let col = 0
  for (const ch of match[2]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { sheet: match[1], row: Number(match[3]) - 1, col: col - 1 }
}

const NAMES = new Map()
const GLOBAL_LABELS = new Map()
const SCOPED_LABELS = new Map()
const CELLS = new Map()

for (const [key, entry] of Object.entries(FIELD_INDEX)) {
  for (const name of [key, ...(entry.aliases || [])]) NAMES.set(name, key)
  for (const label of entry.isbd?.labels || []) GLOBAL_LABELS.set(normalizeLabel(label), key)
  for (const [slide, labels] of Object.entries(entry.isbd?.scoped || {})) {
    for (const label of labels) SCOPED_LABELS.set(`${slide}\u0000${normalizeLabel(label)}`, key)
  }
  if (entry.gssm) CELLS.set(key, parseA1(entry.gssm))
}

/** Resolve any old name to its field key; unknown names come back unchanged. */
export const canonicalKey = (name) => NAMES.get(name) ?? name
export const getField = (key) => FIELD_INDEX[key] || null
export const ownerOf = (key) => FIELD_INDEX[key]?.owner ?? null
export const pathOf = (key) => FIELD_INDEX[key]?.path ?? null
export const gssmCell = (key) => CELLS.get(key) ?? null
export const fieldsWhere = (predicate) => Object.entries(FIELD_INDEX).filter(([key, entry]) => predicate(entry, key))

/** Field key for an iSBD label; slide-scoped labels win over global ones. */
export function isbdKeyFor(label, slideTypeId) {
  const norm = normalizeLabel(label)
  if (slideTypeId) {
    const scoped = SCOPED_LABELS.get(`${slideTypeId}\u0000${norm}`)
    if (scoped) return scoped
  }
  return GLOBAL_LABELS.get(norm) ?? null
}

export function readPath(deal, key) {
  const path = pathOf(key)
  if (!deal || !path) return undefined
  return path.split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), deal)
}

/** Whether a deal is linked to the source that owns a field (mirrors is_linked in field_index.py). */
export function isLinked(deal, owner) {
  if (owner === 'gssm') return Boolean(deal?.gssm_workbook_id || deal?.gssm_synced_at)
  if (owner === 'monday') return Boolean(deal?.monday_item_id)
  return false
}

/** A deal is linked to GSSM once a workbook is recorded or GSSM has synced to it. */
export const isGssmLinked = (deal) => isLinked(deal, 'gssm')

/** A deal is linked to monday once it's tied to a board row. */
export const isMondayLinked = (deal) => isLinked(deal, 'monday')

/** Whether s0L screens may edit a field; GSSM and monday values are editable only until the deal is linked to their source. */
export function isEditable(key, deal) {
  const entry = FIELD_INDEX[key]
  if (!entry) return false
  if (entry.owner === 'deal' || entry.owner === 'isbd') return true
  return Boolean(entry.editable_until_linked && !isLinked(deal, entry.owner))
}
