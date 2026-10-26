import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import templateDef from './isbdSlideTemplate.json'
import { buildPrefillData, SLIDE_FIELD_USAGE } from './isbdPrefillMap'
import { canonicalizeSlideData, mergeEditedSlides } from './isbdSave'
import { canonicalKey, ownerOf } from '../../shared/constants/fieldIndex'

/** iSBD-only content (and table data the index doesn't model) lives in isbd_data; everything else comes from the deal. */
const storedInIsbd = (key) => {
  const owner = ownerOf(key)
  return !owner || owner === 'isbd'
}

function slideValue(field, prefill, isbdImported) {
  if (storedInIsbd(field)) {
    const imported = isbdImported[field]
    if (imported !== undefined && imported !== '') return imported
  }
  return prefill[field]
}

/* ── localStorage draft helpers ── */
const DRAFT_PREFIX = 'isbd-draft:'

function draftKey(dealId, docType) {
  return `${DRAFT_PREFIX}${dealId}:${docType}`
}

function saveDraft(dealId, docType, slides) {
  if (!dealId) return
  try {
    const payload = slides.map(s => ({ instanceId: s.instanceId, typeId: s.typeId, data: s.data, dirty: s.dirty, edited: s.edited || [] }))
    localStorage.setItem(draftKey(dealId, docType), JSON.stringify({ ts: Date.now(), slides: payload }))
  } catch { /* quota exceeded — ignore */ }
}

function loadDraft(dealId, docType) {
  if (!dealId) return null
  try {
    const raw = localStorage.getItem(draftKey(dealId, docType))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Drafts older than 7 days are stale
    if (!parsed?.ts || Date.now() - parsed.ts > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(draftKey(dealId, docType))
      return null
    }
    return parsed
  } catch { return null }
}

function clearDraftStorage(dealId, docType) {
  try { localStorage.removeItem(draftKey(dealId, docType)) } catch { /* ignore */ }
}

/**
 * useIsbdDocument — manages the full iSBD document state for a deal.
 *
 * Initializes slide instances from the canonical template order,
 * pre-fills them with deal data, and exposes edit + undo + save API.
 *
 * @param {object}  deal           current deal object
 * @param {string}  documentType   'srr' | 'prr'
 * @returns {object}
 */
