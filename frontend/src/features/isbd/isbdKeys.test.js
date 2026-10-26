import { describe, expect, it } from 'vitest'
import templateDef from './isbdSlideTemplate.json'
import { FIELD_INDEX, isbdKeyFor } from '../../shared/constants/fieldIndex'

const entries = []
for (const [slideId, slideType] of Object.entries(templateDef.slideTypes)) {
  for (const region of slideType.regions || []) {
    if (region.key) entries.push({ slideId, key: region.key, label: region.label || null, prefill: region.prefill })
    for (const row of region.rows || []) {
      entries.push({ slideId, key: row.key, label: row.label, prefill: row.prefill })
      if (row.paired) entries.push({ slideId, key: row.paired.key, label: row.paired.label, prefill: row.paired.prefill })
    }
  }
}
const fieldEntries = entries.filter((entry) => !entry.key.startsWith('_'))

describe('iSBD template agrees with the field index', () => {
  it('resolves every labelled row to its own key', () => {
    const drift = fieldEntries
      .filter((entry) => entry.label && isbdKeyFor(entry.label, entry.slideId) !== entry.key)
      .map((entry) => `${entry.slideId}: "${entry.label}" -> ${isbdKeyFor(entry.label, entry.slideId)} (template says ${entry.key})`)
    expect(drift).toEqual([])
  })

  it('declares every template field in the index', () => {
    const missing = fieldEntries.filter((entry) => !(entry.key in FIELD_INDEX)).map((entry) => `${entry.slideId}.${entry.key}`)
    expect(missing).toEqual([])
  })

  it('leaves value sourcing to the index (no prefill annotations)', () => {
    const annotated = fieldEntries.filter((entry) => entry.prefill).map((entry) => `${entry.slideId}.${entry.key}`)
    expect(annotated).toEqual([])
  })
})
