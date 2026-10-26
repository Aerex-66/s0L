/**
 * useGssmWorkbook — workbook lifecycle for the s0L GSSM shell.
 *
 * Owns: import (file drop/browse), reimport from catalog, auto-load of the
 * last-used workbook per deal, session reset, and all file/sheet/catalog
 * state. The identical post-load pipeline that was previously duplicated
 * between handleFile and handleReimport lives once in applyWorkbookData.
 *
 * s0L-only shell hook — NOT part of the standalone sync boundary.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  importWorkbook, fetchWorkbookData, fetchCatalog,
  updateWorkbookOpportunity, reimportWorkbook, fetchPersistedEdits,
} from '../gssmApi'
import { FORM_VIEW_SHEETS } from '../hooks/useSheetNavigation'
import { DEFAULT_VISIBLE_SHEETS } from './sheetGroups'
import { gssmCell } from '../../../shared/constants/fieldIndex'
import { pickWorkbookForDeal } from '../../../shared/gssmData/pickWorkbook'

export function useGssmWorkbook({
  deal,
  workbookRef,
  workbookDataRef,
  editsRef,
  inputValueRef,
  pendingUIEditsRef,
  depIndexCacheRef,
  columnDefsCacheRef,
  deletedRowsRef,
  resetCrossSheetCache,
  renderSheet,
  bumpMetrics,
  syncOnLoad,
  setGssmViewMode,
}) {
  const [opportunityNumber, setOpportunityNumber] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [allSheetNames, setAllSheetNames] = useState([])
  const [sheetNames, setSheetNames] = useState([])
  const [sheetVisibility, setSheetVisibility] = useState({})
  const [activeSheet, setActiveSheet] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [catalogItems, setCatalogItems] = useState([])

  // Track whether we've already attempted auto-load for this deal
  const autoLoadAttemptedRef = useRef(false)
  // Ref to the reimport handler so the auto-load effect can call it without a dependency
  const handleReimportRef = useRef(null)
  // True while we're fetching catalog + auto-loading the last workbook
  const [autoLoadPending, setAutoLoadPending] = useState(() => deal?.gssm_workbook_id != null)

  // Auto-dismiss notices
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  // Sync opportunity number from deal prop
  useEffect(() => {
    if (deal?.opportunity_number) {
      setOpportunityNumber(deal.opportunity_number)
    }
  }, [deal?.opportunity_number])

  /* ── Shared post-load pipeline (import + reimport) ── */
  const applyWorkbookData = useCallback(async (importData, displayName) => {
    workbookRef.current = importData

    setFileName(displayName)
    setFileType(displayName?.endsWith('.xlsm') ? 'xlsm' : 'xlsx')

    const wbData = await fetchWorkbookData(importData.metadataDir, importData.workbookId)
    workbookDataRef.current = wbData

    editsRef.current = {}
    inputValueRef.current = {}
    pendingUIEditsRef.current = []
    depIndexCacheRef.current = {}
    columnDefsCacheRef.current = {}
    deletedRowsRef.current = {}
    resetCrossSheetCache()

    const names = wbData.sheetNames || importData.sheetNames || []
    setAllSheetNames(names)

    const defaultVisible = {}
    names.forEach((name) => { defaultVisible[name] = DEFAULT_VISIBLE_SHEETS.has(name) })
    setSheetVisibility(defaultVisible)

    const visibleSheets = names.filter((n) => defaultVisible[n] !== false)
    setSheetNames(visibleSheets)

    const firstSheet = visibleSheets[0] || names[0] || ''
    setActiveSheet(firstSheet)

    if (firstSheet) {
      if (firstSheet === 'Imp TL') setGssmViewMode('timeline')
      else if (FORM_VIEW_SHEETS.has(firstSheet)) setGssmViewMode('form')
      else setGssmViewMode('grid')
      renderSheet(firstSheet)
    }

    bumpMetrics()

    const savedEdits = await fetchPersistedEdits(importData.workbookId)
    if (savedEdits.length > 0) {
      for (const edit of savedEdits) {
        const sd = wbData.rowDataBySheet?.[edit.sheet]
        if (!sd || !sd[edit.row]) continue
        sd[edit.row][`c${edit.col}`] = edit.value
        if (!editsRef.current[edit.sheet]) editsRef.current[edit.sheet] = {}
        editsRef.current[edit.sheet][`${edit.row}:${edit.col}`] = edit.value
      }
      setNotice(`Restored ${savedEdits.length} edit(s) from previous session.`)
      renderSheet(firstSheet)
      bumpMetrics()
    }

    const oppCell = gssmCell('opportunity_number')
    const oppNum = String(wbData?.rowDataBySheet?.[oppCell.sheet]?.[oppCell.row]?.[`c${oppCell.col}`] || '').trim()
    if (oppNum) {
      setOpportunityNumber(oppNum)
      updateWorkbookOpportunity(importData.workbookId, oppNum)
    }

    // Sync GSSM data → deal (and seed deal → GSSM for empty cells)
    try { syncOnLoad() } catch (syncErr) { console.warn('Deal sync on load failed:', syncErr) }
  }, [
    workbookRef, workbookDataRef, editsRef, inputValueRef, pendingUIEditsRef,
    depIndexCacheRef, columnDefsCacheRef, deletedRowsRef,
    resetCrossSheetCache, renderSheet, bumpMetrics, syncOnLoad, setGssmViewMode,
  ])

  /* ── File import (browser) ── */
  const handleFile = useCallback(async (file) => {
    if (!file) return
    setError('')
    setIsLoading(true)
    setNotice('')

    try {
      const importData = await importWorkbook(file)
      await applyWorkbookData(importData, file.name)
    } catch (err) {
      console.error('GSSM import failed:', err)
      setError(err.message || 'Failed to import workbook.')
    } finally {
      setIsLoading(false)
      fetchCatalog().then(setCatalogItems)
    }
  }, [applyWorkbookData, deal?.id])

  /* ── Reimport (catalog) ── */
  const handleReimport = useCallback(async (catalogItem) => {
    if (!catalogItem?.id) return
    setError('')
    setIsLoading(true)
    setNotice('')

    try {
      const importData = await reimportWorkbook(catalogItem.id)
      await applyWorkbookData(importData, catalogItem.name || 'workbook.xlsm')
    } catch (err) {
      console.error('GSSM reimport failed:', err)
      setError(err.message || 'Failed to open workbook.')
    } finally {
      setIsLoading(false)
      fetchCatalog().then(setCatalogItems)
    }
  }, [applyWorkbookData, deal?.id])

  // Keep ref in sync so the auto-load effect can call it
  handleReimportRef.current = handleReimport

  /* ── Auto-load: catalog fetch, then the workbook linked to this deal ── */
  useEffect(() => {
    let cancelled = false

    fetchCatalog().then(items => {
      if (cancelled) return
      setCatalogItems(items)

      if (autoLoadAttemptedRef.current || workbookRef.current) {
        setAutoLoadPending(false)
        return
      }

      const match = pickWorkbookForDeal(deal, items)

      if (match && handleReimportRef.current) {
        autoLoadAttemptedRef.current = true
        handleReimportRef.current(match).finally(() => {
          if (!cancelled) setAutoLoadPending(false)
        })
        return
      }
      setAutoLoadPending(false)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Drop file ── */
  const handleDropFile = useCallback((event) => {
    event.preventDefault()
    setIsDragOver(false)
    const file = event.dataTransfer?.files?.[0]
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xlsm'))) {
      handleFile(file)
    }
  }, [handleFile])

  /* ── Reset session ── */
  const resetSession = useCallback(() => {
    setActiveSheet('')
    setFileName('')
    setFileType('')
    setSheetNames([])
    setAllSheetNames([])
    workbookRef.current = null
    workbookDataRef.current = null
    editsRef.current = {}
    inputValueRef.current = {}
    pendingUIEditsRef.current = []
    depIndexCacheRef.current = {}
    columnDefsCacheRef.current = {}
    deletedRowsRef.current = {}
    resetCrossSheetCache()
    fetchCatalog().then(setCatalogItems)
  }, [
    workbookRef, workbookDataRef, editsRef, inputValueRef, pendingUIEditsRef,
    depIndexCacheRef, columnDefsCacheRef, deletedRowsRef, resetCrossSheetCache,
  ])

  return {
    // state
    opportunityNumber, setOpportunityNumber,
    fileName, fileType,
    isLoading, setIsLoading,
    error, setError,
    notice, setNotice,
    allSheetNames, setAllSheetNames,
    sheetNames, setSheetNames,
    sheetVisibility, setSheetVisibility,
    activeSheet, setActiveSheet,
    isDragOver, setIsDragOver,
    catalogItems,
    autoLoadPending,
    // actions
    handleFile,
    handleReimport,
    handleDropFile,
    resetSession,
  }
}
