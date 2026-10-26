import { memo, useMemo } from 'react'
import CellInput from '../components/CellInput'
import CollapsibleSection from '../components/CollapsibleSection'
import { getSheetDisplayName } from '../utils/normalizer'

/* ── helpers ── */
const cell = (rd, r, c) => {
  const row = rd[r] || {}
  const v = row[`c${c}`]
  return v == null ? '' : String(v)
}

const num = (rd, r, c) => {
  const t = cell(rd, r, c).replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

const fmt = (v, decimals = 1) => {
  if (v == null || v === '') return ''
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })
}

const pct = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  if (!Number.isFinite(n)) return String(v ?? '')
  return `${(n * 100).toFixed(0)}%`
}

/* ── constants ── */
const OBJECT_TYPES = ['Reports', 'Interfaces', 'Conversions', 'Enhancements', 'Forms', 'Workflow']
const COMPLEXITY = ['V-High', 'High', 'Med', 'Low', 'V-Low']
const COMPLEXITY_COLS = [3, 4, 5, 6, 7]       // c3–c7 in the base matrix
const COUNT_COLS = [3, 4, 5, 6, 7]            // c3–c7 in the count section (rows 12–17)
const EFFORT_COLS = [10, 11, 12, 13, 14]      // c10–c14 in the effort section (rows 12–17)

const PARAM_ROWS = [
  { row: 4, label: 'Realization Factor', desc: 'Ratio applied to base effort to account for rework', col: 5, format: 'decimal' },
  { row: 5, label: 'Offshore PM Hours', desc: 'Additional overhead for offshore project management', col: 5, format: 'percent' },
  { row: 6, label: 'Sign-Off', desc: 'Effort overhead for document reviews & approvals', col: 5, format: 'percent' },
  { row: 7, label: 'Onsite Coordination', desc: 'Travel & onsite coordination overhead', col: 5, format: 'percent' },
]

const TYPE_ICONS = {
  Reports: '📊',
  Interfaces: '🔗',
  Conversions: '🔄',
  Enhancements: '⚙️',
  Forms: '📋',
  Workflow: '🔀',
}

const TYPE_COLORS = {
  Reports: '#3b82f6',
  Interfaces: '#8b5cf6',
  Conversions: '#f59e0b',
  Enhancements: '#10b981',
  Forms: '#ec4899',
  Workflow: '#06b6d4',
}

