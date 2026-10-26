/**
 * useSheetNavigation — sheet tab switching, visibility admin, and view-mode routing.
 *
 * Owns: handleSheetChange, handleSheetVisibilityToggle, view-mode routing logic.
 * Pure organizational extraction — zero behavioral changes.
 */
import { useCallback } from 'react'

const FORM_VIEW_SHEETS = new Set([
  'Home', 'PTI_Estimator', 'Bid Metrics', 'Forex', 'Inflation',
  'Effort Matrix', 'JRS', 'Staffing', 'Rates', 'Cloud', 'PMP Template',
  // GPE sheets
  'GPE_Workbook', 'GPE_Month', 'GPE_Day', 'GPE Aggregator', 'GPE-Automation', 'Non-Labor in GPE',
  // Summary sheets
  'FTE_By_Role', 'FTE_Flat_IBM_Summary_15', 'DF_Team', 'iSBD Summary',
  // Data-entry sheets
  'WRICEF List', 'RICEFW Estimation', 'FS Estimation', 'RICEFW Split Guidance',
  'SAP Metrics Input', 'Gen AI Assumptions', 'Rates Adjustment', 'PMR Calculator',
  // Reference/lookup sheets
  'vars__Rates_Look_up_Table', 'vars__Rates', 'vars__Country', 'vars__CurrencySource',
  'vars__EqComp', 'vars__bands', 'vars__OthParms', 'vars__Inflation', 'vars__WACC',
  'vars__CategoryDesc', 'var__Hours', 'OKBands', 'BandOrdering', 'WorkLocations',
  'WorkLocations (2)', 'HoursLocMapping', 'RA__Mapping__Table', 'JRS_Map',
  'BidMetricsTbl', 'JRSS', 'PhaseMatrix', 'PivotInfo', 'Background',
  // Log/misc sheets
  'GSSM Change Log', 'Sheet1',
])

export { FORM_VIEW_SHEETS }

export function useSheetNavigation({
  workbookDataRef,
  generatedSheetsRef,
  allSheetNames,
  sheetVisibility,
  activeSheet,
  setActiveSheet,
  setSheetNames,
  setSheetVisibility,
  setGssmViewMode,
  setSelectedCell,
  setFormulaInput,
  setError,
  renderSheet,
}) {
  const handleSheetChange = useCallback((sheetName) => {
    if (!workbookDataRef.current) return
    setActiveSheet(sheetName)
    if (generatedSheetsRef.current[sheetName]) {
      setGssmViewMode('form')
      setSelectedCell(null)
      setFormulaInput('')
      return
    }
    if (sheetName === 'Imp TL') {
      setGssmViewMode('timeline')
    } else if (FORM_VIEW_SHEETS.has(sheetName)) {
      setGssmViewMode('form')
    } else {
      setGssmViewMode('grid')
    }
    setSelectedCell(null)
    setFormulaInput('')

    renderSheet(sheetName)
  }, [workbookDataRef, generatedSheetsRef, setActiveSheet, setGssmViewMode, setSelectedCell, setFormulaInput, renderSheet])

  const handleSheetVisibilityToggle = useCallback((sheetName, visible) => {
    const nextVisibility = {
      ...sheetVisibility,
      [sheetName]: visible,
    }
    setSheetVisibility(nextVisibility)

    const nextSheets = allSheetNames.filter((name) => nextVisibility[name] !== false)
    if (nextSheets.length === 0) {
      setError('At least one sheet must remain visible.')
      return
    }

    setError('')
    setSheetNames(nextSheets)

    if (!nextSheets.includes(activeSheet)) {
      const fallback = nextSheets[0]
      setActiveSheet(fallback)
      renderSheet(fallback)
    }
  }, [sheetVisibility, allSheetNames, activeSheet, setSheetVisibility, setSheetNames, setActiveSheet, setError, renderSheet])

  return { handleSheetChange, handleSheetVisibilityToggle, FORM_VIEW_SHEETS }
}
