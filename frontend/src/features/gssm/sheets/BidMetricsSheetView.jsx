import { memo } from 'react'
import { Check } from 'lucide-react'
import { CellSelect } from '../components/CellInput'
import { useColumnToggle } from '../components/ColumnToggle'
import CollapsibleSection from '../components/CollapsibleSection'
import { getSheetDisplayName } from '../utils/normalizer'

const BID_COLUMNS = [
  { key: 'slNo', label: 'Sl' },
  { key: 'criteria', label: 'Criteria' },
  { key: 'low', label: 'Low' },
  { key: 'high', label: 'High' },
  { key: 'actual', label: 'Actual' },
  { key: 'met', label: 'Met' },
  { key: 'hardSoft', label: 'Hard/Soft' },
  { key: 'comment', label: 'Comment' },
]

const cellText = (rowData = [], rowOneBased, colZeroBased) => {
  const row = rowData[rowOneBased - 1] || {}
  const value = row[`c${colZeroBased}`]
  return value == null ? '' : String(value)
}

const formatDisplayValue = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(text)) {
    const numeric = Number(text)
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    }
  }
  return text
}

const toNumber = (value) => {
  const text = String(value ?? '').trim().replace(/,/g, '')
  if (!text) return null
  const numeric = Number(text)
  return Number.isFinite(numeric) ? numeric : null
}

const getStatusTone = ({ met, low, high, actual }) => {
  const metText = String(met || '').trim().toLowerCase()
  if (metText === 'yes') return 'good'
  if (metText === 'no') {
    const lowNum = toNumber(low)
    const highNum = toNumber(high)
    const actualNum = toNumber(actual)
    if (actualNum == null) return 'bad'

    const targets = [lowNum, highNum].filter((n) => n != null)
    if (!targets.length) return 'bad'

    const minDistance = Math.min(...targets.map((target) => {
      const denom = Math.max(Math.abs(target), 1)
      return Math.abs(actualNum - target) / denom
    }))

    return minDistance <= 0.1 ? 'warn' : 'bad'
  }
  return 'warn'
}

const REGION_OPTIONS = ['AMERICAS-NA', 'AMERICAS-LA', 'EMEA', 'APAC', 'GCG', 'JAPAN']
const TYPE_OPTIONS = ['Transformation', 'Tech Conversion']

/**
 * Generate an actionable suggestion for an unmet bid metric.
 *
 * Goes beyond simple gap labels:
 *  - Quantifies FTE shifts needed (using totalFte as denominator)
 *  - Projects the resulting actual after the shift
 *  - Flags when a fix would likely conflict with another metric
 *  - Returns '' if met or not actionable
 */
