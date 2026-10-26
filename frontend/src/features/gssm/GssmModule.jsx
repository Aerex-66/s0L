/**
 * GssmModule — s0L shell for the GSSM editor (lazy-loaded module).
 *
 * Orchestrates the shared GSSM engine (calc/, sheets/, utils/, components/,
 * hooks/ — synced with the standalone repo, see GSSM_SYNC.md) with the
 * s0L-only shell pieces in ./shell/:
 *   useGssmWorkbook   — import/reimport/auto-load/reset + file/sheet state
 *   useHeaderMetrics  — topbar hours/revenue/cost metrics + currency toggle
 *   SheetViewRouter   — per-sheet view dispatch (form/grid/timeline/pivot)
 *   GssmLanding       — drop zone + recent-workbook catalog
 *   sheetGroups       — sheet family sets + active-workbook persistence
 *
 * Props:
 *   - deal: the active s0L deal object (optional — used for context/linking)
 *   - onUpdate: callback after the deal record changes (GSSM → deal sync)
 */
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, X, Download, LogOut } from 'lucide-react'

import PivotMakerModal from './sheets/PivotMakerModal'

// Calc engine + utils
import { toA1 } from './utils/cellUtils'
import { buildSheetView } from './utils/gridHelpers'
import { getSheetDisplayName } from './utils/normalizer'

// API
import { persistEdits, exportWorkbook, cleanupExport } from './gssmApi'

// Shared engine hooks (sync boundary)
import { useRecalcEngine } from './hooks/useRecalcEngine'
import { useMacroActions, MACRO_ACTIONS } from './hooks/useMacroActions'
import { useSheetNavigation } from './hooks/useSheetNavigation'
import { useDealSync } from './hooks/useDealSync'

// s0L-only shell
import { useGssmWorkbook } from './shell/useGssmWorkbook'
import { useHeaderMetrics } from './shell/useHeaderMetrics'
import SheetViewRouter from './shell/SheetViewRouter'
import GssmLanding from './shell/GssmLanding'

// Shared deal-data layer (sync status surface)
import useDealStore from '../../shared/dealStore'

// AG Grid styles
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

// GSSM-scoped styles
import './gssm.css'

const EMPTY_ARRAY = []

