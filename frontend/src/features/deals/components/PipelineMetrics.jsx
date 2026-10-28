import { useMemo, useState } from 'react'
import { IMPLEMENTATION_TYPE_COLORS, dealStatusColor } from '../../../shared/constants'
import { formatCompactMillions, formatShortDate } from '../../../shared/utils/formatters'
import { ChevronRightIcon, SortAscIcon, SortDescIcon } from '../../../shared/ui/Icons'
import { cx } from '../../../shared/utils/cx'
import AssignDialog from './AssignDialog'
import Pagination from './Pagination'
import PersonCell from './PersonCell'
import { usePage } from '../pagination'
import { dealTcv } from '../tcv'
import { useAssignPeople } from '../useAssignPeople'
import useDealStore from '../../../shared/dealStore'

const COLUMNS = [
  { key: 'opportunity_number', label: 'Oppty #', width: '160px' },
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
  { key: 'sc2',                label: 'SC 2', className: 'pm-sc' },
  { key: 'sc3',                label: 'SC 3', className: 'pm-sc' },
  { key: 'sc4',                label: 'SC 4', className: 'pm-sc' },
  { key: 'created_date',       label: 'Created', width: '80px' },
  { key: 'deal_type',          label: 'Deal Type', width: '80px' },
]

function toRow(d) {
  return {
    id: d.id,
    opportunity_number: d.opportunity_number || '',
    client_name: d.client_name || '',
    status: d.status || '',
    project_name: d.project_name || '',
    lead_ssc: d.lead_ssc || '',
    tcv: dealTcv(d),
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
    _deal: d,
  }
}

/**
 * The deals as a sortable table. With `groups` (by solutioner or TCV band), each group is a
 * summary row that opens onto its deals; otherwise rows are paged, `pageSize` at a time.
 */
export default function PipelineMetrics({ deals, groups = null, openGroups, onToggleGroup, pageSize = 50, resetKey = '', onSelectDeal }) {
  const [sortKey, setSortKey] = useState('created_date')
  const [sortDir, setSortDir] = useState('desc')
  const assign = useAssignPeople()
  // Only TT Execs assign people; everyone else sees the names.
  const canAssign = useDealStore((s) => Boolean(s.mondayMe?.is_exec))

  const rows = useMemo(() => deals.map(toRow), [deals])

  const sortRows = (list) => [...list].sort((a, b) => {
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
  const sorted = sortRows(rows)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const { page, pageCount, setPage } = usePage(sorted.length, pageSize, `${resetKey}|${sortKey}|${sortDir}|${pageSize}`)
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize)

  const person = (row, field, clip = false) => (
    <PersonCell deal={row._deal} field={field} clip={clip} assign={assign} canAssign={canAssign} />
  )

  const renderRow = (row) => (
    <tr key={row.id} onClick={() => onSelectDeal(row.id)} className="pm-row">
      <td className="pm-mono">{row.opportunity_number}</td>
      <td>{row.client_name}</td>
      <td>
        <span className="pm-status" style={{ '--status-color': dealStatusColor(row.status) }}>
          {row.status}
        </span>
      </td>
      <td className="pm-desc">{row.project_name}</td>
      <td>{person(row, 'lead_ssc')}</td>
      <td className="pm-num" style={{ textAlign: 'right' }}>{row.tcv ? formatCompactMillions(row.tcv) : '—'}</td>
      <td>{person(row, 'tt_executive')}</td>
      <td>
        <span className="pm-impl" style={{ color: row._implColor }}>{row.implementation_type}</span>
      </td>
      <td>{row.currency}</td>
      <td>{row.sector}</td>
      <td>{row.industry}</td>
      <td className="pm-sc">{person(row, 'solution_consultant_2', true)}</td>
      <td className="pm-sc">{person(row, 'solution_consultant_3', true)}</td>
      <td className="pm-sc">{person(row, 'solution_consultant_4', true)}</td>
      <td>{formatShortDate(row.created_date)}</td>
      <td>{row.deal_type}</td>
    </tr>
  )

  return (
    <div className="pipeline-metrics">
      <div className="pm-table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={cx(col.className, sortKey === col.key && 'pm-sorted')}
                  style={{ textAlign: col.align || 'left', width: col.width }}
                  aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="pm-th">
                    {col.label}
                    {sortKey === col.key && (sortDir === 'asc' ? <SortAscIcon /> : <SortDescIcon />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td className="pm-empty" colSpan={COLUMNS.length}>No deals to show</td>
              </tr>
            )}
            {groups ? groups.map((group) => {
              const open = openGroups?.has(group.key)
              return [
                <tr key={`group-${group.key}`} className={cx('pm-group', open && 'pm-group--open')} onClick={() => onToggleGroup?.(group.key)}>
                  <td colSpan={COLUMNS.length}>
                    <span className="pm-group-head" aria-expanded={open}>
                      <ChevronRightIcon className="pm-group-chevron" aria-hidden="true" />
                      <span className="pm-group-name">
                        {group.color && <i className="deal-status-dot" style={{ '--status-c': group.color }} aria-hidden="true" />}
                        {group.label}
                      </span>
                      <span className="pm-group-meta">{group.count} {group.count === 1 ? 'deal' : 'deals'}</span>
                      <span className="pm-group-meta pm-num">{group.tcv > 0 ? formatCompactMillions(group.tcv) : '—'}</span>
                    </span>
                  </td>
                </tr>,
                ...(open ? sortRows(group.deals.map(toRow)).map(renderRow) : []),
              ]
            }) : pageRows.map(renderRow)}
          </tbody>
        </table>
      </div>
      {!groups && <Pagination page={page} pageCount={pageCount} total={sorted.length} pageSize={pageSize} onPage={setPage} />}
      <AssignDialog assign={assign} />
    </div>
  )
}
