/**
 * useMacroActions — in-app macro action handlers.
 *
 * Owns: MACRO_ACTIONS array, handleRunMacro, ensureRatesOriginal,
 *       and all per-action logic (forex-gpe, forex-spot, rates-*, pivot-maker, etc.).
 * Pure organizational extraction — zero behavioral changes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { persistEdits } from '../gssmApi'

const MACRO_ACTIONS = [
  // ── In-app actions (no Excel needed) ──
  { id: 'pivot-maker', label: 'PivotMaker', macro: 'FillUniquePivots', description: 'Generate pivot tables from PivotInfo definitions (in-app)', sheet: 'Home' },
  { id: 'refresh-pivots', label: 'Refresh All Pivots', macro: 'RefreshAllPivots', description: 'View live pivot tables from Staffing data (in-app)', sheet: 'Staffing' },

  // ── Hidden: redundant (app recalculates live) ──
  { id: 'bid-metrics', label: 'Refresh', macro: 'BidMetrics_Button1_Click', description: 'Refresh Bid Metrics pivot', sheet: 'Bid Metrics', hidden: true },
  { id: 'recalibrate-pivot', label: 'Recalibrate Pivot', macro: 'RecalibrateGPEPivot', description: 'Recalibrate GPE pivot table', sheet: 'PTI_Estimator', hidden: true },
  { id: 'isbd-pivots', label: 'Refresh pivots', macro: 'Button1_Click', description: 'Refresh iSBD summary pivot tables', sheet: 'iSBD Summary', hidden: true },

  // ── Hidden: Excel-only (require COM/VBA automation) ──
  { id: 'phase-convert', label: 'Click to Split Staffing by Phases Defined Here', macro: 'PhaseConvert', description: 'Run phase conversion logic on staffing', sheet: 'Effort Matrix', hidden: true },
  { id: 'forex-spot', label: 'Get Spot Rates (Yahoo! Finance)', macro: 'NormalRefresh', description: 'Fetch live spot rates from Yahoo Finance into Forex (in-app)', sheet: 'Forex' },
  { id: 'forex-gpe', label: 'Set Rates to GPE Assumptions', macro: 'SetToGPEForex', description: 'Copy GPE assumption rates into the spot column (in-app)', sheet: 'Forex' },
  { id: 'isbd-slides', label: 'Generate iSBD slides', macro: 'CopyRangeToPPT', description: 'Generate iSBD PowerPoint slides', sheet: 'iSBD Summary', hidden: true },
  { id: 'pmp-test', label: 'Test fast', macro: 'TestPMP', description: 'Quick test PMP template', sheet: 'PMP Template', hidden: true },
  { id: 'pmp-export', label: 'Export to PMP', macro: 'SelectAndCopy', description: 'Export selection to PMP', sheet: 'PMP Template', hidden: true },
  { id: 'pmp-fillup', label: 'Fillup Template', macro: 'Button5_Click', description: 'Auto-fill PMP template fields', sheet: 'PMP Template', hidden: true },
  { id: 'pmp-clear', label: 'Clear ALL', macro: 'Button6_Click', description: 'Clear all PMP template data', sheet: 'PMP Template', hidden: true },
  { id: 'pmp-link', label: 'PMP (Box) Link', macro: 'OpenUrl', description: 'Open PMP Box link', sheet: 'PMP Template', hidden: true },
  { id: 'jrs-band', label: 'Input a Band', macro: 'LoadBandForm', description: 'Open band input form', sheet: 'JRS', hidden: true },
  { id: 'jrs-petnext', label: 'Import PetNext', macro: 'ImportPetNextData', description: 'Import PetNext data into JRS', sheet: 'JRS', hidden: true },
  { id: 'jrs-find', label: 'Find JRS', macro: 'Find_JRS', description: 'Search JRS role catalog', sheet: 'JRS', hidden: true },
  { id: 'rates-snapshot', label: 'Take Snapshot', macro: 'yrRateCopy', description: 'Snapshot current Base Cost Rates for comparison (in-app)', sheet: 'Rates' },
  { id: 'rates-update', label: 'Update Rates', macro: 'copypasteRate', description: 'Apply Rates Adjustment multiplier to Base Cost Rates (in-app)', sheet: 'Rates' },
  { id: 'rates-reset', label: 'Reset Rates', macro: 'resetRates', description: 'Reset Base Cost Rates and Adders to original imported values (in-app)', sheet: 'Rates' },
  { id: 'import-rates', label: 'Import IBM Bands and Rates', macro: 'ImportRates', description: 'Import band/rate data from IBM source', sheet: 'Rates', hidden: true },
  { id: 'copy-gssm', label: 'Copy GSSM', macro: 'CopyFile', description: 'Create a copy of the GSSM workbook', sheet: 'Home', hidden: true },
  { id: 'upload-cloud', label: 'Upload GSSM to Cloud', macro: 'GSSMUpload', description: 'Upload workbook to cloud storage', sheet: 'Cloud', hidden: true },
]

export { MACRO_ACTIONS }

export function useMacroActions({
  workbookRef,
  workbookDataRef,
  editsRef,
  inputValueRef,
  pendingUIEditsRef,
  activeSheetRef,
  ratesOriginalRef,
  gridApiRef,
  generatedSheetsRef,
  fileName,
  fileType,
  scheduleRecalc,
  setActiveSheet,
  setGssmViewMode,
  setError,
  setNotice,
  setShowPivotMaker,
  setIsLoading,
  collectEdits,
  collectCellFills,
  handleFormulaSubmit,
}) {
  const [macroMenuOpen, setMacroMenuOpen] = useState(false)
  const [runningMacro, setRunningMacro] = useState(null)
  const macroMenuRef = useRef(null)

  useEffect(() => {
    if (!macroMenuOpen) return
    const handleClickOutside = (e) => {
      if (macroMenuRef.current && !macroMenuRef.current.contains(e.target)) {
        setMacroMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [macroMenuOpen])

  const ensureRatesOriginal = () => {
    if (ratesOriginalRef.current) return true
    const ratesRows = workbookDataRef.current?.rowDataBySheet?.['Rates']
    if (!ratesRows || ratesRows.length < 10) {
      setError('No Rates data loaded. Import a workbook first.')
      return false
    }
    const col24 = []
    const col25 = []
    for (let r = 0; r < ratesRows.length; r++) {
      col24[r] = ratesRows[r]?.c24
      col25[r] = ratesRows[r]?.c25
    }
    ratesOriginalRef.current = { col24, col25 }
    return true
  }

  const handleRunMacro = useCallback(async (macroAction) => {
    setMacroMenuOpen(false)

    if (macroAction.id === 'refresh-pivots') {
      if (!workbookDataRef.current?.rowDataBySheet?.['Staffing']) {
        setError('No Staffing data loaded. Import a workbook first.')
        return
      }
      setGssmViewMode('pivot')
      return
    }

    if (macroAction.id === 'pivot-maker') {
      if (!workbookDataRef.current?.rowDataBySheet?.['PivotInfo']) {
        setError('No PivotInfo sheet found. This workbook has no pivot definitions.')
        return
      }
      if (!workbookDataRef.current?.rowDataBySheet?.['Staffing']) {
        setError('No Staffing data loaded. Import a workbook first.')
        return
      }
      setShowPivotMaker(true)
      return
    }

    if (macroAction.id === 'forex-gpe') {
      const forexRows = workbookDataRef.current?.rowDataBySheet?.['Forex']
      if (!forexRows || forexRows.length < 2) {
        setError('No Forex data loaded. Import a workbook first.')
        return
      }
      if (!editsRef.current['Forex']) editsRef.current['Forex'] = {}
      if (!inputValueRef.current['Forex']) inputValueRef.current['Forex'] = {}
      let count = 0
      for (let r = 1; r < forexRows.length; r++) {
        const row = forexRows[r]
        const gpeRate = row?.c5
        if (gpeRate == null || gpeRate === '') continue
        const numRate = typeof gpeRate === 'number' ? gpeRate : parseFloat(gpeRate)
        if (isNaN(numRate)) continue
        editsRef.current['Forex'][`${r}:3`] = numRate
        if (!inputValueRef.current['Forex'][r]) inputValueRef.current['Forex'][r] = {}
        inputValueRef.current['Forex'][r][3] = numRate
        if (workbookDataRef.current.rowDataBySheet['Forex'][r]) {
          workbookDataRef.current.rowDataBySheet['Forex'][r] = {
            ...workbookDataRef.current.rowDataBySheet['Forex'][r],
            c3: numRate,
          }
        }
        pendingUIEditsRef.current.push({ rowIndex: r, colIndex: 3, value: numRate })
        count++
      }
      if (count > 0) scheduleRecalc('Forex')
      setNotice(`GPE assumption rates applied to ${count} currencies.`)
      if (activeSheetRef.current !== 'Forex') {
        setActiveSheet('Forex')
        setGssmViewMode('form')
      }
      return
    }

    if (macroAction.id === 'forex-spot') {
      const forexRows = workbookDataRef.current?.rowDataBySheet?.['Forex']
      if (!forexRows || forexRows.length < 2) {
        setError('No Forex data loaded. Import a workbook first.')
        return
      }
      const currencies = []
      const rowMap = {}
      for (let r = 1; r < forexRows.length; r++) {
        const code = forexRows[r]?.c2
        if (!code || typeof code !== 'string' || code.length !== 3) continue
        if (code === 'USD') continue
        if (!rowMap[code]) {
          rowMap[code] = []
          currencies.push(code)
        }
        rowMap[code].push(r)
      }
      if (currencies.length === 0) {
        setError('No valid currency codes found in Forex sheet.')
        return
      }
      setRunningMacro('forex-spot')
      setError('')
      try {
        const resp = await fetch(`/api/forex/spot-rates?currencies=${currencies.join(',')}`)
        if (!resp.ok) throw new Error(`Server returned ${resp.status}`)
        const { rates } = await resp.json()
        if (!editsRef.current['Forex']) editsRef.current['Forex'] = {}
        if (!inputValueRef.current['Forex']) inputValueRef.current['Forex'] = {}
        let count = 0
        for (const [code, rate] of Object.entries(rates)) {
          const rows = rowMap[code]
          if (!rows) continue
          for (const r of rows) {
            editsRef.current['Forex'][`${r}:3`] = rate
            if (!inputValueRef.current['Forex'][r]) inputValueRef.current['Forex'][r] = {}
            inputValueRef.current['Forex'][r][3] = rate
            if (workbookDataRef.current.rowDataBySheet['Forex'][r]) {
              workbookDataRef.current.rowDataBySheet['Forex'][r] = {
                ...workbookDataRef.current.rowDataBySheet['Forex'][r],
                c3: rate,
              }
            }
            pendingUIEditsRef.current.push({ rowIndex: r, colIndex: 3, value: rate })
            count++
          }
        }
        if (rowMap['USD']) {
          for (const r of rowMap['USD']) {
            editsRef.current['Forex'][`${r}:3`] = 1
            pendingUIEditsRef.current.push({ rowIndex: r, colIndex: 3, value: 1 })
          }
        }
        if (count > 0) scheduleRecalc('Forex')
        const failed = currencies.length - Object.keys(rates).length
        setNotice(`Spot rates updated for ${count} cells.${failed > 0 ? ` (${failed} currencies unavailable)` : ''}`)
        if (activeSheetRef.current !== 'Forex') {
          setActiveSheet('Forex')
          setGssmViewMode('form')
        }
      } catch (err) {
        setError(`Failed to fetch spot rates: ${err.message}`)
      } finally {
        setRunningMacro(null)
      }
      return
    }

    // ── Rates actions ──
    if (macroAction.id === 'rates-reset') {
      if (!ensureRatesOriginal()) return
      const ratesRows = workbookDataRef.current?.rowDataBySheet?.['Rates']
      const orig = ratesOriginalRef.current
      if (!editsRef.current['Rates']) editsRef.current['Rates'] = {}
      if (!inputValueRef.current['Rates']) inputValueRef.current['Rates'] = {}
      let count = 0
      for (let r = 9; r < ratesRows.length; r++) {
        const origVal24 = orig.col24[r]
        const origVal25 = orig.col25[r]
        const cur24 = ratesRows[r]?.c24
        const cur25 = ratesRows[r]?.c25
        if (cur24 !== origVal24 && origVal24 != null) {
          editsRef.current['Rates'][`${r}:24`] = origVal24
          if (!inputValueRef.current['Rates'][r]) inputValueRef.current['Rates'][r] = {}
          inputValueRef.current['Rates'][r][24] = origVal24
          workbookDataRef.current.rowDataBySheet['Rates'][r] = {
            ...workbookDataRef.current.rowDataBySheet['Rates'][r],
            c24: origVal24,
          }
          pendingUIEditsRef.current.push({ rowIndex: r, colIndex: 24, value: origVal24 })
          count++
        }
        if (cur25 !== origVal25 && origVal25 != null) {
          editsRef.current['Rates'][`${r}:25`] = origVal25
          if (!inputValueRef.current['Rates'][r]) inputValueRef.current['Rates'][r] = {}
          inputValueRef.current['Rates'][r][25] = origVal25
          workbookDataRef.current.rowDataBySheet['Rates'][r] = {
            ...workbookDataRef.current.rowDataBySheet['Rates'][r],
            c25: origVal25,
          }
          pendingUIEditsRef.current.push({ rowIndex: r, colIndex: 25, value: origVal25 })
          count++
        }
      }
      if (count > 0) scheduleRecalc('Rates')
      setNotice(count > 0 ? `Rates reset: ${count} cells restored to original values.` : 'Rates are already at original values.')
      if (activeSheetRef.current !== 'Rates') {
        setActiveSheet('Rates')
        setGssmViewMode('form')
      }
      return
    }

    if (macroAction.id === 'rates-snapshot') {
      ensureRatesOriginal()
      const ratesRows = workbookDataRef.current?.rowDataBySheet?.['Rates']
      if (!ratesRows || ratesRows.length < 10) {
        setError('No Rates data loaded. Import a workbook first.')
        return
      }
      const snapshot = []
      let count = 0
      for (let r = 9; r < ratesRows.length; r++) {
        const val = ratesRows[r]?.c24
        if (val != null && val !== '' && !isNaN(Number(val))) {
          snapshot[r] = val
          count++
        }
      }
      ratesOriginalRef.current = {
        ...ratesOriginalRef.current,
        snapshot,
        snapshotDate: new Date().toLocaleString(),
      }
      setError(`Snapshot taken: ${count} rate values saved at ${ratesOriginalRef.current.snapshotDate}.`)
      return
    }

    if (macroAction.id === 'rates-update') {
      if (!ensureRatesOriginal()) return
      const ratesRows = workbookDataRef.current?.rowDataBySheet?.['Rates']
      const adjRows = workbookDataRef.current?.rowDataBySheet?.['Rates Adjustment']
      if (!adjRows || adjRows.length < 3) {
        setError('No Rates Adjustment data found. Import a workbook first.')
        return
      }
      const ratio = Number(adjRows[2]?.c2)
      if (!ratio || isNaN(ratio) || ratio <= 0) {
        setError(`Invalid adjustment ratio in Rates Adjustment C3: ${adjRows[2]?.c2}. Cannot update rates.`)
        return
      }
      if (!editsRef.current['Rates']) editsRef.current['Rates'] = {}
      if (!inputValueRef.current['Rates']) inputValueRef.current['Rates'] = {}
      let count = 0
      for (let r = 9; r < ratesRows.length; r++) {
        const curRate = ratesRows[r]?.c24
        if (curRate == null || curRate === '') continue
        const num = typeof curRate === 'number' ? curRate : parseFloat(curRate)
        if (isNaN(num) || num === 0) continue
        const newRate = Math.round(num * ratio * 100) / 100
        editsRef.current['Rates'][`${r}:24`] = newRate
        if (!inputValueRef.current['Rates'][r]) inputValueRef.current['Rates'][r] = {}
        inputValueRef.current['Rates'][r][24] = newRate
        workbookDataRef.current.rowDataBySheet['Rates'][r] = {
          ...workbookDataRef.current.rowDataBySheet['Rates'][r],
          c24: newRate,
        }
        pendingUIEditsRef.current.push({ rowIndex: r, colIndex: 24, value: newRate })
        count++
      }
      if (count > 0) scheduleRecalc('Rates')
      setNotice(`Rates updated: ${count} base cost rates multiplied by ${ratio.toFixed(4)}.`)
      if (activeSheetRef.current !== 'Rates') {
        setActiveSheet('Rates')
        setGssmViewMode('form')
      }
      return
    }

    // ── Excel COM macro fallback ──
    if (!window.electronAPI?.runExcelMacro) {
      setError('Macro execution requires the desktop app (Electron).')
      return
    }

    if (!workbookRef.current) {
      setError('No workbook loaded.')
      return
    }

    setRunningMacro(macroAction.id)
    setError('')

    try {
      if (gridApiRef.current && !gridApiRef.current.isDestroyed()) {
        gridApiRef.current.stopEditing()
      }
      handleFormulaSubmit()

      const edits = collectEdits()
      const cellFills = collectCellFills()
      const rawName = (fileName || 'workbook.xlsm').replace(/\.[^.]+$/, '')
      const extension = fileType === 'xlsm' ? 'xlsm' : 'xlsx'
      const targetName = `${rawName}.${extension}`

      const response = await fetch('/api/spreadsheet/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workbookId: workbookRef.current?.workbookId,
          edits,
          cellFills,
          generatedSheets: Object.entries(generatedSheetsRef.current).map(([name, gd]) => ({ name, grid: gd.grid })),
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error || 'Export failed before macro run.')
        return
      }

      const { outputPath } = await response.json()

      let finalPath = outputPath
      if (window.electronAPI?.copyFile) {
        const copyResult = await window.electronAPI.copyFile({
          sourcePath: outputPath,
          name: targetName,
        })
        if (copyResult?.canceled) {
          setRunningMacro(null)
          return
        }
        finalPath = copyResult?.filePath || outputPath
      }

      const result = await window.electronAPI.runExcelMacro({
        xlsmPath: finalPath,
        macroName: macroAction.macro,
        visible: true,
      })

      if (!result.ok) {
        setError(`Macro "${macroAction.label}" failed: ${result.error}`)
      }

      persistEdits(workbookRef.current?.workbookId, edits).catch(() => {})
    } catch (err) {
      console.error('Macro run failed:', err)
      setError(err.message || 'Macro execution failed unexpectedly.')
    } finally {
      setRunningMacro(null)
    }
  }, [
    workbookRef, workbookDataRef, editsRef, inputValueRef, pendingUIEditsRef,
    activeSheetRef, ratesOriginalRef, gridApiRef, generatedSheetsRef,
    fileName, fileType, scheduleRecalc,
    setActiveSheet, setGssmViewMode, setError, setNotice, setShowPivotMaker, setIsLoading,
    collectEdits, collectCellFills, handleFormulaSubmit,
  ])

  return { MACRO_ACTIONS, macroMenuOpen, setMacroMenuOpen, runningMacro, macroMenuRef, handleRunMacro }
}
