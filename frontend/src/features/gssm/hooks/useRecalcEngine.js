/**
 * useRecalcEngine — formula recalculation orchestration.
 *
 * Owns: healValueErrors, runRecalcForSheet, applyRecalcToRowData, scheduleRecalc.
 * Reads/writes workbookDataRef and depIndexCacheRef (passed in).
 * Pure organizational extraction — zero behavioral changes.
 */
import { useCallback, useRef } from 'react'
import { recalcFormulas } from '../calc/universalFormulaCalc'
import { buildDependencyIndex, getAffectedFormulas } from '../calc/formulaDeps'
import { formatCellValue, findStaffingLayout } from '../utils/cellUtils'

const ERROR_RE = /^#(VALUE|REF|NAME|NULL|NUM|DIV\/0|N\/A)[!?]?$/i

// Cache: for each (otherSheet → activeSheet), store the pre-filtered formula indices
// that reference activeSheet. Built once, reused on every edit.
const crossSheetCache = new Map() // key: `${otherSheet}→${activeSheet}` → formulaIndex[]

export function useRecalcEngine({ workbookDataRef, depIndexCacheRef, pendingUIEditsRef, rowDataRef, setRowData, activeSheetRef, onMetricsChanged }) {

  /**
   * Patch PTI_Estimator rows that depend on GETPIVOTDATA by computing
   * the aggregated values directly from Staffing resource rows.
   * The pivot table is a binary Excel structure we can't refresh,
   * so we replicate the "Recalibrate Pivot" macro logic here.
   */
  const patchPTIFromStaffing = useCallback(() => {
    const meta = workbookDataRef.current
    if (!meta?.rowDataBySheet) return

    const ptiRows = meta.rowDataBySheet['PTI_Estimator']
    const staffingRows = meta.rowDataBySheet['Staffing']
    if (!ptiRows || !staffingRows) return

    // Detect header row dynamically
    const { headerRow, dataStartRow } = findStaffingLayout(staffingRows)
    const hdrRow = staffingRows[headerRow] || {}
    let colFees = -1, colLaborCost = -1, colRevApp = -1
    for (let c = 0; c < 80; c++) {
      const v = String(hdrRow[`c${c}`] || '').trim()
      if (v === 'Fees') colFees = c
      else if (v === 'Labor Cost') colLaborCost = c
      else if (v === 'Rev App') colRevApp = c
    }
    if (colFees < 0) colFees = 44
    if (colLaborCost < 0) colLaborCost = 41
    if (colRevApp < 0) colRevApp = 40

    // Sum per-resource totals (data starts after header)
    let totalFees = 0, totalLaborCost = 0, totalRevApp = 0
    for (let i = dataStartRow; i < staffingRows.length; i++) {
      const row = staffingRows[i]
      if (!row) continue
      totalFees += Number(row[`c${colFees}`]) || 0
      totalLaborCost += Number(row[`c${colLaborCost}`]) || 0
      totalRevApp += Number(row[`c${colRevApp}`]) || 0
    }

    // PTI row 30 (sparse [29].c1) = Services Revenue = Sum of Fees
    if (ptiRows[29]) {
      ptiRows[29] = { ...ptiRows[29], c1: formatCellValue(totalFees) }
    }

    // PTI row 31 (sparse [30].c1) = Labor Cost = Sum of Labor Cost
    const aligned = ptiRows[26]?.c1
    if (aligned === '1' || aligned === 'TRUE' || aligned === 1 || aligned === true) {
      if (ptiRows[30]) {
        ptiRows[30] = { ...ptiRows[30], c1: formatCellValue(totalLaborCost) }
      }
    }

    // PTI row 37 (sparse [36].c1) = Rev App % = Sum of Rev App / Revenue
    const revAppPct = totalFees > 0 ? totalRevApp / totalFees : 0
    if (ptiRows[36]) {
      ptiRows[36] = { ...ptiRows[36], c1: formatCellValue(revAppPct) }
    }

    // PTI row 38 (sparse [37].c1) = Rev App = Rev App % * Revenue
    const revApp = revAppPct * totalFees
    if (ptiRows[37]) {
      ptiRows[37] = { ...ptiRows[37], c1: formatCellValue(revApp) }
    }

    // Now cascade: recalc all PTI formulas that depend on B30-B40
    const ptiFormulas = meta.formulasBySheet?.['PTI_Estimator']
    if (Array.isArray(ptiFormulas) && ptiFormulas.length > 0) {
      const cascadeRefs = ptiFormulas.filter((rec) => {
        const f = (rec.formula || '').toUpperCase()
        // Include formulas referencing any of the patched cells
        return /B3[0-9]|B40/.test(f)
      })
      if (cascadeRefs.length > 0) {
        const ptiUpdates = recalcFormulas({
          rowData: ptiRows,
          formulaRecords: cascadeRefs,
          definedNames: meta.definedNames || [],
          sheetNames: meta.sheetNames || [],
          workbookSheets: meta.rowDataBySheet,
        })
        if (ptiUpdates) {
          for (const [key, value] of Object.entries(ptiUpdates)) {
            const [rowStr, colStr] = key.split(':')
            const rowIdx = Number(rowStr)
            const colIdx = Number(colStr)
            if (!Number.isFinite(rowIdx) || !Number.isFinite(colIdx)) continue
            if (!ptiRows[rowIdx]) continue
            const field = `c${colIdx}`
            const formatted = formatCellValue(value)
            if (ptiRows[rowIdx][field] !== formatted) {
              ptiRows[rowIdx] = { ...ptiRows[rowIdx], [field]: formatted }
            }
          }
        }
      }
    }
  }, [workbookDataRef])

  /**
   * Resolve external-workbook references that point to local sheets.
   * The Rates sheet's RA% column references [6]vars__OthParms! which is an
   * external workbook — but vars__OthParms exists locally as a sheet.
   * This pre-heal step builds a lookup from vars__OthParms and patches the
   * #VALUE! cells so the regular heal pass can cascade through all dependents.
   */
  const resolveExternalRefs = useCallback(() => {
    const meta = workbookDataRef.current
    if (!meta?.rowDataBySheet) return

    const othParms = meta.rowDataBySheet['vars__OthParms']
    const rates = meta.rowDataBySheet['Rates']
    if (!othParms || !rates) return

    // Build the OthParms lookup: header row → column name to sparse col index
    // Then country-code → { colName: value } map
    const headerRow = othParms[0] // sparse row 0 = NDJSON r:1
    if (!headerRow) return

    // Find column indices from header
    let cuyrraCol = -1, cntryCodeCol = -1
    for (const key of Object.keys(headerRow)) {
      if (!key.startsWith('c')) continue
      const val = String(headerRow[key] || '').toUpperCase()
      if (val === 'CUYRRA_BCS') cuyrraCol = Number(key.slice(1))
      if (val === 'CNTRY_CODE') cntryCodeCol = Number(key.slice(1))
    }
    if (cuyrraCol < 0 || cntryCodeCol < 0) return

    // Build country code → CUYRRA_BCS value map
    const raByCountry = new Map()
    for (let i = 1; i < othParms.length; i++) {
      const row = othParms[i]
      if (!row) continue
      const code = String(row[`c${cntryCodeCol}`] || '').trim().toUpperCase()
      const raVal = row[`c${cuyrraCol}`]
      if (code && raVal != null) raByCountry.set(code, raVal)
    }
    if (raByCountry.size === 0) return

    // Patch Rates RA% column (NDJSON c:43 → sparse c42)
    // RA% formula: OFFSET(OFFSET([6]vars__OthParms!$A$1,0,MATCH("CUYRRA_BCS",...)-1), MATCH($H{row},[6]vars__OthParms!$B:$B,0)-1,0)
    // $H = country code, sparse c7 (NDJSON c:8)
    let patched = 0
    for (let i = 9; i < rates.length; i++) { // data starts at NDJSON row 10 → sparse 9
      const row = rates[i]
      if (!row) continue
      const cached = row.c42
      if (typeof cached === 'string' && ERROR_RE.test(cached)) {
        const countryCode = String(row.c7 || '').trim().toUpperCase()
        if (countryCode && raByCountry.has(countryCode)) {
          const val = raByCountry.get(countryCode)
          rates[i] = { ...rates[i], c42: formatCellValue(val) }
          patched++
        }
      }
    }

    if (patched > 0) {
      console.log(`[resolveExternalRefs] patched ${patched} RA% cells from local vars__OthParms`)
    }
  }, [workbookDataRef])
  /**
   * One-time healing pass: recalculate formula cells that carry a cached
   * #VALUE! (or other error) from Excel.  These errors originate from stale
   * external-workbook references that our calc engine CAN resolve because
   * the data exists locally.
   *
   * Scoped: only iterates sheets that actually contain error-valued formula
   * cells, and the second pass only re-visits sheets that were patched in
   * the first pass.
   */
  const healValueErrors = useCallback(() => {
    const meta = workbookDataRef.current
    if (!meta) return

    // Resolve external workbook refs (e.g. [6]vars__OthParms!) from local sheets first
    resolveExternalRefs()

    const { rowDataBySheet, formulasBySheet, definedNames, sheetNames } = meta
    if (!rowDataBySheet || !formulasBySheet) return

    const t0 = performance.now()
    let totalHealed = 0
    const MAX_PASSES = 6 // RA% → Uplift → PriceRate → RA → RevApp → downstream

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let passHealed = 0

      for (const sheetName of Object.keys(formulasBySheet)) {
        const formulas = formulasBySheet[sheetName]
        const sheetRows = rowDataBySheet[sheetName]
        if (!Array.isArray(formulas) || formulas.length === 0 || !sheetRows) continue

        const errorFormulas = formulas.filter((rec) => {
          const rowIdx = (Number(rec.row) || 0) - 1
          const colIdx = (Number(rec.col) || 0) - 1
          const cached = sheetRows[rowIdx]?.[`c${colIdx}`]
          return typeof cached === 'string' && ERROR_RE.test(String(cached))
        })
        if (errorFormulas.length === 0) continue

        const updates = recalcFormulas({
          rowData: sheetRows,
          formulaRecords: errorFormulas,
          definedNames: definedNames || [],
          sheetNames: sheetNames || [],
          workbookSheets: rowDataBySheet,
        })
        if (!updates || Object.keys(updates).length === 0) continue

        for (const [key, value] of Object.entries(updates)) {
          const [rowStr, colStr] = key.split(':')
          const rowIdx = Number(rowStr)
          const colIdx = Number(colStr)
          if (!Number.isFinite(rowIdx) || !Number.isFinite(colIdx)) continue
          if (!sheetRows[rowIdx]) continue
          const field = `c${colIdx}`
          const prev = sheetRows[rowIdx][field]
          const formatted = formatCellValue(value)
          if (typeof formatted === 'string' && ERROR_RE.test(formatted)) continue
          if (prev !== formatted) {
            sheetRows[rowIdx] = { ...sheetRows[rowIdx], [field]: formatted }
            passHealed++
          }
        }
      }

      totalHealed += passHealed
      if (passHealed === 0) break // converged — no more errors to resolve
    }

    if (totalHealed > 0) {
      console.log(`[healValueErrors] healed ${totalHealed} error cells in ${Math.round(performance.now() - t0)}ms`)
    }

    // Patch PTI from Staffing after heal — the GETPIVOTDATA formulas can't
    // be recalculated by the engine, so we compute them from healed Staffing data.
    patchPTIFromStaffing()
  }, [workbookDataRef, resolveExternalRefs, patchPTIFromStaffing])

  const runRecalcForSheet = useCallback((sheetName, currentRowData, formulaSubset) => {
    const meta = workbookDataRef.current
    if (!meta || !sheetName) return null

    const allFormulas = meta.formulasBySheet?.[sheetName]
    if (!Array.isArray(allFormulas) || allFormulas.length === 0) return null

    const formulaRecords = formulaSubset && formulaSubset.length > 0 ? formulaSubset : allFormulas

    const updates = recalcFormulas({
      rowData: currentRowData,
      formulaRecords,
      definedNames: meta.definedNames || [],
      sheetNames: meta.sheetNames || [],
      workbookSheets: meta.rowDataBySheet || {},
    })

    if (!updates || Object.keys(updates).length === 0) return null
    return updates
  }, [workbookDataRef])

  const applyRecalcToRowData = useCallback((sheetName, prevRowData, formulaSubset) => {
    let current = prevRowData
    let anyChanged = false
    const MAX_ITERS = 3

    for (let iter = 0; iter < MAX_ITERS; iter++) {
      if (workbookDataRef.current?.rowDataBySheet) {
        workbookDataRef.current.rowDataBySheet[sheetName] = current
      }
      const updates = runRecalcForSheet(sheetName, current, formulaSubset)
      if (!updates) break

      let changed = false
      const next = [...current]
      for (const [key, value] of Object.entries(updates)) {
        const [rowStr, colStr] = key.split(':')
        const rowIdx = Number(rowStr)
        const colIdx = Number(colStr)
        if (!Number.isFinite(rowIdx) || !Number.isFinite(colIdx)) continue
        if (!next[rowIdx]) continue
        const field = `c${colIdx}`
        const prev = next[rowIdx][field]
        const formatted = formatCellValue(value)
        if (prev !== formatted) {
          changed = true
          next[rowIdx] = { ...next[rowIdx], [field]: formatted }
        }
      }
      if (!changed) break
      anyChanged = true
      current = next
    }

    if (anyChanged && workbookDataRef.current?.rowDataBySheet) {
      workbookDataRef.current.rowDataBySheet[sheetName] = current
    }

    return anyChanged ? current : prevRowData
  }, [runRecalcForSheet, workbookDataRef])

  // Cross-sheet recalc: after recalculating the active sheet, re-evaluate
  // formulas on OTHER sheets that may reference the active sheet's data.
  // workbookDataRef.rowDataBySheet[activeSheet] is already updated, so the
  // formula evaluator will read fresh values via its workbookSheets context.
  const recalcCrossSheetDependents = useCallback((activeSheet) => {
    const meta = workbookDataRef.current
    if (!meta?.formulasBySheet || !meta?.rowDataBySheet) return

    const t0 = performance.now()
    const activeUpper = activeSheet.toUpperCase()

    // Build defined-name → active sheet mapping (cached per activeSheet)
    const namesCacheKey = `__names__${activeUpper}`
    let namesPointingToActive = crossSheetCache.get(namesCacheKey)
    if (!namesPointingToActive) {
      namesPointingToActive = new Set()
      if (Array.isArray(meta.definedNames)) {
        for (const entry of meta.definedNames) {
          const ranges = Array.isArray(entry.ranges) ? entry.ranges : []
          for (const r of ranges) {
            if (String(r).toUpperCase().includes(activeUpper + '!')) {
              namesPointingToActive.add(String(entry.name).toUpperCase())
              break
            }
          }
        }
      }
      crossSheetCache.set(namesCacheKey, namesPointingToActive)
    }

    for (const sheetName of Object.keys(meta.formulasBySheet)) {
      if (sheetName.toUpperCase() === activeUpper) continue

      const formulas = meta.formulasBySheet[sheetName]
      if (!Array.isArray(formulas) || formulas.length === 0) continue

      // Use cached cross-ref indices — avoid re-scanning formulas per edit
      const cacheKey = `${sheetName}→${activeSheet}`
      let crossRefIndices = crossSheetCache.get(cacheKey)
      if (!crossRefIndices) {
        crossRefIndices = []
        for (let i = 0; i < formulas.length; i++) {
          const f = formulas[i].formula || ''
          const fUpper = f.toUpperCase()
          if (fUpper.includes(activeUpper + '!') || f.includes("'" + activeSheet + "'!")) {
            crossRefIndices.push(i)
            continue
          }
          for (const name of namesPointingToActive) {
            if (fUpper.includes(name)) {
              crossRefIndices.push(i)
              break
            }
          }
        }
        crossSheetCache.set(cacheKey, crossRefIndices)
      }

      if (crossRefIndices.length === 0) continue

      // Skip heavy background sheets during live editing — they are never
      // displayed and Excel recalculates them on open anyway.  Only recalc
      // sheets with ≤ 500 cross-refs (covers PTI, Rates, Forex, etc.).
      if (crossRefIndices.length > 500) continue

      const crossRefs = crossRefIndices.map(i => formulas[i])
      const sheetRows = meta.rowDataBySheet[sheetName]
      if (!sheetRows) continue

      const updates = recalcFormulas({
        rowData: sheetRows,
        formulaRecords: crossRefs,
        definedNames: meta.definedNames || [],
        sheetNames: meta.sheetNames || [],
        workbookSheets: meta.rowDataBySheet,
      })
      if (!updates || Object.keys(updates).length === 0) continue

      const changedCells = []
      for (const [key, value] of Object.entries(updates)) {
        const [rowStr, colStr] = key.split(':')
        const rowIdx = Number(rowStr)
        const colIdx = Number(colStr)
        if (!Number.isFinite(rowIdx) || !Number.isFinite(colIdx)) continue
        if (!sheetRows[rowIdx]) continue
        const field = `c${colIdx}`
        const formatted = formatCellValue(value)
        if (sheetRows[rowIdx][field] !== formatted) {
          sheetRows[rowIdx] = { ...sheetRows[rowIdx], [field]: formatted }
          changedCells.push(key)
        }
      }

      // Second pass: cascade — recalc same-sheet formulas referencing changed cells
      if (changedCells.length > 0) {
        // Build a set of cell reference tokens that formulas might contain (e.g., "B30", "$B$30")
        const colLetters = (col0) => {
          let c = col0, s = ''
          do { s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26) - 1 } while (c >= 0)
          return s
        }
        const refTokens = new Set()
        for (const ck of changedCells) {
          const [r, c] = ck.split(':')
          const row1 = Number(r) + 1
          const col = colLetters(Number(c))
          // Match both absolute and relative refs
          refTokens.add(col + row1)             // B30
          refTokens.add('$' + col + '$' + row1) // $B$30
          refTokens.add('$' + col + row1)       // $B30
          refTokens.add(col + '$' + row1)       // B$30
        }
        const crossRefSet = new Set(crossRefIndices)
        const cascade = []
        for (let i = 0; i < formulas.length; i++) {
          if (crossRefSet.has(i)) continue
          const f = (formulas[i].formula || '').toUpperCase()
          for (const token of refTokens) {
            if (f.includes(token)) {
              cascade.push(formulas[i])
              break
            }
          }
        }
        if (cascade.length > 0) {
          const updates2 = recalcFormulas({
            rowData: sheetRows,
            formulaRecords: cascade,
            definedNames: meta.definedNames || [],
            sheetNames: meta.sheetNames || [],
            workbookSheets: meta.rowDataBySheet,
          })
          if (updates2) {
            for (const [key, value] of Object.entries(updates2)) {
              const [rowStr, colStr] = key.split(':')
              const rowIdx = Number(rowStr)
              const colIdx = Number(colStr)
              if (!Number.isFinite(rowIdx) || !Number.isFinite(colIdx)) continue
              if (!sheetRows[rowIdx]) continue
              const field = `c${colIdx}`
              const formatted = formatCellValue(value)
              if (sheetRows[rowIdx][field] !== formatted) {
                sheetRows[rowIdx] = { ...sheetRows[rowIdx], [field]: formatted }
              }
            }
          }
        }
      }
    }

    // Patch PTI from updated Staffing data
    patchPTIFromStaffing()
    if (typeof onMetricsChanged === 'function') onMetricsChanged()

    const elapsed = performance.now() - t0
    if (elapsed > 50) {
      console.log(`[crossSheetRecalc] ${activeSheet} took ${Math.round(elapsed)}ms`)
    }
  }, [workbookDataRef, patchPTIFromStaffing, onMetricsChanged])

  const scheduleRecalc = useCallback((sheetName) => {
    // Filter pending edits to only those targeting this sheet
    const allPending = pendingUIEditsRef.current
    if (allPending.length === 0) return

    const pending = []
    const remaining = []
    for (const edit of allPending) {
      if (edit.sheet === sheetName) pending.push(edit)
      else remaining.push(edit)
    }
    pendingUIEditsRef.current = remaining

    if (pending.length === 0) return

    const t0 = performance.now()
    const editedCells = pending.map(({ rowIndex, colIndex }) => ({ row: rowIndex, col: colIndex }))

    const meta = workbookDataRef.current
    const allFormulas = meta?.formulasBySheet?.[sheetName]
    let formulaSubset = null

    if (Array.isArray(allFormulas) && allFormulas.length > 0) {
      if (!depIndexCacheRef.current[sheetName]) {
        depIndexCacheRef.current[sheetName] = buildDependencyIndex(allFormulas, sheetName, meta?.definedNames)
      }
      const { depIndex, formulaPositions } = depIndexCacheRef.current[sheetName]
      formulaSubset = getAffectedFormulas(editedCells, depIndex, formulaPositions, allFormulas)
    }

    // Use this sheet's actual data — not rowDataRef (which tracks the *displayed* sheet)
    const activeSheet = activeSheetRef.current
    const sourceData = meta?.rowDataBySheet?.[sheetName] || []
    let current = [...sourceData]
    const maxRow = pending.reduce((m, p) => Math.max(m, p.rowIndex), current.length - 1)
    while (current.length <= maxRow) current.push({})
    for (const { rowIndex, colIndex, value } of pending) {
      current[rowIndex] = { ...(current[rowIndex] || {}), [`c${colIndex}`]: value }
    }

    if (!formulaSubset || formulaSubset.length === 0) {
      recalcCrossSheetDependents(sheetName)
      // Only update React state if this is the currently displayed sheet
      if (meta?.rowDataBySheet) meta.rowDataBySheet[sheetName] = current
      if (sheetName === activeSheet) setRowData(current)
      return
    }

    const result = applyRecalcToRowData(sheetName, current, formulaSubset)
    recalcCrossSheetDependents(sheetName)
    const final = result !== current ? result : current
    if (meta?.rowDataBySheet) meta.rowDataBySheet[sheetName] = final
    // Only update React state if this is the currently displayed sheet
    if (sheetName === activeSheet) setRowData(final)

    const elapsed = performance.now() - t0
    if (elapsed > 30) {
      console.log(`[scheduleRecalc] ${sheetName}: ${pending.length} edits, ${formulaSubset?.length ?? 0} formulas in ${Math.round(elapsed)}ms`)
    }
  }, [applyRecalcToRowData, recalcCrossSheetDependents, workbookDataRef, depIndexCacheRef, pendingUIEditsRef, activeSheetRef, setRowData])

  /** Clear cross-sheet formula cache (must be called on re-import of a different workbook) */
  const resetCrossSheetCache = useCallback(() => {
    crossSheetCache.clear()
  }, [])

  return { healValueErrors, scheduleRecalc, applyRecalcToRowData, resetCrossSheetCache }
}
