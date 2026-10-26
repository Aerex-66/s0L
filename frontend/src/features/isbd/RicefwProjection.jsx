import { memo } from 'react'
import {
  ReportChartIcon,
  InterfaceLinkIcon,
  ConversionSyncIcon,
  EnhancementWrenchIcon,
  FormDocIcon,
  WorkflowBranchIcon,
  BoxObjectIcon,
} from '../../shared/ui/Icons'

const TYPE_META = {
  R: { label: 'Reports',      Icon: ReportChartIcon,       color: '#3b82f6' },
  I: { label: 'Interfaces',   Icon: InterfaceLinkIcon,     color: '#8b5cf6' },
  C: { label: 'Conversions',  Icon: ConversionSyncIcon,    color: '#f59e0b' },
  E: { label: 'Enhancements', Icon: EnhancementWrenchIcon, color: '#10b981' },
  F: { label: 'Forms',        Icon: FormDocIcon,           color: '#ec4899' },
  W: { label: 'Workflow',     Icon: WorkflowBranchIcon,    color: '#06b6d4' },
}

const fmt = (v) => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n === 0) return '–'
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/**
 * Read-only RICEFW projection for the iSBD timeline slide.
 * Two side-by-side panels: Development Hours Summary + Effort by Type.
 */
const RicefwProjection = memo(function RicefwProjection({ ricefw }) {
  if (!ricefw) return null
  const { years, summaryRows, additionalRows, grandTotal, subtotal, byType, totalHours, totalObjects } = ricefw
  if (!years?.length) return null

  const maxHours = Math.max(...Object.values(byType || {}).map(d => d.hours))

  return (
    <div className="rfw-proj">
      {/* Left: Hours Summary Table */}
      <div className="rfw-proj-panel">
        <h4 className="rfw-proj-title">Development Hours</h4>
        <table className="rfw-proj-table">
          <thead>
            <tr>
              <th className="rfw-proj-th">Type</th>
              {years.map(y => <th key={y.key} className="rfw-proj-th rfw-proj-th--num">{y.label}</th>)}
              <th className="rfw-proj-th rfw-proj-th--num rfw-proj-th--total">Total</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows?.map((row, i) => (
              <tr key={i} className="rfw-proj-tr">
                <td className="rfw-proj-td">{row.name}</td>
                {years.map(y => <td key={y.key} className="rfw-proj-td rfw-proj-td--num">{fmt(row[y.key])}</td>)}
                <td className="rfw-proj-td rfw-proj-td--num rfw-proj-td--bold">{fmt(row.total)}</td>
              </tr>
            ))}
            {subtotal && (
              <tr className="rfw-proj-tr rfw-proj-tr--subtotal">
                <td className="rfw-proj-td rfw-proj-td--bold">Subtotal</td>
                {years.map(y => <td key={y.key} className="rfw-proj-td rfw-proj-td--num rfw-proj-td--bold">{fmt(subtotal[y.key])}</td>)}
                <td className="rfw-proj-td rfw-proj-td--num rfw-proj-td--bold">{fmt(subtotal.total)}</td>
              </tr>
            )}
            {additionalRows?.map((row, i) => (
              <tr key={`a${i}`} className="rfw-proj-tr rfw-proj-tr--add">
                <td className="rfw-proj-td rfw-proj-td--add">{row.name}</td>
                {years.map(y => <td key={y.key} className="rfw-proj-td rfw-proj-td--num">{fmt(row[y.key])}</td>)}
                <td className="rfw-proj-td rfw-proj-td--num rfw-proj-td--bold">{fmt(row.total)}</td>
              </tr>
            ))}
            {grandTotal && (
              <tr className="rfw-proj-tr rfw-proj-tr--grand">
                <td className="rfw-proj-td rfw-proj-td--grand">Grand Total</td>
                {years.map(y => <td key={y.key} className="rfw-proj-td rfw-proj-td--num rfw-proj-td--grand">{fmt(grandTotal[y.key])}</td>)}
                <td className="rfw-proj-td rfw-proj-td--num rfw-proj-td--grand">{fmt(grandTotal.total)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Right: Effort by Type */}
      <div className="rfw-proj-panel">
        <h4 className="rfw-proj-title">Effort by Type</h4>
        <div className="rfw-proj-bars">
          {Object.entries(byType || {})
            .sort((a, b) => b[1].hours - a[1].hours)
            .map(([code, data]) => {
              const meta = TYPE_META[code]
              const IconComp = meta?.Icon || BoxObjectIcon
              const barW = maxHours > 0 ? (data.hours / maxHours) * 100 : 0
              const pct = totalHours > 0 ? ((data.hours / totalHours) * 100).toFixed(0) : 0
              return (
                <div key={code} className="rfw-proj-bar-row">
                  <div className="rfw-proj-bar-label">
                    <span className="rfw-proj-bar-icon"><IconComp size={10} /></span>
                    <span className="rfw-proj-bar-name">{meta?.label || code}</span>
                  </div>
                  <div className="rfw-proj-bar-track">
                    <div
                      className="rfw-proj-bar-fill"
                      style={{ width: `${barW}%`, backgroundColor: meta?.color || '#6b7280' }}
                    />
                  </div>
                  <span className="rfw-proj-bar-val">{fmt(data.hours)}</span>
                  <span className="rfw-proj-bar-pct">{pct}%</span>
                </div>
              )
            })}
        </div>
        <div className="rfw-proj-totals">
          <span className="rfw-proj-total-item">
            <strong>{fmt(totalObjects)}</strong> objects
          </span>
          <span className="rfw-proj-total-item">
            <strong>{fmt(totalHours)}</strong> dev hours
          </span>
          {grandTotal?.total > 0 && (
            <span className="rfw-proj-total-item">
              <strong>{fmt(grandTotal.total)}</strong> total (incl. overhead)
            </span>
          )}
        </div>
      </div>
    </div>
  )
})

export default RicefwProjection
