/**
 * Migrate a deal from old timeline structure to new timelines array structure
 */

/** Collapse "Rollout 1 Rollout 1 Rollout 1" → "Rollout 1".
 *  (Merged Excel cells repeat their value per spanned column; early GSSM
 *  extractions joined them verbatim. Extraction is fixed — this repairs
 *  records that were synced before the fix.) */
function dedupeName(name) {
  if (!name || typeof name !== 'string') return name
  const words = name.trim().split(/\s+/)
  // Try fragment lengths from 1 word up: if the whole name is that fragment
  // repeated, collapse to a single instance.
  for (let n = 1; n <= Math.floor(words.length / 2); n++) {
    if (words.length % n !== 0) continue
    const frag = words.slice(0, n).join(' ')
    let repeats = true
    for (let i = n; i < words.length; i += n) {
      if (words.slice(i, i + n).join(' ') !== frag) { repeats = false; break }
    }
    if (repeats) return frag
  }
  return words.join(' ')
}

export function migrateTimelineStructure(deal) {
  // If already using new structure, repair legacy duplicated lane names
  if (deal.timelines && Array.isArray(deal.timelines)) {
    let changed = false
    const timelines = deal.timelines.map(tl => {
      const fixed = dedupeName(tl.name)
      if (fixed !== tl.name) { changed = true; return { ...tl, name: fixed } }
      return tl
    })
    return changed ? { ...deal, timelines } : deal
  }

  // If has old single timeline structure, convert it
  if (deal.timeline && Object.keys(deal.timeline).length > 0) {
    const migratedDeal = {
      ...deal,
      timelines: [{
        name: 'Main Project',
        project_start_date: deal.project_start_date || '',
        methodology: 'balanced',
        timeline: deal.timeline
      }]
    }
    
    // Remove old fields
    delete migratedDeal.timeline
    delete migratedDeal.project_start_date
    
    return migratedDeal
  }

  // No timeline data, initialize empty array
  return {
    ...deal,
    timelines: []
  }
}
