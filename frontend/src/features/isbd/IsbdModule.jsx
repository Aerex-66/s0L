import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react'
import './IsbdModule.css'
import useStore from '../../shared/useStore'
import useIsbdDocument from './useIsbdDocument'
import SlideRenderer from './SlideRenderer'
import PptSlideView from './PptSlideView'
import { getRefSlides } from './slideShapeIndex'
import { formatForDeck, splitIsbdSave } from './isbdSave'
import { dealService } from '../../shared/services/dealService'

/**
 * Memoized filmstrip thumbnail — only re-renders when its own slide data,
 * active state, or dirty flag changes. Prevents the entire filmstrip
 * from re-rendering on every field edit in the active slide.
 */
const FilmstripThumb = memo(function FilmstripThumb({
  slide, index, isActive, onClick, viewMode, deal,
}) {
  return (
    <button
      className={
        'isbd-thumb' +
        (isActive ? ' active' : '') +
        (slide.dirty ? ' dirty' : '')
      }
      onClick={onClick}
      type="button"
      title={slide.typeDef?.title || slide.typeId}
    >
      <div className="isbd-thumb-preview">
        <div className="isbd-thumb-preview-inner">
          <SlideRenderer
            slideType={slide.typeDef}
            slideData={slide.data}
            onChange={() => {}}
            readOnly
            viewMode={viewMode}
            deal={deal}
          />
        </div>
      </div>
      <span className="isbd-thumb-index">{index + 1}</span>
    </button>
  )
}, (prev, next) => {
  // Only re-render if this specific thumbnail's data actually changed
  if (prev.isActive !== next.isActive) return false
  if (prev.slide.dirty !== next.slide.dirty) return false
  if (prev.index !== next.index) return false
  if (prev.viewMode !== next.viewMode) return false
  if (prev.deal?.timelines !== next.deal?.timelines) return false
  // Deep-compare slide data since updateSlideField creates new objects
  if (prev.slide.data !== next.slide.data) {
    const prevKeys = Object.keys(prev.slide.data || {})
    const nextKeys = Object.keys(next.slide.data || {})
    if (prevKeys.length !== nextKeys.length) return false
    for (const k of prevKeys) {
      if (prev.slide.data[k] !== next.slide.data[k]) return false
    }
  }
  return true
})

/**
 * Filmstrip thumbnail for Original/snapshot mode.
 * Shows the actual PNG render of the original PPTX slide — 1:1 snapshot.
 */
const RefThumb = memo(function RefThumb({ refSlide, index, isActive, onClick }) {
  return (
    <button
      className={'isbd-thumb' + (isActive ? ' active' : '')}
      onClick={onClick}
      type="button"
      title={`Slide ${refSlide.index} — ${refSlide.layout || 'Layout'}`}
    >
      <div className="isbd-thumb-preview">
        <img
          className="isbd-snapshot-img"
          src={`/isbd-bg/ref_slide${refSlide.index}.png`}
          alt={`Slide ${refSlide.index}`}
          draggable={false}
        />
      </div>
      <span className="isbd-thumb-index">{refSlide.index}</span>
    </button>
  )
}, (prev, next) => {
  return prev.refSlide === next.refSlide
    && prev.isActive === next.isActive
    && prev.index === next.index
})

/**
 * iSBD slide editor — PowerPoint-faithful viewer.
 *
 * Layout:
 *   ┌─ isbd-module ──────────────────────────────────┐
 *   │ toolbar                                        │
 *   ├─ isbd-stage ───────────────────────────────────┤
 *   │  nav-row                                       │
 *   │  ┌─ canvas ──────────────────────────────────┐ │
 *   │  │          slide-frame (16:9)                │ │
 *   │  └──────────────────────────────────────────┘ │
 *   ├─ isbd-filmstrip (horizontal thumbnails) ───────┤
 *   └───────────────────────────────────────────────┘
 */
