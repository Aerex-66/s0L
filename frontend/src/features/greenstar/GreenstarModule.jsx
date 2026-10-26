import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchCatalog, fetchWorkbookData, pickWorkbookForDeal,
  parsePivotInfo, executePivotInfoPivot, flattenPivotToGrid,
  extractStaffingRows, detectFteColumns,
} from '../../shared/gssmData'
import { FileSpreadsheet, Loader, AlertCircle, RefreshCw, LayoutGrid, Sliders } from 'lucide-react'
import PivotFieldPicker from './PivotFieldPicker'
import './greenstar.css'

/* ── Grouping order matching the GSSM PivotMaker ── */
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

/* ── Cell formatting (reused from PivotMakerModal) ── */
const fmtCell = (value, colIdx, dataColStart, dataFieldMeta) => {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  const dfIdx = colIdx - dataColStart
  if (dfIdx >= 0 && dataFieldMeta && dataFieldMeta[dfIdx % dataFieldMeta.length]?.isPercent) {
    return (n * 100).toFixed(1) + '%'
  }
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  if (n === 0) return '0'
  if (Math.abs(n) < 0.01 && n !== 0) return n.toFixed(4)
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

/* ── Pivot grid table ── */
function PivotGrid({ result, gridData }) {
  const { grid, colCount, dataColStart } = gridData
  const dataFieldMeta = result?.dataFields || []

  return (
    <div className="gs-grid-wrap">
      <div className="gs-grid-scroll">
        <table className="gs-grid">
          <tbody>
            {grid.map((row, ri) => {
              if (ri < 2) return null
              if (ri === 2) {
                return (
                  <tr key={ri} className="gs-grid-group-header">
                    {row.map((cell, ci) => (
                      <td key={ci} className={ci >= dataColStart && cell ? 'gs-grid-group-label' : 'gs-grid-empty-cell'}>
                        {cell ?? ''}
                      </td>
                    ))}
                  </tr>
                )
              }
              if (ri === 3) {
                return (
                  <tr key={ri} className="gs-grid-header-row">
                    {row.map((cell, ci) => (
                      <th key={ci} className={ci >= dataColStart ? 'gs-hdr gs-hdr-data' : 'gs-hdr gs-hdr-label'}>
                        {cell ?? ''}
                      </th>
                    ))}
                  </tr>
                )
              }
              const first = String(row[0] ?? '')
              const isGrand = first === 'Grand Total'
              const isSub = !isGrand && first.endsWith(' Total')
              const cls = isGrand ? 'gs-grand-total' : isSub ? 'gs-subtotal' : 'gs-data-row'
              return (
                <tr key={ri} className={cls}>
                  {row.map((cell, ci) => {
                    const isData = ci >= dataColStart
                    return (
                      <td key={ci} className={isData ? 'gs-cell gs-cell-num' : 'gs-cell gs-cell-label'}>
                        {isData ? fmtCell(cell, ci, dataColStart, dataFieldMeta) : (cell ?? '')}
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

/* ── Simple number formatter for custom pivot grids ── */
const fmtNum = (v) => {
  if (v == null) return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  if (n === 0) return '0'
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

/* ── Custom pivot grid (from pivot() result) ── */
function CustomPivotGrid({ groupByFields, valuesDef, pivotResult }) {
  const { groups, totals } = pivotResult
  if (!groups?.length) return <div className="gs-empty"><p>No matching rows.</p></div>

  return (
    <div className="gs-grid-wrap">
      <div className="gs-grid-scroll">
        <table className="gs-grid">
          <thead>
            <tr className="gs-grid-header-row">
              {groupByFields.map(f => <th key={f} className="gs-hdr gs-hdr-label">{f}</th>)}
              {valuesDef.map((v, i) => (
                <th key={i} className="gs-hdr gs-hdr-data">{v.agg !== 'sum' ? `${v.agg}(${v.field})` : v.field}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g, ri) => (
              <tr key={ri} className="gs-data-row">
                {groupByFields.map(f => <td key={f} className="gs-cell gs-cell-label">{g.key[f] || '(blank)'}</td>)}
                {valuesDef.map((v, vi) => (
                  <td key={vi} className="gs-cell gs-cell-num">{fmtNum(g.values[v.field])}</td>
                ))}
              </tr>
            ))}
            <tr className="gs-grand-total">
              <td className="gs-cell gs-cell-label" colSpan={groupByFields.length}>Grand Total</td>
              {valuesDef.map((v, vi) => (
                <td key={vi} className="gs-cell gs-cell-num">{fmtNum(totals[v.field])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Load the deal's linked GSSM workbook; { error } when there is none ── */
async function loadLinkedWorkbook(deal) {
  const wb = pickWorkbookForDeal(deal, await fetchCatalog())
  if (!wb) return { error: 'No GSSM workbook linked to this deal. Open one in the GSSM module first.' }
  const data = await fetchWorkbookData(wb.metadataDir, wb.id)
  if (!data?.rowDataBySheet?.['PivotInfo']) {
    return { error: 'Workbook has no PivotInfo sheet. Re-import a workbook with pivot definitions.' }
  }
  return { name: wb.name, data }
}

/* ── Main Greenstar Module ── */
export default memo(function GreenstarModule({ deal }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [workbookData, setWorkbookData] = useState(null)
  const [workbookName, setWorkbookName] = useState('')
  const [activeGrouping, setActiveGrouping] = useState(null)
  const [activePivotName, setActivePivotName] = useState(null)
  const [mode, setMode] = useState('prebuilt') // 'prebuilt' | 'custom'
  const [customResult, setCustomResult] = useState(null)

  // Load the GSSM workbook linked to this deal
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadLinkedWorkbook(deal)
      .then((result) => {
        if (cancelled) return
        if (result.error) setError(result.error)
        else { setWorkbookName(result.name); setWorkbookData(result.data) }
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load workbook data.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the deal's link changes
  }, [deal?.gssm_workbook_id, deal?.opportunity_number])

  // Parse pivot config
  const pivotConfig = useMemo(() => {
    if (!workbookData?.rowDataBySheet?.['PivotInfo']) return null
    return parsePivotInfo(workbookData.rowDataBySheet['PivotInfo'])
  }, [workbookData])

  // Extract staffing rows
  const dataRows = useMemo(() => {
    if (!workbookData?.rowDataBySheet?.['Staffing']) return []
    return extractStaffingRows(workbookData.rowDataBySheet['Staffing'])
  }, [workbookData])

  // FTE month field names for the custom pivot picker
  const fteMonthFields = useMemo(() => {
    if (!workbookData?.rowDataBySheet?.['Staffing']) return []
    return detectFteColumns(workbookData.rowDataBySheet['Staffing']).map(mc => mc.label)
  }, [workbookData])

  // Handle custom pivot result from field picker
  const handleCustomPivotResult = useCallback((res) => {
    setCustomResult(res)
  }, [])

  // Sorted grouping names
  const groupingNames = useMemo(() => {
    if (!pivotConfig) return []
    return sortGroupings(Object.keys(pivotConfig.groupings))
  }, [pivotConfig])

  // Auto-select Deal Financials (or first) on load
  useEffect(() => {
    if (groupingNames.length && !activeGrouping) {
      const df = groupingNames.find(g => g === 'Deal Financials')
      setActiveGrouping(df || groupingNames[0])
    }
  }, [groupingNames, activeGrouping])

  // Pivots for active grouping
  const pivotList = useMemo(() => {
    if (!pivotConfig || !activeGrouping) return []
    return pivotConfig.groupings[activeGrouping] || []
  }, [pivotConfig, activeGrouping])

  // Auto-select first pivot when grouping changes
  useEffect(() => {
    if (pivotList.length && (!activePivotName || !pivotList.find(p => p.pivotName === activePivotName))) {
      setActivePivotName(pivotList[0].pivotName)
    }
  }, [pivotList, activePivotName])

  // Active pivot definition
  const activePivot = useMemo(() => {
    return pivotList.find(p => p.pivotName === activePivotName) || null
  }, [pivotList, activePivotName])

  // Generate the active pivot
  const generated = useMemo(() => {
    if (!activePivot || !dataRows.length) return null
    try {
      const result = executePivotInfoPivot(dataRows, activePivot)
      const gridData = flattenPivotToGrid(result)
      return { result, gridData }
    } catch {
      return null
    }
  }, [activePivot, dataRows])

  const handleRefresh = useCallback(() => {
    setWorkbookData(null)
    setActiveGrouping(null)
    setActivePivotName(null)
    setLoading(true)
    setError(null)
    loadLinkedWorkbook(deal)
      .then((result) => {
        if (result.error) setError(result.error)
        else { setWorkbookName(result.name); setWorkbookData(result.data) }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [deal])

  // ── Loading state ──
  if (loading) {
    return (
      <div className="gs-module">
        <div className="gs-loading">
          <Loader size={28} className="gs-spin" />
          <span>Loading GSSM workbook…</span>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="gs-module">
        <div className="gs-empty">
          <AlertCircle size={32} className="gs-empty-icon" />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="gs-module">
      {/* Header */}
      <header className="gs-header">
        <div className="gs-header-left">
          <FileSpreadsheet size={16} className="gs-header-icon" />
          <span className="gs-header-file">{workbookName}</span>
        </div>
        <div className="gs-header-right">
          <div className="gs-mode-toggle">
            <button
              type="button"
              className={`gs-mode-btn${mode === 'prebuilt' ? ' gs-mode-btn--active' : ''}`}
              onClick={() => setMode('prebuilt')}
              title="Pre-built reports"
            >
              <LayoutGrid size={13} />
              Reports
            </button>
            <button
              type="button"
              className={`gs-mode-btn${mode === 'custom' ? ' gs-mode-btn--active' : ''}`}
              onClick={() => setMode('custom')}
              title="Custom pivot builder"
            >
              <Sliders size={13} />
              Builder
            </button>
          </div>
          <button type="button" className="gs-refresh" onClick={handleRefresh} title="Refresh workbook data">
            <RefreshCw size={13} />
          </button>
        </div>
      </header>

      {mode === 'prebuilt' ? (
        <>
          {/* Grouping tabs */}
          <nav className="gs-grouping-bar">
            {groupingNames.map(name => (
              <button
                key={name}
                type="button"
                className={`gs-grouping-tab${activeGrouping === name ? ' gs-grouping-tab--active' : ''}`}
                onClick={() => { setActiveGrouping(name); setActivePivotName(null) }}
              >
                {name}
                <span className="gs-grouping-count">{(pivotConfig?.groupings[name] || []).length}</span>
              </button>
            ))}
          </nav>

          {/* Pivot sub-tabs */}
          {pivotList.length > 1 && (
            <div className="gs-pivot-bar">
              {pivotList.map(p => (
                <button
                  key={p.pivotName}
                  type="button"
                  className={`gs-pivot-tab${activePivotName === p.pivotName ? ' gs-pivot-tab--active' : ''}`}
                  onClick={() => setActivePivotName(p.pivotName)}
                >
                  {p.pivotName}
                </button>
              ))}
            </div>
          )}

          {/* Pivot grid */}
          <div className="gs-content">
            {generated ? (
              <PivotGrid result={generated.result} gridData={generated.gridData} />
            ) : (
              <div className="gs-empty">
                <p>{dataRows.length === 0 ? 'No staffing data in workbook.' : 'Select a pivot to view.'}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Custom pivot builder mode */
        <div className="gs-builder">
          <aside className="gs-builder-sidebar">
            <PivotFieldPicker
              dataRows={dataRows}
              fteMonthFields={fteMonthFields}
              onPivotResult={handleCustomPivotResult}
            />
          </aside>
          <div className="gs-builder-main">
            {customResult?.result ? (
              <CustomPivotGrid
                groupByFields={customResult.rows}
                valuesDef={customResult.values}
                pivotResult={customResult.result}
              />
            ) : (
              <div className="gs-empty">
                <Sliders size={32} className="gs-empty-icon" />
                <p>Drag fields into Rows and Values to build a pivot.</p>
                <p style={{ fontSize: 'var(--type-2xs)', color: 'var(--text-tertiary)' }}>Or select a preset from the sidebar.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