function FSEstimationSheetView({ rowData = [], onCellEdit, formulas = [], isSolutioner }) {
  /* ── Derived data ── */
  const params = useMemo(() => PARAM_ROWS.map((p) => ({
    ...p,
    value: cell(rowData, p.row - 1, p.col),
    numValue: num(rowData, p.row - 1, p.col),
  })), [rowData])

  // Object counts from rows 12–17 (0-based: 11–16)
  const objectCounts = useMemo(() => OBJECT_TYPES.map((type, i) => {
    const r = 11 + i
    const counts = COUNT_COLS.map((c) => num(rowData, r, c))
    const total = counts.reduce((s, v) => s + v, 0)
    return { type, counts, total, row: r }
  }), [rowData])

  // Effort hours from rows 12–17, cols 10–14 (right panel)
  const objectEfforts = useMemo(() => OBJECT_TYPES.map((type, i) => {
    const r = 11 + i
    const efforts = EFFORT_COLS.map((c) => num(rowData, r, c))
    const total = efforts.reduce((s, v) => s + v, 0)
    return { type, efforts, total, row: r }
  }), [rowData])

  // Summary totals — rows 19–21 (0-based: 18–20), col 13
  const fsEffort = num(rowData, 18, 13)
  const wsEffort = num(rowData, 19, 13)
  const totalHours = num(rowData, 20, 13)

  // Grand totals for counts
  const totalCount = objectCounts.reduce((s, o) => s + o.total, 0)

  // Base matrix (editable) — rows 63–68 (0-based: 62–67), cols 3–7
  const baseMatrix = useMemo(() => OBJECT_TYPES.map((type, i) => {
    const r = 62 + i
    const values = COMPLEXITY_COLS.map((c) => cell(rowData, r, c))
    return { type, values, row: r }
  }), [rowData])

  // Adjusted matrix (formula-driven) — rows 63–68, cols 10–14
  const adjustedMatrix = useMemo(() => OBJECT_TYPES.map((type, i) => {
    const r = 62 + i
    const values = [10, 11, 12, 13, 14].map((c) => num(rowData, r, c))
    return { type, values, row: r }
  }), [rowData])

  // Year-split data — 3 panels
  const yearPanels = useMemo(() => {
    const panels = []
    const yearConfigs = [
      { labelRow: 24, headerRow: 25, dataStart: 26, sumRow: 33, wsRow: 34, totalRow: 35, cols: [3, 4, 5, 6, 7] },
      { labelRow: 24, headerRow: 25, dataStart: 26, sumRow: 33, wsRow: 34, totalRow: 35, cols: [10, 11, 12, 13, 14] },
      { labelRow: 24, headerRow: 25, dataStart: 26, sumRow: 33, wsRow: 34, totalRow: 35, cols: [17, 18, 19, 20, 21] },
    ]
    const yearLabels = [cell(rowData, 23, 3), cell(rowData, 23, 10), cell(rowData, 23, 17)]

    yearConfigs.forEach((cfg, yi) => {
      const year = yearLabels[yi] || `Year ${yi + 1}`
      const objectCount = cell(rowData, 24, cfg.cols[0])
      const types = OBJECT_TYPES.map((type, ti) => {
        const r = cfg.dataStart + ti
        const efforts = cfg.cols.map((c) => num(rowData, r, c))
        const total = efforts.reduce((s, v) => s + v, 0)
        return { type, efforts, total }
      })
      const fsHours = num(rowData, cfg.sumRow, cfg.cols[2])
      const wsHours = num(rowData, cfg.wsRow, cfg.cols[2])
      const totalYearHours = num(rowData, cfg.totalRow, cfg.cols[2])
      panels.push({ year, objectCount, types, fsHours, wsHours, totalYearHours })
    })
    return panels
  }, [rowData])

  // Assumptions — rows 41–55 (0-based: 40–54)
  const assumptions = useMemo(() => {
    const items = []
    for (let r = 40; r <= 54; r++) {
      const text = cell(rowData, r, 1)
      if (text.trim()) items.push(text.trim())
    }
    return items
  }, [rowData])

  /* ── Who has the most effort? (for bar chart scaling) ── */
  const maxEffort = Math.max(...objectEfforts.map((o) => o.total), 1)

  return (
    <section className="sheet-form-panel fs-estimation">
      {/* ── Header ── */}
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('FS Estimation')}</h2>
          <span className="sheet-panel-badge sheet-panel-badge--calculator">Calculator</span>
        </div>
        <div className="stat-row">
          <span className="stat-badge stat-badge--blue">{totalCount} objects</span>
          <span className="stat-badge stat-badge--green">{fmt(totalHours, 0)} total hours</span>
        </div>
      </div>

      {/* ── Top: Parameters + Summary side-by-side ── */}
      <div className="fs-top-grid">
        {/* Left: Parameters */}
        <div className="fs-params-card">
          <h3 className="fs-card-title">Parameters</h3>
          <div className="fs-params-list">
            {params.map((p) => (
              <div key={p.row} className="fs-param-row">
                <div className="fs-param-info">
                  <span className="fs-param-label">{p.label}</span>
                  <span className="fs-param-desc">{p.desc}</span>
                </div>
                <div className="fs-param-input">
                  <CellInput
                    value={p.value}
                    rowIndex={p.row - 1}
                    colIndex={p.col}
                    onCellEdit={onCellEdit}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Totals summary */}
        <div className="fs-summary-card">
          <h3 className="fs-card-title">Effort Summary</h3>
          <div className="fs-summary-numbers">
            <div className="fs-summary-item fs-summary-item--primary">
              <span className="fs-summary-value">{fmt(totalHours, 0)}</span>
              <span className="fs-summary-label">Total Hours</span>
            </div>
            <div className="fs-summary-item">
              <span className="fs-summary-value">{fmt(fsEffort, 0)}</span>
              <span className="fs-summary-label">FS Writing</span>
            </div>
            <div className="fs-summary-item">
              <span className="fs-summary-value">{fmt(wsEffort, 0)}</span>
              <span className="fs-summary-label">Workshops</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Object Effort Breakdown (visual bars) ── */}
      <div className="section-divider">Effort by Object Type</div>
      <div className="fs-effort-bars">
        {objectEfforts.map((obj, i) => {
          const count = objectCounts[i]
          const barWidth = maxEffort > 0 ? (obj.total / maxEffort) * 100 : 0
          return (
            <div key={obj.type} className="fs-bar-row">
              <div className="fs-bar-label">
                <span className="fs-bar-icon">{TYPE_ICONS[obj.type]}</span>
                <span className="fs-bar-name">{obj.type}</span>
                <span className="fs-bar-count">{count.total} obj</span>
              </div>
              <div className="fs-bar-track">
                <div
                  className="fs-bar-fill"
                  style={{ width: `${barWidth}%`, backgroundColor: TYPE_COLORS[obj.type] }}
                />
              </div>
              <span className="fs-bar-hours">{fmt(obj.total, 0)} hrs</span>
            </div>
          )
        })}
      </div>

      {/* ── Counts & Effort Tables side-by-side ── */}
      <div className="section-divider">Detailed Breakdown</div>
      <div className="fs-tables-grid">
        {/* Left: Object Counts */}
        <div className="fs-table-card">
          <h3 className="fs-card-title">Object Counts</h3>
          <table className="sheet-data-table fs-mini-table">
            <thead>
              <tr>
                <th>Type</th>
                {COMPLEXITY.map((c) => <th key={c} className="th-numeric">{c}</th>)}
                <th className="th-numeric th-total">Total</th>
              </tr>
            </thead>
            <tbody>
              {objectCounts.map((obj) => (
                <tr key={obj.type}>
                  <td className="td-label">
                    <span className="fs-type-dot" style={{ backgroundColor: TYPE_COLORS[obj.type] }} />
                    {obj.type}
                  </td>
                  {obj.counts.map((v, ci) => (
                    <td key={ci} className="td-summary-num">{v || ''}</td>
                  ))}
                  <td className="td-summary-num td-total-cell">{obj.total}</td>
                </tr>
              ))}
              <tr className="fs-totals-row">
                <td className="td-label">Total</td>
                {COMPLEXITY.map((_, ci) => {
                  const colTotal = objectCounts.reduce((s, o) => s + o.counts[ci], 0)
                  return <td key={ci} className="td-summary-num">{colTotal || ''}</td>
                })}
                <td className="td-summary-num td-total-cell">{totalCount}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right: Effort Hours */}
        <div className="fs-table-card">
          <h3 className="fs-card-title">Effort Hours</h3>
          <table className="sheet-data-table fs-mini-table">
            <thead>
              <tr>
                <th>Type</th>
                {COMPLEXITY.map((c) => <th key={c} className="th-numeric">{c}</th>)}
                <th className="th-numeric th-total">Total</th>
              </tr>
            </thead>
            <tbody>
              {objectEfforts.map((obj) => (
                <tr key={obj.type}>
                  <td className="td-label">
                    <span className="fs-type-dot" style={{ backgroundColor: TYPE_COLORS[obj.type] }} />
                    {obj.type}
                  </td>
                  {obj.efforts.map((v, ci) => (
                    <td key={ci} className="td-summary-num">{fmt(v)}</td>
                  ))}
                  <td className="td-summary-num td-total-cell">{fmt(obj.total)}</td>
                </tr>
              ))}
              <tr className="fs-totals-row">
                <td className="td-label">Total</td>
                {COMPLEXITY.map((_, ci) => {
                  const colTotal = objectEfforts.reduce((s, o) => s + o.efforts[ci], 0)
                  return <td key={ci} className="td-summary-num">{fmt(colTotal)}</td>
                })}
                <td className="td-summary-num td-total-cell">{fmt(fsEffort)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Year-Split Panels ── */}
      <div className="section-divider">Year-by-Year Breakdown</div>
      <div className="fs-year-grid">
        {yearPanels.map((panel, yi) => (
          <div key={yi} className="fs-year-card">
            <div className="fs-year-header">
              <span className="fs-year-label">{panel.year}</span>
              <span className="fs-year-hours">{fmt(panel.totalYearHours, 0)} hrs</span>
            </div>
            <div className="fs-year-types">
              {panel.types.map((t) => {
                const barW = panel.totalYearHours > 0
                  ? (t.total / panel.totalYearHours) * 100
                  : 0
                return t.total > 0 ? (
                  <div key={t.type} className="fs-year-type-row">
                    <span className="fs-year-type-name">{t.type}</span>
                    <div className="fs-year-bar-track">
                      <div
                        className="fs-year-bar-fill"
                        style={{ width: `${barW}%`, backgroundColor: TYPE_COLORS[t.type] }}
                      />
                    </div>
                    <span className="fs-year-type-hours">{fmt(t.total, 0)}</span>
                  </div>
                ) : null
              })}
            </div>
            <div className="fs-year-footer">
              <span>FS: {fmt(panel.fsHours, 0)}</span>
              <span>WS: {fmt(panel.wsHours, 0)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Base Estimation Matrix (editable) ── */}
      <CollapsibleSection label="Base Estimation Matrix (Man-Days)" defaultOpen={isSolutioner}>
        <div className="fs-tables-grid">
          <div className="fs-table-card">
            <h3 className="fs-card-title">Base Rates <span className="fs-card-subtitle">(editable)</span></h3>
            <table className="sheet-data-table fs-mini-table">
              <thead>
                <tr>
                  <th>Object Type</th>
                  {COMPLEXITY.map((c) => <th key={c} className="th-numeric">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {baseMatrix.map((obj) => (
                  <tr key={obj.type}>
                    <td className="td-label">
                      <span className="fs-type-dot" style={{ backgroundColor: TYPE_COLORS[obj.type] }} />
                      {obj.type}
                    </td>
                    {obj.values.map((v, ci) => (
                      <td key={ci} className="td-editable">
                        <CellInput
                          value={v}
                          rowIndex={obj.row}
                          colIndex={COMPLEXITY_COLS[ci]}
                          onCellEdit={onCellEdit}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="fs-table-card">
            <h3 className="fs-card-title">Adjusted Rates <span className="fs-card-subtitle">(calculated)</span></h3>
            <table className="sheet-data-table fs-mini-table">
              <thead>
                <tr>
                  <th>Object Type</th>
                  {COMPLEXITY.map((c) => <th key={c} className="th-numeric">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {adjustedMatrix.map((obj) => (
                  <tr key={obj.type}>
                    <td className="td-label">
                      <span className="fs-type-dot" style={{ backgroundColor: TYPE_COLORS[obj.type] }} />
                      {obj.type}
                    </td>
                    {obj.values.map((v, ci) => (
                      <td key={ci} className="td-formula">
                        <span className="cell-formula-value">{fmt(v, 2)}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Assumptions ── */}
      {assumptions.length > 0 && (
        <CollapsibleSection label="Assumptions" defaultOpen={false}>
          <ul className="fs-assumptions-list">
            {assumptions.map((text, i) => <li key={i}>{text}</li>)}
          </ul>
        </CollapsibleSection>
      )}
    </section>
  )
}

export default memo(FSEstimationSheetView)