export default function IsbdModule({ deal, onUpdate }) {
  const { setShowActionModal } = useStore()
  const [docType, setDocType] = useState('srr')
  const [viewMode, setViewMode] = useState('template') // 'template' | 'original'
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const filmstripRef = useRef(null)

  const doc = useIsbdDocument(deal, docType)
  const {
    slides, activeIndex, activeSlide, setActiveIndex,
    updateActiveField, undo, canUndo,
    addSlide, removeSlide, repeatableTypes,
    isDirty, flattenToIsbdData, saveStatus,
    markSaving, markSaved, markError, clearDirty,
  } = doc
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  /* ── Original-mode: raw reference slides ── */
  const refSlides = useMemo(() => getRefSlides(), [])
  const [originalIndex, setOriginalIndex] = useState(0)

  // Which slide set is currently displayed
  const isOriginal = viewMode === 'original'
  const displayTotal = isOriginal ? refSlides.length : slides.length
  const displayIndex = isOriginal ? originalIndex : activeIndex
  const setDisplayIndex = isOriginal ? setOriginalIndex : setActiveIndex
  const activeRefSlide = isOriginal ? refSlides[originalIndex] : null

  /* ── Handlers ─────────────────────────────── */

  const handleSave = useCallback(async () => {
    if (!deal?.id) return
    markSaving()
    try {
      const { flat, edited } = flattenToIsbdData()
      const { dealUpdate, isbdData } = splitIsbdSave(flat, deal, edited)
      if (Object.keys(dealUpdate).length > 0) await dealService.update(deal.id, dealUpdate)
      if (Object.keys(isbdData).length > 0) await dealService.saveIsbd(deal.id, isbdData)
      clearDirty()
      markSaved()
      onUpdate?.()
    } catch (err) {
      console.error('[iSBD] Save failed:', err)
      markError()
    }
  }, [deal, onUpdate, flattenToIsbdData, markSaving, markSaved, markError, clearDirty])

  const handleExport = useCallback(async () => {
    if (!deal?.id) return
    setExporting(true)
    setExportError(null)
    try {
      const { flat } = flattenToIsbdData()
      const client = deal.client_name?.replace(/\s+/g, '_') || 'Deal'
      const opp = deal.opportunity_number || ''
      const filename = opp ? `iSBD_${client}_${opp}.pptx` : `iSBD_${client}.pptx`
      await dealService.exportIsbd(deal.id, formatForDeck(flat), filename)
    } catch (err) {
      setExportError(err.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }, [deal?.id, deal?.client_name, deal?.opportunity_number, flattenToIsbdData])

  const total = displayTotal

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave() }
    if (e.key === 'ArrowLeft' && !e.target.closest('input, textarea, select')) {
      setDisplayIndex(prev => Math.max(0, prev - 1))
    }
    if (e.key === 'ArrowRight' && !e.target.closest('input, textarea, select')) {
      setDisplayIndex(prev => prev < total - 1 ? prev + 1 : prev)
    }
  }, [undo, handleSave, setDisplayIndex, total])

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    const el = filmstripRef.current?.querySelector('.isbd-thumb.active')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeIndex])

  /* ── Render ───────────────────────────────── */

  return (
    <section className="isbd-module" onKeyDown={handleKeyDown} tabIndex={-1}>

      {/* ── Top bar ── */}
      <header className="isbd-topbar">
        <div className="isbd-topbar-left">
          <div className="isbd-doc-toggle">
            {['srr', 'prr'].map(t => (
              <button
                key={t}
                className={`isbd-doc-btn${docType === t ? ' active' : ''}`}
                onClick={() => {
                  if (t === docType) return
                  if (doc.isDirty && !window.confirm(`Switch to ${t.toUpperCase()}? Unsaved changes will be lost.`)) return
                  setDocType(t)
                }}
              >{t.toUpperCase()}</button>
            ))}
          </div>
          <span className="isbd-topbar-divider" />
          <div className="isbd-view-toggle">
            <button
              className={`isbd-view-btn${viewMode === 'template' ? ' active' : ''}`}
              onClick={() => setViewMode('template')}
              title="Template titles — each slide shows its canonical iSBD section title"
            >Template</button>
            <button
              className={`isbd-view-btn${viewMode === 'original' ? ' active' : ''}`}
              onClick={() => setViewMode('original')}
              title="Original view — read-only snapshot of the reference PPTX layout"
            >Original</button>
          </div>
        </div>

        <div className="isbd-topbar-center">
          <button className="isbd-arrow" disabled={displayIndex <= 0} onClick={() => setDisplayIndex(displayIndex - 1)}>‹</button>
          <div className="isbd-slide-info">
            <span className="isbd-slide-pos">{displayIndex + 1}<span className="isbd-slide-sep">/</span>{total}</span>
            {isOriginal && activeRefSlide && (
              <span className="isbd-slide-name">{activeRefSlide.layout || `Slide ${activeRefSlide.index}`}</span>
            )}
            {!isOriginal && activeSlide && (
              <span className="isbd-slide-name">{activeSlide.typeDef?.title || activeSlide.typeId}</span>
            )}
          </div>
          <button className="isbd-arrow" disabled={displayIndex >= total - 1} onClick={() => setDisplayIndex(displayIndex + 1)}>›</button>
        </div>

        <div className="isbd-topbar-right">
          {saveStatus === 'saving' && <span className="isbd-status-dot pulse" title="Saving…" />}
          {saveStatus === 'saved' && <span className="isbd-status saved">Saved</span>}
          {saveStatus === 'error' && <span className="isbd-status error">Save failed</span>}
          {viewMode === 'original' && (
            <span className="isbd-badge snapshot">Snapshot</span>
          )}
          {viewMode === 'template' && canUndo && (
            <button className="isbd-action" onClick={undo} title="Undo (Ctrl+Z)">↩ Undo</button>
          )}
          <button className="isbd-action" onClick={() => setShowActionModal(true)} title="Import PPTX">
            Import
          </button>
          {viewMode === 'template' && (
            <button
              className="isbd-action"
              onClick={handleExport}
              disabled={exporting}
              title="Export PPTX"
            >{exporting ? 'Exporting…' : 'Export'}</button>
          )}
          {exportError && <span className="isbd-status error" title={exportError}>⚠</span>}
          {viewMode === 'template' && isDirty && (
            <button className="isbd-action primary" onClick={handleSave} title="Save (Ctrl+S)">Save</button>
          )}
        </div>
      </header>

      {/* ── Canvas: the slide presentation area ── */}
      <div className="isbd-stage">
        <div className="isbd-canvas">
          <div className="isbd-slide-frame">
            {isOriginal ? (
              activeRefSlide ? (
                <div className="isbd-snapshot-slide">
                  <img
                    className="isbd-snapshot-img"
                    src={`/isbd-bg/ref_slide${activeRefSlide.index}.png`}
                    alt={`Slide ${activeRefSlide.index} — ${activeRefSlide.layout}`}
                    draggable={false}
                  />
                </div>
              ) : (
                <div className="ppt-slide-empty">No reference slides available</div>
              )
            ) : (
              activeSlide ? (
                <SlideRenderer
                  slideType={activeSlide.typeDef}
                  slideData={activeSlide.data}
                  onChange={(key, val) => updateActiveField(key, val)}
                  viewMode={viewMode}
                  deal={deal}
                />
              ) : (
                <div className="ppt-slide-empty">No slides for {docType.toUpperCase()}</div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ── Filmstrip ── */}
      <div className="isbd-filmstrip" ref={filmstripRef}>
        <div className="isbd-filmstrip-track">
          {isOriginal ? (
            refSlides.map((bs, i) => (
              <RefThumb
                key={bs.index}
                refSlide={bs}
                index={i}
                isActive={i === originalIndex}
                onClick={() => setOriginalIndex(i)}
              />
            ))
          ) : (
            <>
              {slides.map((slide, i) => (
                <FilmstripThumb
                  key={slide.instanceId}
                  slide={slide}
                  index={i}
                  isActive={activeSlide?.instanceId === slide.instanceId}
                  onClick={() => setActiveIndex(i)}
                  viewMode={viewMode}
                  deal={deal}
                />
              ))}
              <div className="isbd-add-area">
                <button
                  className="isbd-add-btn"
                  onClick={() => setAddMenuOpen(!addMenuOpen)}
                  type="button"
                >+</button>
                {addMenuOpen && (
                  <div className="isbd-add-menu">
                    {repeatableTypes.map((rt) => (
                      <button
                        key={rt.id}
                        className="isbd-add-menu-item"
                        onClick={() => { addSlide(rt.id, activeIndex); setAddMenuOpen(false) }}
                      >{rt.title}</button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
