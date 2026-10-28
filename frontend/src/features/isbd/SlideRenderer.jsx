import { memo, useMemo } from 'react'
import PptSlideView from './PptSlideView'
import { DeckLockContext } from './deckLock'
import { isEditable, ownerOf } from '../../shared/constants/fieldIndex'
import { getSlideShapes, getRawSlideShapes, getSlideBackground } from './slideShapeIndex'
import TimelineBar, { timelinesToLanes } from '../../shared/ui/TimelineBar'
import ScopeLeversView from './ScopeLeversView'
import RicefwProjection from './RicefwProjection'

/* EMU coords from ref slide 5 — match the full-width separator line */
const SLIDE_W = 14630400
const SLIDE_H = 8229600
const LINE_LEFT = 531360, LINE_W = 13573506
const IMG_TOP = 1440000, IMG_H = 3200000
const TL_REGION = {
  left: `${(LINE_LEFT / SLIDE_W * 100).toFixed(2)}%`,
  top: `${(IMG_TOP / SLIDE_H * 100).toFixed(2)}%`,
  width: `${(LINE_W / SLIDE_W * 100).toFixed(2)}%`,
  height: `${(IMG_H / SLIDE_H * 100).toFixed(2)}%`,
}
/* RICEFW projection below the timeline bar */
const RFW_TOP = IMG_TOP + IMG_H + 120000 // small gap below timeline
const RFW_H = SLIDE_H - RFW_TOP - 300000 // fill remaining minus bottom margin
const RFW_REGION = {
  left: TL_REGION.left,
  top: `${(RFW_TOP / SLIDE_H * 100).toFixed(2)}%`,
  width: TL_REGION.width,
  height: `${(RFW_H / SLIDE_H * 100).toFixed(2)}%`,
}

/**
 * SlideRenderer — renders any iSBD slide using the faithful PPT projection.
 *
 * Looks up the real PPTX shape positions for the slide type and passes them
 * to PptSlideView, which renders each shape at its exact EMU coordinates.
 *
 * viewMode:
 *   'template' (default) — titles are overridden to match the canonical template.
 *   'original'           — preserves the raw imported PPTX shape text as-is.
 */
const SlideRenderer = memo(function SlideRenderer({
  slideType,
  slideData,
  onChange,
  readOnly = false,
  viewMode = 'template',
  deal,
}) {
  const isRaw = viewMode === 'original'
  const slideId = slideType?.id
  const shapes = !slideType ? null : isRaw
    ? getRawSlideShapes(slideId)
    : getSlideShapes(slideId, slideType.title)

  // Proposed timeline slide: overlay a live TimelineBar in the chart region
  const timelineLanes = useMemo(() => {
    if (slideId !== 'proposed_timeline' || isRaw) return null
    return timelinesToLanes(deal?.timelines)
  }, [slideId, isRaw, deal?.timelines])

  // Filter out the image shape for proposed_timeline (replaced by live bar)
  const effectiveShapes = useMemo(() => {
    if (!timelineLanes?.length || !shapes) return shapes
    return shapes.filter(s => !s.image_file)
  }, [shapes, timelineLanes])

  // Levers of Scope slide: overlay structured scope view replacing tables
  const isScopeSlide = slideId === 'scope_summary' && !isRaw

  // For scope slides, keep only non-table shapes (title, page number)
  const finalShapes = useMemo(() => {
    if (!isScopeSlide || !effectiveShapes) return effectiveShapes
    return effectiveShapes.filter(s => !s.table)
  }, [isScopeSlide, effectiveShapes])

  if (!slideType) {
    return <div className="ppt-view ppt-view-empty-inner">No slide type configured</div>
  }

  const bg = getSlideBackground(slideId)

  // Original mode is a read-only snapshot — no deal data overlays, no editing,
  // no template-driven layout overrides. Pure frozen reference view.
  const effectiveReadOnly = isRaw || readOnly

  // RICEFW summary from deal (populated by GSSM sync)
  const ricefw = (!isRaw && slideId === 'proposed_timeline') ? deal?.gssm_ricefw : null

  const isLocked = (fieldKey) => Boolean(ownerOf(fieldKey)) && !isEditable(fieldKey, deal)

  return (
    <DeckLockContext.Provider value={isLocked}>
    <PptSlideView
      shapes={finalShapes}
      data={isRaw ? {} : (slideData || {})}
      onChange={effectiveReadOnly ? undefined : onChange}
      readOnly={effectiveReadOnly}
      bgImage={bg}
      slideTypeId={isRaw ? null : slideType.id}
      snapshot={isRaw}
    >
      {timelineLanes?.length > 0 && (
        <div className="isbd-tl-overlay" style={{
          position: 'absolute',
          left: TL_REGION.left,
          top: TL_REGION.top,
          width: TL_REGION.width,
          height: TL_REGION.height,
          zIndex: 50,
          overflow: 'hidden',
        }}>
          <TimelineBar
            lanes={timelineLanes}
            compact
            showAxis
            showLegend
            className="isbd-tl-embed"
          />
        </div>
      )}
      {ricefw && (
        <div className="isbd-rfw-overlay" style={{
          position: 'absolute',
          left: RFW_REGION.left,
          top: RFW_REGION.top,
          width: RFW_REGION.width,
          height: RFW_REGION.height,
          zIndex: 50,
          overflow: 'hidden',
        }}>
          <RicefwProjection ricefw={ricefw} />
        </div>
      )}
      {isScopeSlide && (
        <div className="isbd-scope-overlay">
          <ScopeLeversView
            data={slideData || {}}
            onChange={effectiveReadOnly ? undefined : onChange}
            readOnly={effectiveReadOnly}
          />
        </div>
      )}
    </PptSlideView>
    </DeckLockContext.Provider>
  )
})

export default SlideRenderer
