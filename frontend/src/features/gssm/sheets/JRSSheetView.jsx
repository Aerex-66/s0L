import { memo, useMemo, useState } from 'react'
import { useColumnToggle } from '../components/ColumnToggle'
import CollapsibleSection from '../components/CollapsibleSection'
import { getSheetDisplayName } from '../utils/normalizer'

const JRS_COLUMNS = [
  { key: 'lob', label: 'LoB' },
  { key: 'jobRole', label: 'Job Role' },
  { key: 'specialty', label: 'Specialty' },
  { key: 'description', label: 'JRS Description' },
  { key: 'service', label: 'JRS Service' },
  { key: 'serviceArea', label: 'JRS Service Area' },
  { key: 'updated', label: 'Updated' },
]

const cellText = (rowData = [], rowOneBased, colZeroBased) => {
  const row = rowData[rowOneBased - 1] || {}
  const value = row[`c${colZeroBased}`]
  return value == null ? '' : String(value)
}

function JRSSheetView({ rowData = [], isSolutioner }) {
  const [query, setQuery] = useState('')
  const [lobFilter, setLobFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [specialtyFilter, setSpecialtyFilter] = useState('')
  const [serviceAreaFilter, setServiceAreaFilter] = useState('')
  const { hiddenSet, ColumnToggleButton, ColumnTogglePanel } = useColumnToggle(JRS_COLUMNS)

  const headers = useMemo(() => ({
    lob: cellText(rowData, 4, 0) || 'LoB',
    jobRole: cellText(rowData, 4, 1) || 'Job Role',
    specialty: cellText(rowData, 4, 2) || 'Specialty',
    description: cellText(rowData, 4, 3) || 'JRS Description',
    service: cellText(rowData, 4, 4) || 'JRS Service',
    serviceArea: cellText(rowData, 4, 5) || 'JRS Service Area',
    updated: 'Updated',
  }), [rowData])

  const rows = useMemo(() => {
    const items = []
    for (let row = 5; row <= rowData.length; row += 1) {
      const lob = cellText(rowData, row, 0)
      const jobRole = cellText(rowData, row, 1)
      const specialty = cellText(rowData, row, 2)
      const description = cellText(rowData, row, 3)
      const service = cellText(rowData, row, 4)
      const serviceArea = cellText(rowData, row, 5)
      const updated = cellText(rowData, row, 7)

      if (!lob && !jobRole && !specialty && !description && !service && !serviceArea) continue
      items.push({ row, lob, jobRole, specialty, description, service, serviceArea, updated })
    }
    return items
  }, [rowData])

  const filterOptions = useMemo(() => {
    const uniq = (values) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b))
    return {
      lobs: uniq(rows.map((row) => row.lob)),
      roles: uniq(rows.map((row) => row.jobRole)),
      specialties: uniq(rows.map((row) => row.specialty)),
      serviceAreas: uniq(rows.map((row) => row.serviceArea)),
    }
  }, [rows])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    return rows.filter((item) => (
      (!lobFilter || item.lob === lobFilter)
      && (!roleFilter || item.jobRole === roleFilter)
      && (!specialtyFilter || item.specialty === specialtyFilter)
      && (!serviceAreaFilter || item.serviceArea === serviceAreaFilter)
      && (!text || `${item.lob} ${item.jobRole} ${item.specialty} ${item.description} ${item.service} ${item.serviceArea} ${item.updated}`
        .toLowerCase()
        .includes(text))
    ))
  }, [rows, query, lobFilter, roleFilter, specialtyFilter, serviceAreaFilter])

  const clearFilters = () => {
    setQuery('')
    setLobFilter('')
    setRoleFilter('')
    setSpecialtyFilter('')
    setServiceAreaFilter('')
  }

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('JRS')}</h2>
        </div>
        <div className="stat-row">
          <span className="stat-badge stat-badge--blue">{rows.length} Roles</span>
          <span className="stat-badge stat-badge--gray">{filtered.length} Shown</span>
          {isSolutioner && <ColumnToggleButton />}
        </div>
      </div>

      {isSolutioner && <ColumnTogglePanel />}

      <CollapsibleSection label="Filters">
        <div className="sheet-form-grid">
          <label>
            <span>Search JRS</span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by LoB, role, specialty, service..."
            />
          </label>

          <label>
            <span>{headers.lob}</span>
            <select value={lobFilter} onChange={(event) => setLobFilter(event.target.value)}>
              <option value="">All</option>
              {filterOptions.lobs.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>

          <label>
            <span>{headers.jobRole}</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">All</option>
              {filterOptions.roles.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>

          <label>
            <span>{headers.specialty}</span>
            <select value={specialtyFilter} onChange={(event) => setSpecialtyFilter(event.target.value)}>
              <option value="">All</option>
              {filterOptions.specialties.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>

          <label>
            <span>{headers.serviceArea}</span>
            <select value={serviceAreaFilter} onChange={(event) => setServiceAreaFilter(event.target.value)}>
              <option value="">All</option>
              {filterOptions.serviceAreas.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>

        <div className="jrs-filter-bar">
          <span>{filtered.length} rows</span>
          <button type="button" className="secondary-button" onClick={clearFilters}>Clear filters</button>
        </div>
      </CollapsibleSection>

      <div className="section-divider">Role Catalog</div>
      <div className="sheet-data-table-wrap jrs-table-wrap">
        <table className="sheet-data-table">
          <thead>
            <tr>
              {!hiddenSet.has('lob') && <th>{headers.lob}</th>}
              {!hiddenSet.has('jobRole') && <th>{headers.jobRole}</th>}
              {!hiddenSet.has('specialty') && <th>{headers.specialty}</th>}
              {!hiddenSet.has('description') && <th>{headers.description}</th>}
              {!hiddenSet.has('service') && <th>{headers.service}</th>}
              {!hiddenSet.has('serviceArea') && <th>{headers.serviceArea}</th>}
              {!hiddenSet.has('updated') && <th>{headers.updated}</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.row}>
                {!hiddenSet.has('lob') && <td className="td-lob">{item.lob}</td>}
                {!hiddenSet.has('jobRole') && <td>{item.jobRole}</td>}
                {!hiddenSet.has('specialty') && <td>{item.specialty}</td>}
                {!hiddenSet.has('description') && <td className="td-dim">{item.description}</td>}
                {!hiddenSet.has('service') && <td>{item.service}</td>}
                {!hiddenSet.has('serviceArea') && <td>{item.serviceArea}</td>}
                {!hiddenSet.has('updated') && <td className="td-dim">{item.updated}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(JRSSheetView)
