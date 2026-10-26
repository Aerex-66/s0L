import { useMemo, useState } from 'react'
import { IMPLEMENTATION_TYPE_COLORS } from '../../../shared/constants'
import { formatCompactMillions, formatShortDate } from '../../../shared/utils/formatters'

const COLUMNS = [
  { key: 'opportunity_number', label: 'Oppty #', width: '100px' },
  { key: 'client_name',        label: 'Client', width: '140px' },
  { key: 'status',             label: 'Status', width: '90px' },
  { key: 'project_name',       label: 'Description', width: '1fr' },
  { key: 'lead_ssc',           label: 'Lead SSC', width: '110px' },
  { key: 'tcv',                label: 'TCV', width: '100px', align: 'right' },
  { key: 'tt_executive',       label: 'TT Executive', width: '110px' },
  { key: 'implementation_type',label: 'Impl Type', width: '100px' },
  { key: 'currency',           label: 'Curr', width: '55px' },
  { key: 'sector',             label: 'Sector', width: '100px' },
  { key: 'industry',           label: 'Industry', width: '100px' },
  { key: 'sc2',                label: 'SC 2', width: '100px' },
  { key: 'sc3',                label: 'SC 3', width: '100px' },
  { key: 'sc4',                label: 'SC 4', width: '100px' },
  { key: 'created_date',       label: 'Created', width: '80px' },
  { key: 'deal_type',          label: 'Deal Type', width: '80px' },
]

const STATUS_COLORS = {
  'Active':       '#24a148',
  'In Progress':  '#0f62fe',
  'On Hold':      '#f1c21b',
  'Closed Won':   '#198038',
  'Closed Lost':  '#da1e28',
  'Archived':     '#8d8d8d',
}

function getTcv(deal) {
  return deal.financials?.tcv || deal.estimated_value || deal.price_to_win || null
}

function getSolutionConsultant(deal) {
  return deal.resources?.specialists?.solution_consultant || ''
}

export default function PipelineMetrics({ deals, onSelectDeal }) {
  const [sortKey, setSortKey] = useState('created_date')
  const [sortDir, setSortDir] = useState('desc')

  const rows = useMemo(() => {
    return deals.map(d => ({
      id: d.id,
      opportunity_number: d.opportunity_number || '',
      client_name: d.client_name || '',
      status: d.status || '',
      project_name: d.project_name || '',
      lead_ssc: d.lead_ssc || '',
      tcv: getTcv(d),
      tt_executive: d.tt_executive || '',
      implementation_type: d.implementation_type || '',
      currency: d.currency || d.pti?.currency || 'USD',
      sector: d.sector || '',
      industry: d.industry || '',
      sc2: d.solution_consultant_2 || '',
      sc3: d.solution_consultant_3 || '',
      sc4: d.solution_consultant_4 || '',
      created_date: d.created_date || '',
      deal_type: d.deal_type || '',
      _implColor: IMPLEMENTATION_TYPE_COLORS[d.implementation_type] || '#8d8d8d',
    }))
  }, [deals])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey]
      if (sortKey === 'tcv') {
        va = Number(va) || 0
        vb = Number(vb) || 0
      } else {
        va = String(va || '').toLowerCase()
        vb = String(vb || '').toLowerCase()
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [rows, sortKey, sortDir])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // Summary stats
  const totalTcv = useMemo(() => rows.reduce((s, r) => s + (Number(r.tcv) || 0), 0), [rows])
  const wonCount = useMemo(() => rows.filter(r => r.status === 'Closed Won').length, [rows])
  const activeCount = useMemo(() => rows.filter(r => r.status === 'Active' || r.status === 'In Progress').length, [rows])

  return (
    <div className="pipeline-metrics">
      {/* Summary strip */}
      <div className="pm-summary">
        <div className="pm-stat">
          <span className="pm-stat-value">{deals.length}</span>
          <span className="pm-stat-label">Total Deals</span>
        </div>
        <div className="pm-stat">
          <span className="pm-stat-value">{activeCount}</span>
          <span className="pm-stat-label">Active</span>
        </div>
        <div className="pm-stat">
          <span className="pm-stat-value pm-won">{wonCount}</span>
          <span className="pm-stat-label">Won</span>
        </div>
        <div className="pm-stat">
          <span className="pm-stat-value">{formatCompactMillions(totalTcv)}</span>
          <span className="pm-stat-label">Pipeline TCV</span>
        </div>
      </div>

      {/* Table */}
      <div className="pm-table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={sortKey === col.key ? 'pm-sorted' : ''}
                  style={{ textAlign: col.align || 'left', width: col.width }}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && <span className="pm-sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.id} onClick={() => onSelectDeal(row.id)} className="pm-row">
                <td className="pm-mono">{row.opportunity_number}</td>
                <td>{row.client_name}</td>
                <td>
                  <span className="pm-status" style={{ '--status-color': STATUS_COLORS[row.status] || '#8d8d8d' }}>
                    {row.status}
                  </span>
                </td>
                <td className="pm-desc">{row.project_name}</td>
                <td>{row.lead_ssc}</td>
                <td className="pm-mono" style={{ textAlign: 'right' }}>{row.tcv ? formatCompactMillions(row.tcv) : '—'}</td>
                <td>{row.tt_executive}</td>
                <td>
                  <span className="pm-impl" style={{ color: row._implColor }}>{row.implementation_type}</span>
                </td>
                <td>{row.currency}</td>
                <td>{row.sector}</td>
                <td>{row.industry}</td>
                <td>{row.sc2}</td>
                <td>{row.sc3}</td>
                <td>{row.sc4}</td>
                <td className="pm-mono">{formatShortDate(row.created_date)}</td>
                <td>{row.deal_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
