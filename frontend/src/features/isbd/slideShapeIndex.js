/**
 * slideShapeIndex — maps iSBD slide type IDs to their real PPTX shapes.
 *
 * Uses the extracted iSBD structure as the reference template.
 * Shape positions are in EMU (English Metric Units) — converted to
 * viewport percentages at render time by PptSlideView.
 *
 * This replaces the manually-crafted region definitions in
 * isbdSlideTemplate.json with actual PPTX-extracted geometry.
 */

import sampleRef from './isbdReference.sample.json'

// The real deck is gitignored (client content); fresh clones fall back to the blanked sample.
const localRef = import.meta.glob('./isbdReference.json', { eager: true, import: 'default' })
const refData = Object.values(localRef)[0] ?? sampleRef

/**
 * Maps our canonical slide type IDs → reference slide index.
 * Many iSBD slide types share common layouts (e.g. scope slides
 * all use the same "title + text body" layout). We map to the
 * closest reference slide that demonstrates that layout.
 */
const TYPE_TO_REF = {
  // ── Core slides ──
  cover:                    1,
  deal_profile_summary:     2,
  executive_summary:        3,
  solution_history:         null,  // dynamic column table — no ref match, fall back
  proposed_timeline:        5,
  sales_cycle_timeline:     5,

  // ── Scope slides ──
  scope_summary:            4,

  // ── Table slides ──
  key_proposed_resources:   6,
  detailed_staffing:        6,
  bid_metrics:              7,
  wricef_count:             8,
  deal_financials_by_team:  9,
  onshore_offshore_mix:     9,

  // ── Image slides ──
  financial_summary:        10,
  solution_maps:            12,
  deal_timeline_context:    5,

  // ── GenAI ──
  genai:                    11,

  // ── Assumptions / scope text slides ──
  assumptions:              13,
  ocm_scope:                20,
  custom_development:       21,
  subcontractor_detail:     13,
  key_deal_aspects:         13,
  srr_action_items:         13,

  // ── Quad charts / process scope ──
  business_process_scope:   14,

  // ── Additional profile / compliance ──
  additional_deal_profile:  2,   // same dense table layout
  tda:                      2,
  compliance_review:        2,
  staffing_approvals:       2,

  // ── Risk ──
  risk_assessment:          null, // keep existing component (complex)

  // ── Other table layouts ──
  actions_to_close:         6,
  key_challenges:           6,
  key_dependencies:         6,
  solution_deviations:      6,
  raci:                     6,
  pi_po_interfaces:         6,
  holdback_strategy:        9,
  key_resources:            6,
  mandatory_assets:         6,

  // ── Back slide ──
  back_slide:               26,
}

/** Cached slide lookup */
const _slideCache = {}
const _titleCache = {}

/**
 * Returns the raw shapes array for a given slide type ID.
 * These are the unmodified PPTX shapes with EMU coordinates,
 * preserving the original reference title text.
 */
export function getRawSlideShapes(typeId) {
  if (_slideCache[typeId] !== undefined) return _slideCache[typeId]
  const idx = TYPE_TO_REF[typeId]
  if (!idx) {
    _slideCache[typeId] = null
    return null
  }
  const slide = refData.slides.find(s => s.index === idx)
  _slideCache[typeId] = slide?.shapes || null
  return _slideCache[typeId]
}

/**
 * Default export — returns shapes with the title placeholder text
 * overridden to match the canonical template title.
 *
 * Many slide types share the same reference slide (e.g. slide 6
 * "Governance and Key Staff"), so without this override they would all
 * display the same title. This ensures each slide shows its own
 * template-defined title while preserving the original layout geometry.
 *
 * @param {string} typeId       canonical slide type ID
 * @param {string} [titleOverride]  the template-defined title to stamp
 */
export function getSlideShapes(typeId, titleOverride) {
  const cacheKey = `${typeId}__${titleOverride || ''}`
  if (_titleCache[cacheKey] !== undefined) return _titleCache[cacheKey]

  const raw = getRawSlideShapes(typeId)
  if (!raw) {
    _titleCache[cacheKey] = null
    return null
  }

  // If no override requested, return raw
  if (!titleOverride) {
    _titleCache[cacheKey] = raw
    return raw
  }

  // Clone shapes and replace the title placeholder text.
  // Some PPTX shapes lack name/type metadata (e.g. slides 13, 20, 21)
  // so we also match by geometry: top-of-slide, wide, has text.
  const patched = raw.map(shape => {
    const namedTitle =
      shape.name?.includes('object 2') ||
      shape.name?.includes('Text Placeholder 1') ||
      shape.name?.includes('Title 1') ||
      (shape.type?.includes('PLACEHOLDER') &&
       shape.text &&
       shape.height > 300000 &&
       shape.width > 5000000 &&
       shape.top < 800000)

    const positionalTitle =
      !shape.name && !shape.type &&
      shape.text &&
      shape.top < 800000 &&
      shape.width > 5000000 &&
      shape.height > 200000 &&
      shape.height < 800000 &&
      !shape.table

    if ((namedTitle || positionalTitle) && shape.text) {
      return { ...shape, text: titleOverride }
    }
    return shape
  })

  _titleCache[cacheKey] = patched
  return patched
}

/**
 * Returns the template background image path for a slide type.
 */
export function getSlideBackground(typeId) {
  if (typeId === 'cover') return '/isbd-bg/cover_bg.png'
  if (typeId === 'back_slide') return '/isbd-bg/back_dark_bg.png'
  return '/isbd-bg/content_bg.png'
}

/**
 * Returns the raw reference slides in their original PPTX order.
 * Each entry: { index, layout, shapes[] }
 * Used by Original/snapshot view to show the actual reference deck
 * without any template-driven remapping or duplication.
 */
export function getRefSlides() {
  return refData.slides || []
}
