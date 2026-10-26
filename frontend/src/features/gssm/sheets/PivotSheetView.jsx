import { memo, useMemo, useState, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { GSSM_PIVOTS, refreshAllPivots, pivot } from '../utils/pivotEngine'

const fmt = (value) => {
  if (value == null) return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/* ── Single pivot table renderer ── */
function PivotTable({ pivotDef, result }) {
  const { groupBy, values } = pivotDef
  const { groups, totals, rowCount } = result
  const [sortField, setSortField] = useState(null)
  const [sortDir, setSortDir] = useState('desc')

  const sorted = useMemo(() => {
    if (!sortField) return groups
    return [...groups].sort((a, b) => {
      const av = a.values[sortField] ?? 0
      const bv = b.values[sortField] ?? 0
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [groups, sortField, sortDir])

  const handleSort = useCallback((field) => {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }, [sortField])

  return (
    <div className="pivot-table-wrap">
      <div className="sheet-data-table-wrap" style={{ maxHeight: '50vh' }}>
        <table className="sheet-data-table pivot-data-table">
          <thead>
            <tr>
              {groupBy.map((f) => <th key={f} className="th-label">{f}</th>)}
              {values.map((v) => (
                <th
                  key={v.field}
                  className="th-numeric pivot-sortable"
                  onClick={() => handleSort(v.field)}
                >
                  {v.field}
                  {sortField === v.field && (
                    <span className="pivot-sort-icon">{sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((g, i) => (
              <tr key={i}>
                {groupBy.map((f) => (
                  <td key={f} className="td-code">{g.key[f] || '(blank)'}</td>
                ))}
                {values.map((v) => (
                  <td key={v.field} className="td-numeric">{fmt(g.values[v.field])}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="pivot-totals-row">
              <td colSpan={groupBy.length} className="pivot-totals-label">Grand Total</td>
              {values.map((v) => (
                <td key={v.field} className="td-numeric pivot-total-cell">{fmt(totals[v.field])}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/* ── Custom pivot builder ── */
function CustomPivotBuilder({ dataRows }) {
  const allFields = useMemo(() => {
    if (!dataRows.length) return []
    const exclude = new Set(['_rowIndex'])
    return Object.keys(dataRows[0]).filter((k) => !exclude.has(k))
  }, [dataRows])

  const dimensionFields = useMemo(() => allFields.filter((f) => {
    // Non-numeric fields are dimensions
    if (!dataRows.length) return true
    const sample = dataRows[0][f]
    return typeof sample === 'string'
  }), [allFields, dataRows])

  const valueFields = useMemo(() => allFields.filter((f) => {
    if (!dataRows.length) return false
    const sample = dataRows[0][f]
    return typeof sample === 'number'
  }), [allFields, dataRows])

  const [groupBy, setGroupBy] = useState(['Team'])
  const [selectedValues, setSelectedValues] = useState(['Hours', 'Fees'])
  const [agg, setAgg] = useState('sum')

  const customResult = useMemo(() => {
    if (!groupBy.length || !selectedValues.length) return null
    const valDefs = selectedValues.map((f) => ({ field: f, agg }))
    return pivot(dataRows, groupBy, valDefs)
  }, [dataRows, groupBy, selectedValues, agg])

  const toggleGroup = useCallback((field) => {
    setGroupBy((prev) => prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field])
  }, [])

  const toggleValue = useCallback((field) => {
    setSelectedValues((prev) => prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field])
  }, [])

  return (
    <div className="pivot-custom-builder">
      <div className="section-divider">Dimensions (Group By)</div>
      <div className="pivot-field-chips">
        {dimensionFields.map((f) => (
          <button
            key={f}
            type="button"
            className={`pivot-chip${groupBy.includes(f) ? ' pivot-chip--active' : ''}`}
            onClick={() => toggleGroup(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="section-divider">Values (Aggregate)</div>
      <div className="pivot-field-chips">
        {valueFields.slice(0, 20).map((f) => (
          <button
            key={f}
            type="button"
            className={`pivot-chip${selectedValues.includes(f) ? ' pivot-chip--active' : ''}`}
            onClick={() => toggleValue(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="pivot-agg-row">
        <span>Aggregation:</span>
        {['sum', 'avg', 'count', 'max', 'min'].map((a) => (
          <button
            key={a}
            type="button"
            className={`pivot-chip${agg === a ? ' pivot-chip--active' : ''}`}
            onClick={() => setAgg(a)}
          >
            {a.toUpperCase()}
          </button>
        ))}
      </div>

      {customResult && (
        <PivotTable
          pivotDef={{ groupBy, values: selectedValues.map((f) => ({ field: f, agg })) }}
          result={customResult}
        />
      )}
    </div>
  )
}

/* ── Main PivotSheetView ── */
function PivotSheetView({ staffingRowData }) {
  const [activePivot, setActivePivot] = useState('company-team')
  const [showCustom, setShowCustom] = useState(false)

  // Run all pivots from current Staffing data
  const pivotData = useMemo(() => {
    if (!staffingRowData || !staffingRowData.length) return null
    return refreshAllPivots(staffingRowData)
  }, [staffingRowData])

  if (!pivotData) {
    return (
      <section className="sheet-form-panel">
        <div className="sheet-panel-header">
          <div className="sheet-panel-header-left">
            <h2 className="sheet-panel-title">Deal Financial Summary</h2>
          </div>
        </div>
        <div className="unmapped-notice">
          <p><strong>Import a workbook to generate financial summaries.</strong></p>
        </div>
      </section>
    )
  }

  const { results, dataRows, fteMonths } = pivotData
  const current = results[activePivot]

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">Deal Financial Summary</h2>
        </div>
      </div>

      <div className="pivot-tabs">
        {GSSM_PIVOTS.map((def) => (
          <button
            key={def.id}
            type="button"
            className={`pivot-tab${activePivot === def.id && !showCustom ? ' pivot-tab--active' : ''}`}
            onClick={() => { setActivePivot(def.id); setShowCustom(false) }}
          >
            {def.name}
          </button>
        ))}
        <button
          type="button"
          className={`pivot-tab pivot-tab--custom${showCustom ? ' pivot-tab--active' : ''}`}
          onClick={() => setShowCustom(true)}
        >
          + Custom
        </button>
      </div>

      {showCustom ? (
        <>
          <div className="section-divider">Custom Pivot Builder</div>
          <CustomPivotBuilder dataRows={dataRows} />
        </>
      ) : current ? (
        <>
          <div className="section-divider">{current.def.name}</div>
          <PivotTable pivotDef={current.def} result={current.result} />
        </>
      ) : null}
    </section>
  )
}

export default memo(PivotSheetView)