const generateSuggestion = (item, totalFte, allItems) => {
  if (item.tone === 'good') return ''
  const actual = toNumber(item.actual)
  if (actual == null) return ''
  const low = toNumber(item.low)
  const high = toNumber(item.high)
  const criteria = String(item.criteria || '').toLowerCase()
  const fte = totalFte || 0

  const aboveHigh = high != null && actual > high
  const belowLow = low != null && actual < low
  if (!aboveHigh && !belowLow) return ''

  // Target = midpoint of range (or the single bound if only one exists)
  const target = (low != null && high != null) ? (low + high) / 2
    : high != null ? high : low

  // Gap in percentage points
  const gapPP = Math.abs(actual - target)
  const fmtPP = (n) => Math.abs(n).toFixed(1)

  // FTE math: gap in pp × total FTE = approx FTE count to shift
  const fteShift = fte > 0 ? Math.ceil(gapPP * fte / 100) : null
  const fteLabel = fteShift != null ? `~${fteShift} FTE` : 'some FTEs'

  // Projected result after shifting to midpoint
  const projLabel = target != null ? ` → ~${(target * 100).toFixed(1)}%` : ''

  // Conflict checker: find another metric that would be hurt by our proposed fix
  const findConflict = (otherKeyword) => {
    if (!allItems) return null
    const other = allItems.find(r =>
      r !== item &&
      r.tone === 'good' &&
      String(r.criteria || '').toLowerCase().includes(otherKeyword)
    )
    return other ? String(other.criteria || '').split(/[(%]/)[0].trim() : null
  }

  // ── Location mix metrics ──
  if (criteria.includes('global cic') && criteria.includes('offshore')) {
    const conflict = belowLow ? findConflict('local') : findConflict('total cic')
    const warn = conflict ? ` ⚠ may affect ${conflict}` : ''
    if (belowLow) return `${fmtPP(gapPP)}pp below mid-target. Move ${fteLabel} from local → offshore CIC${projLabel}.${warn}`
    if (aboveHigh) return `${fmtPP(gapPP)}pp above mid-target. Move ${fteLabel} from offshore → local${projLabel}.${warn}`
  }

  if (criteria.includes('domestic cic') && criteria.includes('nearshore')) {
    const conflict = aboveHigh ? findConflict('total cic') : null
    const warn = conflict ? ` ⚠ may affect ${conflict}` : ''
    if (belowLow) return `${fmtPP(gapPP)}pp below mid-target. Move ${fteLabel} from local → nearshore CIC${projLabel}.${warn}`
    if (aboveHigh) return `${fmtPP(gapPP)}pp above mid-target. Move ${fteLabel} from nearshore → local or offshore${projLabel}.${warn}`
  }

  if (criteria.includes('total cic') && criteria.includes('offshore+nearshore')) {
    const conflict = belowLow ? findConflict('local') : findConflict('global cic')
    const warn = conflict ? ` ⚠ may affect ${conflict}` : ''
    if (belowLow) return `${fmtPP(gapPP)}pp below mid-target. Increase combined CIC by ${fteLabel}${projLabel}.${warn}`
    if (aboveHigh) return `${fmtPP(gapPP)}pp above mid-target. Move ${fteLabel} from CIC → local${projLabel}.${warn}`
  }

  if (criteria.includes('domestic') && criteria.includes('local') && !criteria.includes('cic') && !criteria.includes('band')) {
    const conflict = belowLow ? findConflict('global cic') : findConflict('total cic')
    const warn = conflict ? ` ⚠ may affect ${conflict}` : ''
    if (belowLow) return `${fmtPP(gapPP)}pp below mid-target. Move ${fteLabel} from CIC → local delivery${projLabel}.${warn}`
    if (aboveHigh) return `${fmtPP(gapPP)}pp above mid-target. Move ${fteLabel} from local → CIC${projLabel}.${warn}`
  }

  // ── Band ratio / mix metrics ──
  if (criteria.includes('b6') && criteria.includes('b7') && criteria.includes('ratio')) {
    if (belowLow) return `Ratio ${fmtPP(gapPP)} below mid-target. Swap ${fteLabel} from B7 → B6, or add B6 resources.`
    if (aboveHigh) return `Ratio ${fmtPP(gapPP)} above mid-target. Swap ${fteLabel} from B6 → B7, or add more B7 resources.`
  }

  if (criteria.includes('b7') && criteria.includes('below') && criteria.includes('%')) {
    if (belowLow) return `${fmtPP(gapPP)}pp below target. Replace ${fteLabel} senior (B6+) with B7 & below.`
    return ''
  }

  if (criteria.includes('band mix')) {
    const scope = criteria.includes('global cic') ? 'Offshore CIC'
      : criteria.includes('domestic cic') ? 'Nearshore CIC'
      : criteria.includes('domestic') ? 'Local'
      : 'Overall'
    if (aboveHigh) {
      return `${scope} mix ${fmtPP(gapPP)} above mid-target — too senior. Downgrade ${fteLabel} from B8+ → B7${projLabel}.`
    }
    if (belowLow) {
      return `${scope} mix ${fmtPP(gapPP)} below mid-target — too junior. Upgrade ${fteLabel} from B7 → B8+${projLabel}.`
    }
  }

  // ── Leadership / role mix metrics ──
  if (criteria.includes('leadership') && criteria.includes('%')) {
    if (belowLow) return `${fmtPP(gapPP)}pp below target. Add ${fteLabel} B9+ leadership to CIC.`
    if (aboveHigh) return `${fmtPP(gapPP)}pp above target. Reduce ${fteLabel} B9+ CIC headcount.`
  }

  if (criteria.includes('p/ap') && criteria.includes('%')) {
    if (belowLow) return `${fmtPP(gapPP)}pp below target. Add ${fteLabel} at P/AP level.`
    if (aboveHigh) return `${fmtPP(gapPP)}pp above target. Reduce ${fteLabel} P/AP-level resources.`
  }

  if (criteria.includes('associate') && criteria.includes('%')) {
    if (belowLow) return `${fmtPP(gapPP)}pp below target. Add ${fteLabel} associates.`
    if (aboveHigh) return `${fmtPP(gapPP)}pp above target. Reduce ${fteLabel} associate headcount.`
  }

  // ── Generic fallback ──
  if (belowLow) return `${fmtPP(gapPP)}pp below mid-target. Adjust ${fteLabel} to close the gap${projLabel}.`
  if (aboveHigh) return `${fmtPP(gapPP)}pp above mid-target. Adjust ${fteLabel} to close the gap${projLabel}.`
  return ''
}

function BidMetricsSheetView({ rowData = [], onCellEdit, isSolutioner }) {
  const { hiddenSet, ColumnToggleButton, ColumnTogglePanel } = useColumnToggle(BID_COLUMNS)
  const region = cellText(rowData, 1, 1)
  const bidType = cellText(rowData, 2, 1)
  const avgFte = cellText(rowData, 3, 1)

  const tableRows = []
  for (let row = 6; row <= 35; row += 1) {
    const slNo = cellText(rowData, row, 0)
    const criteria = cellText(rowData, row, 1)
    if (!slNo && !criteria) continue
    const rowItem = {
      row,
      slNo,
      criteria,
      low: cellText(rowData, row, 2),
      high: cellText(rowData, row, 3),
      actual: cellText(rowData, row, 4),
      met: cellText(rowData, row, 5),
      hardSoft: cellText(rowData, row, 6),
      comment: cellText(rowData, row, 7),
    }
    rowItem.tone = getStatusTone(rowItem)
    tableRows.push(rowItem)
  }

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('Bid Metrics')}</h2>
        </div>
        <div className="stat-row">
          <span className="stat-badge stat-badge--blue">{tableRows.length} Criteria</span>
          <span className="stat-badge stat-badge--green">{tableRows.filter(r => r.tone === 'good').length} Met</span>
          <span className="stat-badge stat-badge--yellow">{tableRows.filter(r => r.tone === 'bad').length} Not Met</span>
          {isSolutioner && <ColumnToggleButton />}
        </div>
      </div>

      {isSolutioner && <ColumnTogglePanel />}

      <CollapsibleSection label="Configuration">
        <div className="sheet-form-grid">
          <label>
            <span>Region (B1)</span>
            <CellSelect value={region} rowIndex={0} colIndex={1} onCellEdit={onCellEdit}>
              <option value="">Select region</option>
              {REGION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </CellSelect>
          </label>

          <label>
            <span>Bid Metrics Type (B2)</span>
            <CellSelect value={bidType} rowIndex={1} colIndex={1} onCellEdit={onCellEdit}>
              <option value="">Select type</option>
              {TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </CellSelect>
          </label>

          <label>
            <span>Average FTE (B3)</span>
            <input value={formatDisplayValue(avgFte)} readOnly />
          </label>
        </div>
      </CollapsibleSection>

      <div className="section-divider">Criteria Table <span style={{ color: 'var(--text-placeholder)', fontStyle: 'italic', fontWeight: 400, fontSize: '0.75rem', marginLeft: '8px' }}>(AI option pending)</span></div>
      <div className="sheet-data-table-wrap">
        <table className="sheet-data-table">
          <thead>
            <tr>
              {!hiddenSet.has('slNo') && <th>Sl</th>}
              {!hiddenSet.has('criteria') && <th>Criteria</th>}
              {!hiddenSet.has('low') && <th>Low</th>}
              {!hiddenSet.has('high') && <th>High</th>}
              {!hiddenSet.has('actual') && <th>Actual</th>}
              {!hiddenSet.has('met') && <th>Met</th>}
              {!hiddenSet.has('hardSoft') && <th>Hard/Soft</th>}
              {!hiddenSet.has('comment') && <th>Comment</th>}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((item) => (
              <tr key={item.row} className={`bid-tone-${item.tone}`}>
                {!hiddenSet.has('slNo') && <td>{item.slNo}</td>}
                {!hiddenSet.has('criteria') && <td>{item.criteria}</td>}
                {!hiddenSet.has('low') && <td>{formatDisplayValue(item.low)}</td>}
                {!hiddenSet.has('high') && <td>{formatDisplayValue(item.high)}</td>}
                {!hiddenSet.has('actual') && <td>{formatDisplayValue(item.actual)}</td>}
                {!hiddenSet.has('met') && <td>
                  <span className={`metric-chip metric-${item.tone}`}>{item.met || 'N/A'}</span>
                </td>}
                {!hiddenSet.has('hardSoft') && <td>
                  <span className={String(item.hardSoft || '').toLowerCase() === 'hard' ? 'metric-chip metric-hard' : 'metric-chip metric-soft'}>
                    {item.hardSoft || '-'}
                  </span>
                </td>}
                {!hiddenSet.has('comment') && <td>
                  {item.comment
                    ? item.comment
                    : item.tone !== 'good' && generateSuggestion(item, toNumber(avgFte), tableRows)
                      ? <span style={{ color: 'var(--c-yellow-30)', fontSize: '0.75rem' }}>{generateSuggestion(item, toNumber(avgFte), tableRows)}</span>
                      : item.tone === 'good'
                        ? <span style={{ color: 'var(--c-green-40)', fontSize: '0.75rem' }}><Check size={12} style={{ marginRight: 2, verticalAlign: 'middle' }} /> Within target</span>
                        : ''
                  }
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(BidMetricsSheetView)