export default function useIsbdDocument(deal, documentType = 'srr') {
  const prefill = useMemo(() => buildPrefillData(deal), [deal])

  // Build the slide instance list from canonical order
  const initialSlides = useMemo(() => {
    const order = templateDef.canonical_order?.[documentType] || []
    const types = templateDef.slideTypes || {}

    // iSBD-only values (from imported PPTX or earlier saves)
    const isbdImported = deal?.isbd_data || {}

    // Evaluate slide-level conditions (e.g. solution_history only for bid repairs)
    const reviewStatus = isbdImported.review_status || deal?.review_status || ''
    const conditionContext = { review_status: reviewStatus }

    return order.map((typeId, index) => {
      const typeDef = types[typeId]
      if (!typeDef) return null

      // Skip slides with unmet conditions (e.g. solution_history requires bid repair)
      if (typeDef.condition) {
        const { field, not: notVal, equals } = typeDef.condition
        const actual = conditionContext[field] || ''
        if (notVal && (!actual || actual === notVal)) return null
        if (equals && actual !== equals) return null
      }

      // Build initial data for this slide: deal/GSSM/derived values from the
      // deal record, iSBD-only content from isbd_data
      const slideData = {}
      const usedFields = SLIDE_FIELD_USAGE[typeId]
      if (usedFields) {
        for (const field of usedFields) {
          const value = slideValue(field, prefill, isbdImported)
          if (value !== undefined) slideData[field] = value
        }
      }

      return {
        instanceId: `${typeId}_${index}`,
        typeId,
        typeDef,
        index: index + 1,
        data: slideData,
        dirty: false,
        edited: [],
      }
    }).filter(Boolean)
  }, [deal, documentType, prefill])

  // ── Restore draft if present and has unsaved edits: only the edited cells come back ──
  const restoredSlides = useMemo(() => {
    const draft = loadDraft(deal?.id, documentType)
    if (!draft?.slides?.length) return initialSlides
    const draftMap = new Map(draft.slides.map(d => [d.instanceId, d]))
    if (!draft.slides.some(d => d.dirty)) return initialSlides // draft was fully saved, use fresh
    return initialSlides.map(slide => {
      const saved = draftMap.get(slide.instanceId)
      if (!saved?.dirty) return slide
      const savedData = canonicalizeSlideData(saved.data)
      // Drafts from before edit tracking keep only iSBD-only values; deal values come fresh.
      const edited = (saved.edited || Object.keys(savedData).filter(storedInIsbd)).map(canonicalKey)
      const data = { ...slide.data }
      for (const key of edited) if (key in savedData) data[key] = savedData[key]
      return { ...slide, data, dirty: true, edited }
    })
  }, [initialSlides, deal?.id, documentType])

  const [slides, setSlides] = useState(restoredSlides)
  const [activeIndex, setActiveIndex] = useState(0)
  const undoStackRef = useRef([])
  const [canUndo, setCanUndo] = useState(false)
  const [saveStatus, setSaveStatus] = useState('') // '' | 'saving' | 'saved' | 'error'

  // Re-initialize slides when the deal's imported iSBD data or document type changes
  const prevDepsRef = useRef({ isbdData: deal?.isbd_data, docType: documentType })
  useEffect(() => {
    const prev = prevDepsRef.current
    if (deal?.isbd_data !== prev.isbdData || documentType !== prev.docType) {
      prevDepsRef.current = { isbdData: deal?.isbd_data, docType: documentType }
      setSlides(restoredSlides)
      setActiveIndex(0)
      undoStackRef.current = []
      setCanUndo(false)
    }
  }, [deal?.isbd_data, documentType, restoredSlides])

  // Refresh deal-sourced values when the deal changes (e.g. after a GSSM sync).
  // A cell keeps its value only if the user edited that exact cell.
  const prefillVersionRef = useRef(null)
  useEffect(() => {
    const hash = JSON.stringify(prefill)
    if (hash === prefillVersionRef.current) return
    prefillVersionRef.current = hash

    setSlides(prev => {
      let changed = false
      const next = prev.map(slide => {
        const usedFields = SLIDE_FIELD_USAGE[slide.typeId]
        if (!usedFields) return slide
        let slideChanged = false
        const newData = { ...slide.data }
        for (const field of usedFields) {
          if (storedInIsbd(field) || (slide.edited || []).includes(field)) continue
          const prefillVal = prefill[field]
          if (prefillVal !== slide.data[field]) {
            if (prefillVal === undefined) delete newData[field]
            else newData[field] = prefillVal
            slideChanged = true
          }
        }
        if (slideChanged) { changed = true; return { ...slide, data: newData } }
        return slide
      })
      return changed ? next : prev
    })
  }, [prefill])

  // Get current active slide
  const activeSlide = slides[activeIndex] || null

  // Update a field on a specific slide
  const updateSlideField = useCallback((slideInstanceId, fieldKey, value) => {
    setSlides((prev) => {
      // Push undo snapshot
      undoStackRef.current.push(prev)
      if (undoStackRef.current.length > 50) undoStackRef.current.shift()

      return prev.map((s) =>
        s.instanceId === slideInstanceId
          ? {
              ...s,
              data: { ...s.data, [fieldKey]: value },
              dirty: true,
              edited: (s.edited || []).includes(fieldKey) ? s.edited : [...(s.edited || []), fieldKey],
            }
          : s
      )
    })
    setCanUndo(true)
  }, [])

  // Convenience: update active slide
  const updateActiveField = useCallback((fieldKey, value) => {
    if (activeSlide) updateSlideField(activeSlide.instanceId, fieldKey, value)
  }, [activeSlide, updateSlideField])

  // Undo last edit
  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop()
    if (prev) {
      setSlides(prev)
      setCanUndo(undoStackRef.current.length > 0)
    }
  }, [])

  // Add a new instance of a repeatable slide type
  const addSlide = useCallback((typeId, afterIndex) => {
    const typeDef = templateDef.slideTypes?.[typeId]
    if (!typeDef) return

    setSlides((prev) => {
      const insertAt = afterIndex != null ? afterIndex + 1 : prev.length
      const instanceId = `${typeId}_${Date.now()}`
      const newSlide = {
        instanceId,
        typeId,
        typeDef,
        index: 0, // will be recalculated
        data: {},
        dirty: true,
        edited: [],
      }
      const next = [...prev]
      next.splice(insertAt, 0, newSlide)
      // Renumber
      return next.map((s, i) => ({ ...s, index: i + 1 }))
    })
  }, [])

  // Remove a slide instance
  const removeSlide = useCallback((instanceId) => {
    setSlides((prev) => {
      const next = prev.filter((s) => s.instanceId !== instanceId)
      return next.map((s, i) => ({ ...s, index: i + 1 }))
    })
  }, [])

  // Save status helpers
  const markSaving = useCallback(() => setSaveStatus('saving'), [])
  const markSaved = useCallback(() => { setSaveStatus('saved'); setTimeout(() => setSaveStatus(''), 2000) }, [])
  const markError = useCallback(() => setSaveStatus('error'), [])

  // Dirty check
  const isDirty = slides.some((s) => s.dirty)

  const clearDirty = useCallback(() => {
    setSlides((prev) => prev.map((s) => ({ ...s, dirty: false, edited: [] })))
    clearDraftStorage(deal?.id, documentType)
  }, [deal?.id, documentType])

  /** { flat, edited }: every shown value plus the set of keys the user edited (last edit wins). */
  const flattenToIsbdData = useCallback(() => mergeEditedSlides(slides), [slides])

  // Slide type categories for the "add slide" menu
  const repeatableTypes = useMemo(() => {
    return Object.entries(templateDef.slideTypes || {})
      .filter(([, def]) => def.repeatable)
      .filter(([, def]) => (def.documents || []).includes(documentType))
      .map(([id, def]) => ({ id, title: def.title, categories: def.categories }))
  }, [documentType])

  // ── Draft cache: write to localStorage on every edit for crash recovery ──
  useEffect(() => {
    if (isDirty) saveDraft(deal?.id, documentType, slides)
  }, [slides, isDirty, deal?.id, documentType])

  // ── Persist draft on tab close ──
  useEffect(() => {
    const handleUnload = () => {
      if (slides.some(s => s.dirty)) saveDraft(deal?.id, documentType, slides)
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [slides, deal?.id, documentType])

  return {
    // Slide list
    slides,
    activeIndex,
    activeSlide,
    setActiveIndex,

    // Editing
    updateSlideField,
    updateActiveField,
    undo,
    canUndo,

    // Slide management
    addSlide,
    removeSlide,
    repeatableTypes,

    // Save
    isDirty,
    clearDirty,
    flattenToIsbdData,
    saveStatus,
    markSaving,
    markSaved,
    markError,

    // Template metadata
    documentType,
    templateMeta: templateDef._meta,
  }
}