function GssmModule({ deal, onUpdate }) {
  // ── Local UI state ──
  const [gssmViewMode, setGssmViewMode] = useState('form')
  const [isSolutioner, setIsSolutioner] = useState(() => {
    try { return localStorage.getItem('gssm-solutioner-mode') === 'true' } catch { return false }
  })
  const [showSheetAdmin, setShowSheetAdmin] = useState(false)
  const [columnDefs, setColumnDefs] = useState([])
  const [rowData, setRowData] = useState([])
  const [selectedCell, setSelectedCell] = useState(null)
  const [formulaInput, setFormulaInput] = useState('')
  const [metricsVersion, setMetricsVersion] = useState(0)
  const [showPivotMaker, setShowPivotMaker] = useState(false)

  // GSSM → deal sync health (set by useDealSync via the shared dealStore)
  const syncStatus = useDealStore((s) => s.syncStatus)

  // ── Refs ──
  const workbookRef = useRef(null)
  const gridApiRef = useRef(null)
  const editsRef = useRef({})
  const inputValueRef = useRef({})
  const workbookDataRef = useRef(null)
  const pendingUIEditsRef = useRef([])
  const rowDataRef = useRef(rowData)
  rowDataRef.current = rowData
  const depIndexCacheRef = useRef({})
  const columnDefsCacheRef = useRef({})
  const generatedSheetsRef = useRef({})
  const ratesOriginalRef = useRef(null)
  const deletedRowsRef = useRef({})
  const activeSheetRef = useRef('')

  const bumpMetrics = useCallback(() => setMetricsVersion(v => v + 1), [])

  // ── Recalc engine ──
  const { healValueErrors, scheduleRecalc, resetCrossSheetCache } = useRecalcEngine({
    workbookDataRef, depIndexCacheRef, pendingUIEditsRef, rowDataRef, setRowData, activeSheetRef, onMetricsChanged: bumpMetrics,
  })

  // ── handleCellEdit ──
  const handleCellEdit = useCallback((editOrEdits) => {
    const wd = workbookDataRef.current
    if (!wd) return

    const edits = Array.isArray(editOrEdits) ? editOrEdits : [editOrEdits]
    const touchedSheets = new Set()

    for (const { rowIndex, colIndex, value, sheetName: sheetNameOverride } of edits) {
      const sheet = sheetNameOverride || activeSheetRef.current
      const sheetData = wd.rowDataBySheet?.[sheet]
      if (!sheetData) continue

      if (!sheetData[rowIndex]) sheetData[rowIndex] = {}

      const colKey = `c${colIndex}`
      const oldValue = sheetData[rowIndex][colKey]
      if (edits.length === 1 && String(oldValue ?? '') === String(value ?? '')) return

      sheetData[rowIndex][colKey] = value

      if (!editsRef.current[sheet]) editsRef.current[sheet] = {}
      editsRef.current[sheet][`${rowIndex}:${colIndex}`] = value

      if (!inputValueRef.current[sheet]) inputValueRef.current[sheet] = {}
      inputValueRef.current[sheet][`${rowIndex}:${colIndex}`] = value

      pendingUIEditsRef.current.push({ sheet, rowIndex, colIndex, value })
      touchedSheets.add(sheet)
    }

    for (const sheet of touchedSheets) {
      scheduleRecalc(sheet)
    }
  }, [scheduleRecalc])

  // ── renderSheet ──
  const renderSheet = useCallback((sheetName) => {
    const wd = workbookDataRef.current
    if (!wd) return

    const sheetData = wd.rowDataBySheet?.[sheetName]
    const sheetDims = wd.dimensionsBySheet?.[sheetName]
    const sheetValidations = wd.validationsBySheet?.[sheetName]

    if (!sheetData) {
      setRowData([])
      setColumnDefs([])
      return
    }

    if (sheetName === 'Imp TL') {
      const impEndRow = wd.dimensionsBySheet?.['Imp TL']?.endRow || 0
      const minImpTlRows = Math.max(200, impEndRow + 50, sheetData.length)
      if (sheetData.length < minImpTlRows) sheetData.length = minImpTlRows
    }

    if (!columnDefsCacheRef.current[sheetName]) {
      const applyCellEdit = ({ rowIndex, colIndex, value }) => {
        handleCellEdit({ rowIndex, colIndex, value, sheetName })
      }
      const { columnDefs: colDefs } = buildSheetView(
        { results: {}, dimensions: sheetDims || { endRow: sheetData.length, endCol: 30 }, validations: sheetValidations },
        applyCellEdit
      )
      columnDefsCacheRef.current[sheetName] = colDefs
    }

    setColumnDefs(columnDefsCacheRef.current[sheetName])
    setRowData(sheetData)
    healValueErrors()
  }, [healValueErrors, handleCellEdit])

  // ── Deal ↔ GSSM data sync ──
  const { syncOnLoad } = useDealSync({
    deal, workbookDataRef, workbookRef, metricsVersion, handleCellEdit, onDealUpdated: onUpdate,
  })

  // ── Workbook lifecycle (import / reimport / auto-load / reset) ──
  const {
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
    handleFile,
    handleReimport,
    handleDropFile,
    resetSession,
  } = useGssmWorkbook({
    deal,
    workbookRef, workbookDataRef, editsRef, inputValueRef, pendingUIEditsRef,
    depIndexCacheRef, columnDefsCacheRef, deletedRowsRef,
    resetCrossSheetCache, renderSheet, bumpMetrics, syncOnLoad, setGssmViewMode,
  })
  activeSheetRef.current = activeSheet

  // ── Sheet navigation ──
  const { handleSheetChange, handleSheetVisibilityToggle } = useSheetNavigation({
    workbookDataRef, generatedSheetsRef, allSheetNames, sheetVisibility, activeSheet,
    setActiveSheet, setSheetNames, setSheetVisibility, setGssmViewMode, setSelectedCell, setFormulaInput, setError, renderSheet,
  })

  // ── Solutioner mode persistence ──
  useEffect(() => {
    try { localStorage.setItem('gssm-solutioner-mode', String(isSolutioner)) } catch { /* noop */ }
    if (!isSolutioner && gssmViewMode === 'grid') {
      setGssmViewMode(activeSheet === 'Imp TL' ? 'timeline' : 'form')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSolutioner])

  // ── AG Grid defaults ──
  const defaultColDef = useMemo(() => ({
    resizable: true, sortable: false, minWidth: 80, cellClass: 'gssm-grid-cell',
  }), [])

  const getRowId = useCallback((params) => String(params.data?.__rowIndex ?? params.rowIndex), [])

  // ── Header metrics ──
  const { headerMetrics, toggleHeaderCurrency } = useHeaderMetrics({ workbookDataRef, metricsVersion })

  // ── Row operations ──
  const handleAddRow = useCallback((sheetName) => {
    const wd = workbookDataRef.current
    if (!wd?.rowDataBySheet?.[sheetName]) return -1
    const sheetData = wd.rowDataBySheet[sheetName]
    const newRowIndex = sheetData.length
    sheetData[newRowIndex] = { __rowIndex: newRowIndex }
    setRowData([...sheetData])
    return newRowIndex
  }, [])

  const handleRemoveRow = useCallback((sheetName, rowIndex) => {
    const wd = workbookDataRef.current
    if (!wd?.rowDataBySheet?.[sheetName]) return
    const sheetData = wd.rowDataBySheet[sheetName]
    const row = sheetData[rowIndex]
    if (!row) return

    // Zero out all cell values and record blank edits for export
    for (const key of Object.keys(row)) {
      if (!key.startsWith('c')) continue
      row[key] = ''
      const colIdx = Number(key.slice(1))
      if (!editsRef.current[sheetName]) editsRef.current[sheetName] = {}
      editsRef.current[sheetName][`${rowIndex}:${colIdx}`] = ''
      pendingUIEditsRef.current.push({ sheet: sheetName, rowIndex, colIndex: colIdx, value: '' })
    }

    if (!deletedRowsRef.current[sheetName]) deletedRowsRef.current[sheetName] = new Set()
    deletedRowsRef.current[sheetName].add(rowIndex)
    setRowData([...sheetData])
    scheduleRecalc(sheetName)
  }, [scheduleRecalc])

  const handleSwapRows = useCallback((sheetName, rowIndexA, rowIndexB) => {
    const wd = workbookDataRef.current
    if (!wd?.rowDataBySheet?.[sheetName]) return
    const sheetData = wd.rowDataBySheet[sheetName]
    if (!sheetData[rowIndexA] || !sheetData[rowIndexB]) return

    const temp = { ...sheetData[rowIndexA] }
    sheetData[rowIndexA] = { ...sheetData[rowIndexB] }
    sheetData[rowIndexB] = temp

    const swapEdit = (rFrom, rTo) => {
      for (let c = 0; c < 80; c++) {
        const val = sheetData[rTo]?.[`c${c}`]
        if (val !== undefined) {
          if (!editsRef.current[sheetName]) editsRef.current[sheetName] = {}
          editsRef.current[sheetName][`${rTo}:${c}`] = val
        }
      }
    }
    swapEdit(rowIndexA, rowIndexB)
    swapEdit(rowIndexB, rowIndexA)

    setRowData([...sheetData])
    scheduleRecalc(sheetName)
  }, [scheduleRecalc])

  const handleAddStaffingRow = useCallback(() => handleAddRow('Staffing'), [handleAddRow])
  const handleRemoveStaffingRow = useCallback((rowIndex) => handleRemoveRow('Staffing', rowIndex), [handleRemoveRow])
  const handleSwapStaffingRows = useCallback((rowA, rowB) => handleSwapRows('Staffing', rowA, rowB), [handleSwapRows])

  // ── Formula bar ──
  const handleFormulaSubmit = useCallback(() => {
    if (!selectedCell) return
    const { row, col } = selectedCell
    const sheet = activeSheetRef.current
    const wd = workbookDataRef.current
    if (!wd) return

    const sheetFormulas = wd.formulasBySheet?.[sheet]
    if (Array.isArray(sheetFormulas) && sheetFormulas.some(f => (f.row - 1) === row && (f.col - 1) === col)) return

    handleCellEdit({ rowIndex: row, colIndex: col, value: formulaInput, sheetName: sheet })
  }, [selectedCell, formulaInput, handleCellEdit])

  const handleSelectionChanged = useCallback((event) => {
    if (!event.column) return
    const colId = event.column.getColId()
    const colIndex = Number(colId.replace('c', ''))
    const rowIndex = event.rowIndex
    setSelectedCell({ row: rowIndex, col: colIndex })

    const sheet = activeSheetRef.current
    const wd = workbookDataRef.current
    const sheetData = wd?.rowDataBySheet?.[sheet]
    const cellValue = sheetData?.[rowIndex]?.[colId]
    setFormulaInput(cellValue != null ? String(cellValue) : '')
  }, [])

  // ── collectEdits ──
  const collectEdits = useCallback(() => {
    const result = []
    for (const [sheet, cells] of Object.entries(editsRef.current)) {
      const deletedSet = deletedRowsRef.current[sheet]
      for (const [key, value] of Object.entries(cells)) {
        const [rowStr, colStr] = key.split(':')
        const rowIndex = Number(rowStr)
        if (deletedSet && deletedSet.has(rowIndex)) continue
        result.push({ sheet, row: rowIndex, col: Number(colStr), value })
      }
    }
    return result
  }, [])

  const collectCellFills = useCallback(() => [], [])

  // ── Generated sheets ──
  const handleAddGeneratedSheet = useCallback(({ name, grid, colCount, rowCount, headerRowEnd, dataColStart }) => {
    generatedSheetsRef.current[name] = { grid, colCount, rowCount, headerRowEnd, dataColStart }
    if (!sheetNames.includes(name)) {
      setSheetNames((prev) => [...prev, name])
      setAllSheetNames((prev) => prev.includes(name) ? prev : [...prev, name])
    }
    setActiveSheet(name)
    setGssmViewMode('form')
  }, [sheetNames, setSheetNames, setAllSheetNames, setActiveSheet])

  // ── Export ──
  const handleExport = async () => {
    if (!workbookRef.current) return

    if (gridApiRef.current && !gridApiRef.current.isDestroyed()) {
      gridApiRef.current.stopEditing()
    }
    handleFormulaSubmit()
    setError('')
    setIsLoading(true)

    try {
      const edits = collectEdits()
      const cellFills = collectCellFills()
      const generatedSheets = Object.entries(generatedSheetsRef.current).map(([name, gd]) => ({
        name, grid: gd.grid,
      }))

      const { outputPath, tempRoot, rejectedCount } = await exportWorkbook(
        workbookRef.current?.workbookId, edits, cellFills, generatedSheets
      )

      if (rejectedCount > 0) {
        console.warn(`GSSM export: ${rejectedCount} edit(s) rejected.`)
      }

      // Browser download
      if (outputPath) {
        const rawName = (fileName || 'workbook.xlsm').replace(/\.[^.]+$/, '')
        const extension = fileType === 'xlsm' ? 'xlsm' : 'xlsx'
        const downloadName = `${rawName}.${extension}`

        try {
          const GSSM_API_BASE = import.meta.env.VITE_GSSM_API_URL || '/gssm-api'
          const dlResponse = await fetch(`${GSSM_API_BASE}/api/spreadsheet/download?path=${encodeURIComponent(outputPath)}`)
          if (dlResponse.ok) {
            const blob = await dlResponse.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = downloadName
            a.click()
            URL.revokeObjectURL(url)
          }
        } catch {
          setNotice('Export complete. File saved on server.')
        }
      }

      cleanupExport(tempRoot)
      persistEdits(workbookRef.current?.workbookId, edits).catch(() => {})
    } catch (err) {
      console.error('GSSM export failed:', err)
      setError(err.message || 'Export failed unexpectedly.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Macro actions ──
  const { macroMenuOpen, setMacroMenuOpen, runningMacro, macroMenuRef, handleRunMacro } = useMacroActions({
    workbookRef, workbookDataRef, editsRef, inputValueRef, pendingUIEditsRef, activeSheetRef,
    ratesOriginalRef, gridApiRef, generatedSheetsRef, fileName, fileType,
    scheduleRecalc, setActiveSheet, setGssmViewMode, setError, setNotice, setShowPivotMaker,
    setIsLoading, collectEdits, collectCellFills, handleFormulaSubmit,
  })

  const activeFormulas = workbookDataRef.current?.formulasBySheet?.[activeSheet] || EMPTY_ARRAY

  // ── Render ──
  return (
    <div className="gssm-module">
      {/* Header */}
      <header className="gssm-topbar">
        <div className="gssm-topbar-main">
          <div className="gssm-topbar-left">
            <span className="gssm-topbar-wordmark">GSSM</span>
            {activeSheet && opportunityNumber && (
              <span className="gssm-topbar-opp">OPP-{opportunityNumber}</span>
            )}
          </div>

          {headerMetrics && (
            <div className="gssm-topbar-center">
              <div className="gssm-metric"><span className="gssm-metric-label">Hours</span><span className="gssm-metric-val">{Math.round(headerMetrics.hours).toLocaleString()}</span></div>
              <span className="gssm-div" />
              <div className="gssm-metric"><span className="gssm-metric-label">Man-Days</span><span className="gssm-metric-val">{Math.round(headerMetrics.manDays).toLocaleString()}</span></div>
              <span className="gssm-div" />
              <div className="gssm-metric"><span className="gssm-metric-label gssm-currency" onClick={toggleHeaderCurrency}>Revenue ({headerMetrics.displayCurrency})</span><span className="gssm-metric-val">${headerMetrics.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
              <span className="gssm-div" />
              <div className="gssm-metric"><span className="gssm-metric-label gssm-currency" onClick={toggleHeaderCurrency}>Cost ({headerMetrics.displayCurrency})</span><span className="gssm-metric-val">${headerMetrics.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
              <span className="gssm-div" />
              <div className="gssm-metric"><span className="gssm-metric-label gssm-currency" onClick={toggleHeaderCurrency}>Blended ({headerMetrics.displayCurrency})</span><span className="gssm-metric-val">${headerMetrics.blended.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="gssm-metric-unit">/hr</span></span></div>
            </div>
          )}

          <div className="gssm-topbar-right">
            <button type="button" className={`gssm-mode-btn${isSolutioner ? ' gssm-mode-btn--on' : ''}`} onClick={() => setIsSolutioner(p => !p)}>
              Solutioner
            </button>
            {activeSheet && (
              <div className="gssm-macro-wrap" ref={macroMenuRef}>
                <button type="button" className="gssm-btn gssm-btn--ghost" onClick={() => setMacroMenuOpen(p => !p)} disabled={!!runningMacro}>
                  {runningMacro ? 'Running…' : <><span>Actions</span><ChevronDown size={13} style={{ marginLeft: 4, transform: macroMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} /></>}
                </button>
                {macroMenuOpen && (
                  <motion.div className="gssm-macro-dropdown" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12 }}>
                    {MACRO_ACTIONS.filter(a => !a.hidden && a.sheet === activeSheet).length > 0 && (
                      <>
                        <div className="gssm-macro-section">This sheet</div>
                        {MACRO_ACTIONS.filter(a => !a.hidden && a.sheet === activeSheet).map(action => (
                          <button key={action.id} type="button" className="gssm-macro-item" onClick={() => handleRunMacro(action)} disabled={!!runningMacro} title={action.description}>{action.label}</button>
                        ))}
                      </>
                    )}
                    <div className="gssm-macro-section">All actions</div>
                    {MACRO_ACTIONS.filter(a => !a.hidden && a.sheet !== activeSheet).map(action => (
                      <button key={action.id} type="button" className="gssm-macro-item" onClick={() => handleRunMacro(action)} disabled={!!runningMacro} title={action.description}>
                        <span>{action.label}</span><span className="gssm-macro-sheet">{action.sheet}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            )}
            {activeSheet && (
              <button type="button" className="gssm-btn gssm-btn--accent" onClick={handleExport}>
                <Download size={14} style={{ marginRight: 4 }} />Export
              </button>
            )}
          </div>
        </div>

        {fileName && (
          <div className="gssm-topbar-row2">
            <span className="gssm-file-label">{fileName}</span>
            {deal?.id && syncStatus.state !== 'idle' && (
              <span className={`gssm-sync-chip gssm-sync-chip--${syncStatus.state}`} title={syncStatus.message || `Deal sync: ${syncStatus.state}`}>
                {syncStatus.state === 'syncing' ? 'Syncing…'
                  : syncStatus.state === 'ok' ? 'Deal synced'
                  : 'Sync failed'}
              </span>
            )}
            <button type="button" className="gssm-exit-btn" onClick={() => { if (window.confirm('Return to GSSM home? Unsaved edits will be lost.')) resetSession() }}><LogOut size={12} style={{ marginRight: 4 }} />Exit</button>
          </div>
        )}
      </header>

      {/* Main */}
      <main className="gssm-main">
        {(isLoading || autoLoadPending) && (
          <div className="gssm-loading"><div className="gssm-spinner" /><p>Loading workbook…</p></div>
        )}

        <AnimatePresence>
          {error && <motion.div className="gssm-alert" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>{error}<button className="gssm-alert-x" onClick={() => setError('')}><X size={14} /></button></motion.div>}
        </AnimatePresence>
        <AnimatePresence>
          {notice && <motion.div className="gssm-alert gssm-alert--ok" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>{notice}<button className="gssm-alert-x" onClick={() => setNotice('')}><X size={14} /></button></motion.div>}
        </AnimatePresence>

        {/* Landing */}
        {!activeSheet && !isLoading && !autoLoadPending && (
          <GssmLanding
            isDragOver={isDragOver}
            setIsDragOver={setIsDragOver}
            onDropFile={handleDropFile}
            onFile={handleFile}
            catalogItems={catalogItems}
            onReimport={handleReimport}
          />
        )}

        {/* Sheet editor */}
        {activeSheet && (
          <>
            <nav className="gssm-sheet-bar">
              <div className="gssm-tabs-scroll">
                {sheetNames.map(sheet => (
                  <button key={sheet} type="button" className={`gssm-tab${sheet === activeSheet ? ' gssm-tab--active' : ''}${generatedSheetsRef.current[sheet] ? ' gssm-tab--gen' : ''}`} onClick={() => handleSheetChange(sheet)}>
                    {generatedSheetsRef.current[sheet] ? `✦ ${sheet}` : getSheetDisplayName(sheet)}
                  </button>
                ))}
                {activeSheet && !sheetNames.includes(activeSheet) && (
                  <button type="button" className="gssm-tab gssm-tab--active" onClick={() => { setActiveSheet(sheetNames[0] || ''); if (sheetNames[0]) renderSheet(sheetNames[0]) }}>
                    {getSheetDisplayName(activeSheet)} <X size={12} style={{ marginLeft: 4, opacity: 0.6 }} />
                  </button>
                )}
              </div>
              {isSolutioner && (
                <button type="button" className="gssm-btn gssm-btn--sm" onClick={() => setShowSheetAdmin(p => !p)}>
                  {showSheetAdmin ? 'Done' : 'Sheets'}
                </button>
              )}
              {isSolutioner && <span className="gssm-bar-div" />}
              {isSolutioner && (
                <button type="button" className={`gssm-bar-action${gssmViewMode === 'grid' ? ' gssm-bar-action--on' : ''}`} onClick={() => setGssmViewMode(gssmViewMode === 'grid' ? 'form' : 'grid')}>Grid</button>
              )}
              {workbookDataRef.current?.rowDataBySheet?.['Staffing'] && <span className="gssm-bar-div" />}
              {workbookDataRef.current?.rowDataBySheet?.['Staffing'] && (
                <button type="button" className={`gssm-bar-action${gssmViewMode === 'pivot' ? ' gssm-bar-action--on' : ''}`} onClick={() => setGssmViewMode(gssmViewMode === 'pivot' ? 'form' : 'pivot')}>Pivots</button>
              )}
            </nav>

            {isSolutioner && showSheetAdmin && (
              <div className="gssm-sheet-admin">
                {allSheetNames.map(sheet => (
                  <label key={sheet} className="gssm-admin-check">
                    <input type="checkbox" checked={sheetVisibility[sheet] !== false} onChange={e => handleSheetVisibilityToggle(sheet, e.target.checked)} />
                    {sheet}
                  </label>
                ))}
              </div>
            )}

            {gssmViewMode === 'grid' && (
              <div className="gssm-formula-bar">
                <span className="gssm-formula-ref">{selectedCell ? toA1(selectedCell.row, selectedCell.col) : '\u2014'}</span>
                <input className="gssm-formula-input" value={formulaInput} onChange={e => setFormulaInput(e.target.value)} onBlur={handleFormulaSubmit} placeholder="Enter value" />
                {isLoading && <span className="gssm-recalc-badge">Recalc</span>}
              </div>
            )}

            <section className="gssm-sheet-content">
              <SheetViewRouter
                activeSheet={activeSheet}
                gssmViewMode={gssmViewMode}
                isSolutioner={isSolutioner}
                rowData={rowData}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                getRowId={getRowId}
                gridApiRef={gridApiRef}
                onSelectionChanged={handleSelectionChanged}
                onCellEdit={handleCellEdit}
                workbookDataRef={workbookDataRef}
                generatedSheetsRef={generatedSheetsRef}
                deletedRowsRef={deletedRowsRef}
                activeFormulas={activeFormulas}
                onOpportunityChange={v => setOpportunityNumber(String(v || '').trim())}
                onAddStaffingRow={handleAddStaffingRow}
                onRemoveStaffingRow={handleRemoveStaffingRow}
                onSwapStaffingRows={handleSwapStaffingRows}
              />
            </section>
          </>
        )}
      </main>

      {showPivotMaker && (
        <PivotMakerModal workbookDataRef={workbookDataRef} onClose={() => setShowPivotMaker(false)} onAddSheet={handleAddGeneratedSheet} />
      )}

      <footer className="gssm-footer">
        {activeSheet && (
          <label className="gssm-btn gssm-btn--ghost gssm-reimport-label">
            Re-import
            <input type="file" accept=".xlsx,.xlsm" hidden onClick={e => { if (!window.confirm('Replace current session? Unsaved edits will be lost.')) e.preventDefault() }} onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        )}
      </footer>
    </div>
  )
}

export default memo(GssmModule)
