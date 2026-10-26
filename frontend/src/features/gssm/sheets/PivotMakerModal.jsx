import { memo, useCallback, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { parsePivotInfo, executePivotInfoPivot, flattenPivotToGrid } from '../utils/parsePivotInfo'
import { extractStaffingRows } from '../utils/pivotEngine'

/* ── Value formatting — matches Excel's display ── */
const fmtCell = (value, colIdx, dataColStart, dataFieldMeta) => {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  // Check if this is a percent column
  const dfIdx = colIdx - dataColStart
  if (dfIdx >= 0 && dataFieldMeta && dataFieldMeta[dfIdx % dataFieldMeta.length]?.isPercent) {
    return (n * 100).toFixed(1) + '%'
  }
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  if (n === 0) return '0'
  if (Math.abs(n) < 0.01 && n !== 0) return n.toFixed(4)
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

/* ── Grouping order to match Excel's PivotMaker form ── */
const GROUPING_ORDER = [
  'STANDARD', 'GBS Bid Metrics', 'Band Mix', 'Deal Financials',
  'FTE Chart', 'FTE Mix', 'Hours Mix', 'PMP Staffing Plan', 'WWGPE',
]

function sortGroupings(names) {
  return [...names].sort((a, b) => {
    const ai = GROUPING_ORDER.indexOf(a)
    const bi = GROUPING_ORDER.indexOf(b)
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return a.localeCompare(b)
  })
}

/* ── Excel-like pivot grid renderer ── */
function ExcelPivotGrid({ result, gridData }) {
  const { grid, colCount, dataColStart } = gridData

  // Build data-field metadata for formatting (percent columns, etc.)
  const dataFieldMeta = useMemo(() => {
    if (!result?.dataFields) return []
    // For column-oriented pivots, data fields repeat per column value
    return result.dataFields
  }, [result])

  const isSubtotalRow = useCallback((rowCells) => {
    const first = String(rowCells[0] ?? '')
    return first.endsWith(' Total')
  }, [])

  const isGrandTotalRow = useCallback((rowCells) => {
    return String(rowCells[0] ?? '') === 'Grand Total'
  }, [])

  return (
    <div className="pm-excel-grid-wrap">
      <div className="pm-excel-grid-scroll">
        <table className="pm-excel-grid">
          <tbody>
            {grid.map((row, ri) => {
              // Rows 0-1: empty spacer rows
              if (ri < 2) {
                return (
                  <tr key={ri} className="pm-grid-empty-row">
                    <td colSpan={colCount}>&nbsp;</td>
                  </tr>
                )
              }
              // Row 2: column group header
              if (ri === 2) {
                return (
                  <tr key={ri} className="pm-grid-group-header">
                    {row.map((cell, ci) => (
                      <td key={ci} className={ci >= dataColStart && cell ? 'pm-grid-group-label' : 'pm-grid-empty-cell'}>
                        {cell ?? ''}
                      </td>
                    ))}
                  </tr>
                )
              }
              // Row 3: field headers
              if (ri === 3) {
                return (
                  <tr key={ri} className="pm-grid-header-row">
                    {row.map((cell, ci) => (
                      <th key={ci} className={ci >= dataColStart ? 'pm-grid-hdr pm-grid-hdr-data' : 'pm-grid-hdr pm-grid-hdr-label'}>
                        {cell ?? ''}
                      </th>
                    ))}
                  </tr>
                )
              }
              // Data rows
              const isSub = isSubtotalRow(row)
              const isGrand = isGrandTotalRow(row)
              const rowClass = isGrand ? 'pm-grid-grand-total' : isSub ? 'pm-grid-subtotal' : 'pm-grid-data-row'
              return (
                <tr key={ri} className={rowClass}>
                  {row.map((cell, ci) => {
                    const isDataCol = ci >= dataColStart
                    const cellClass = isDataCol ? 'pm-grid-cell pm-grid-cell-num' : 'pm-grid-cell pm-grid-cell-label'
                    return (
                      <td key={ci} className={cellClass}>
                        {isDataCol ? fmtCell(cell, ci, dataColStart, dataFieldMeta) : (cell ?? '')}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Modal content ── */
function PivotMakerModal({ workbookDataRef, onClose, onAddSheet }) {
  const [activeGrouping, setActiveGrouping] = useState(null)
  const [activePivot, setActivePivot] = useState(null)
  const [generatedResult, setGeneratedResult] = useState(null)
  const [generatedGrid, setGeneratedGrid] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [addedSheets, setAddedSheets] = useState(new Set())

  // Parse PivotInfo once
  const pivotConfig = useMemo(() => {
    const pivotInfoRows = workbookDataRef.current?.rowDataBySheet?.['PivotInfo']
    if (!pivotInfoRows) return null
    return parsePivotInfo(pivotInfoRows)
  }, [workbookDataRef])

  // Extract Staffing data rows once
  const dataRows = useMemo(() => {
    const staffingRows = workbookDataRef.current?.rowDataBySheet?.['Staffing']
    if (!staffingRows) return []
    return extractStaffingRows(staffingRows)
  }, [workbookDataRef])

  const groupingNames = useMemo(() => {
    if (!pivotConfig) return []
    return sortGroupings(Object.keys(pivotConfig.groupings))
  }, [pivotConfig])

  const pivotList = useMemo(() => {
    if (!pivotConfig || !activeGrouping) return []
    return pivotConfig.groupings[activeGrouping] || []
  }, [pivotConfig, activeGrouping])

  // Auto-select first grouping
  useMemo(() => {
    if (groupingNames.length > 0 && !activeGrouping) {
      setActiveGrouping(groupingNames[0])
    }
  }, [groupingNames, activeGrouping])

  const handleGenerate = useCallback(() => {
    if (!activePivot || !dataRows.length) return
    setGenerating(true)
    setTimeout(() => {
      try {
        const result = executePivotInfoPivot(dataRows, activePivot)
        const gridData = flattenPivotToGrid(result)
        setGeneratedResult(result)
        setGeneratedGrid(gridData)
      } catch (err) {
        console.error('PivotMaker generation error:', err)
        setGeneratedResult(null)
        setGeneratedGrid(null)
      }
      setGenerating(false)
    }, 10)
  }, [activePivot, dataRows])

  const handleAddAsSheet = useCallback(() => {
    if (!generatedResult || !generatedGrid || !onAddSheet) return
    const sheetName = generatedResult.pivotName
    onAddSheet({ name: sheetName, grid: generatedGrid.grid, colCount: generatedGrid.colCount, rowCount: generatedGrid.rowCount, headerRowEnd: generatedGrid.headerRowEnd, dataColStart: generatedGrid.dataColStart })
    setAddedSheets((prev) => new Set([...prev, sheetName]))
  }, [generatedResult, generatedGrid, onAddSheet])

  if (!pivotConfig) {
    return (
      <motion.div className="pm-overlay" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
        <motion.div className="pm-modal" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ duration: 0.18, ease: [0.2, 0, 0.38, 0.9] }}>
          <div className="pm-header">
            <h2 className="pm-title">GSSM PivotMaker</h2>
            <button type="button" className="pm-close" onClick={onClose}><X size={16} /></button>
          </div>
          <div className="pm-body">
            <div className="pm-empty">
              <p><strong>No PivotInfo sheet found.</strong></p>
              <p>This workbook does not contain a PivotInfo sheet with pivot table definitions.</p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <motion.div className="pm-overlay" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <motion.div className="pm-modal" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ duration: 0.18, ease: [0.2, 0, 0.38, 0.9] }}>
        <div className="pm-header">
          <h2 className="pm-title">GSSM PivotMaker</h2>
          <button type="button" className="pm-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="pm-body">
          {/* Left panel: Grouping list */}
          <div className="pm-sidebar">
            <div className="pm-section-label">Grouping</div>
            <div className="pm-grouping-list">
              {groupingNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`pm-grouping-btn${activeGrouping === name ? ' pm-grouping-btn--active' : ''}`}
                  onClick={() => {
                    setActiveGrouping(name)
                    setActivePivot(null)
                    setGeneratedResult(null)
                    setGeneratedGrid(null)
                  }}
                >
                  <span className="pm-grouping-name">{name}</span>
                  <span className="pm-grouping-count">{(pivotConfig.groupings[name] || []).length}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Center panel: Pivot table list */}
          <div className="pm-pivots-panel">
            <div className="pm-section-label">Pivot Tables</div>
            {pivotList.length === 0 ? (
              <div className="pm-empty">Select a grouping</div>
            ) : (
              <div className="pm-pivot-list">
                {pivotList.map((p) => {
                  const rowF = p.fields.filter((f) => f.orientation === 'row')
                  const dataF = p.fields.filter((f) => f.orientation === 'data')
                  const pageF = p.fields.filter((f) => f.orientation === 'page')
                  const isActive = activePivot?.pivotName === p.pivotName && activePivot?.grouping === p.grouping
                  const isAdded = addedSheets.has(p.pivotName)
                  return (
                    <button
                      key={p.pivotName}
                      type="button"
                      className={`pm-pivot-btn${isActive ? ' pm-pivot-btn--active' : ''}${isAdded ? ' pm-pivot-btn--added' : ''}`}
                      onClick={() => {
                        setActivePivot(p)
                        setGeneratedResult(null)
                        setGeneratedGrid(null)
                      }}
                    >
                      <div className="pm-pivot-name">
                        {isAdded && <span className="pm-added-badge"><Check size={12} /></span>}
                        {p.pivotName}
                      </div>
                      <div className="pm-pivot-meta">
                        {rowF.length > 0 && <span>Rows: {rowF.map((f) => f.fieldName).join(', ')}</span>}
                        {dataF.length > 0 && <span>Data: {dataF.map((f) => f.caption).join(', ')}</span>}
                        {pageF.length > 0 && (
                          <span>Filter: {pageF.map((f) =>
                            f.includeItems.length ? `${f.fieldName}=${f.includeItems.join(',')}` : f.fieldName
                          ).join('; ')}</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {activePivot && (
              <div className="pm-generate-bar">
                <button
                  type="button"
                  className="btn btn-primary pm-generate-btn"
                  onClick={handleGenerate}
                  disabled={generating || !dataRows.length}
                >
                  {generating ? 'Generating…' : 'Generate'}
                </button>
              </div>
            )}
          </div>

          {/* Right panel: Excel-like result */}
          <div className="pm-result-panel">
            {generatedResult && generatedGrid ? (
              <>
                <div className="pm-result-header">
                  <div className="pm-section-label">{generatedResult.pivotName}</div>
                  <div className="pm-result-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm pm-add-sheet-btn"
                      onClick={handleAddAsSheet}
                      disabled={addedSheets.has(generatedResult.pivotName)}
                    >
                      {addedSheets.has(generatedResult.pivotName) ? <><Check size={12} style={{ marginRight: 4 }} /> Added as Sheet</> : 'Add as Sheet'}
                    </button>
                  </div>
                </div>
                {generatedResult.pageFields.length > 0 && (
                  <div className="pm-filter-bar">
                    Filters: {generatedResult.pageFields.map((f) =>
                      f.includeItems.length ? `${f.caption} = ${f.includeItems.join(', ')}` : f.caption
                    ).join(' | ')}
                  </div>
                )}
                <ExcelPivotGrid result={generatedResult} gridData={generatedGrid} />
              </>
            ) : (
              <div className="pm-result-empty">
                <div className="pm-result-empty-icon">📊</div>
                <p>Select a pivot and click <strong>Generate</strong> to preview the output here.</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default memo(PivotMakerModal)
