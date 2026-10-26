import { memo, useMemo, useState } from 'react'
import CellInput from '../components/CellInput'
import { useColumnToggle } from '../components/ColumnToggle'
import CollapsibleSection from '../components/CollapsibleSection'
import { getSheetDisplayName } from '../utils/normalizer'

const cellText = (rowData = [], rowOneBased, colZeroBased) => {
  const row = rowData[rowOneBased - 1] || {}
  const value = row[`c${colZeroBased}`]
  return value == null ? '' : String(value)
}

/* Column definitions — key matches the data field, col is the 0-based index for edits */
const ALL_COLUMNS = [
  { key: 'company',           label: 'Company',         col: 0,  editable: false, className: 'td-code' },
  { key: 'bandName',          label: 'Band Name',       col: 2,  editable: false },
  { key: 'bandLevel',         label: 'Band',            col: 4,  editable: true },
  { key: 'numericLevel',      label: 'Numeric',         col: 5,  editable: true },
  { key: 'hoursPerDay',       label: 'Hours/Day',       col: 6,  editable: true },
  { key: 'countryCode',       label: 'Country Code',    col: 7,  editable: false, className: 'td-code' },
  { key: 'country',           label: 'Country',         col: 8,  editable: true },
  { key: 'workLocation',      label: 'Work Location',   col: 11, editable: true },
  { key: 'locationName',      label: 'Location Name',   col: 12, editable: true },
  { key: 'roleSource',        label: 'Role Source',     col: 13, editable: false },
  { key: 'shortBand',         label: 'Short Band',      col: 14, editable: false },
  { key: 'localCurrency',     label: 'Currency',        col: 23, editable: false, className: 'td-code' },
  { key: 'baseCostRate',      label: 'Base Cost Rate',  col: 24, editable: true },
  { key: 'adder',             label: 'Adder',           col: 25, editable: true },
  { key: 'inflationType',     label: 'Inflation Type',  col: 20, editable: false },
  { key: 'inflationCategory', label: 'Inflation Cat.',  col: 51, editable: true },
  { key: 'lob',               label: 'LoB',             col: 19, editable: true },
]

const DEFAULT_VISIBLE = {
  company: true, bandName: true, bandLevel: true, numericLevel: true, countryCode: true,
  country: true, workLocation: true, localCurrency: true, baseCostRate: true, adder: true, lob: true,
  hoursPerDay: false, locationName: false, roleSource: false, shortBand: false, inflationType: false, inflationCategory: false,
}

function RatesSheetView({ rowData = [], onCellEdit, isSolutioner }) {
  const [query, setQuery] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const { hiddenSet, ColumnToggleButton, ColumnTogglePanel } = useColumnToggle(
    ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
    DEFAULT_VISIBLE,
  )

  const columns = useMemo(() => ALL_COLUMNS.filter((c) => !hiddenSet.has(c.key)), [hiddenSet])

  const rows = useMemo(() => {
    const list = []
    for (let row = 10; row <= rowData.length; row += 1) {
      const company = cellText(rowData, row, 0)
      const bandName = cellText(rowData, row, 2)
      if (!company && !bandName) continue

      list.push({
        row,
        company,
        bandName,
        bandLevel: cellText(rowData, row, 4),
        numericLevel: cellText(rowData, row, 5),
        hoursPerDay: cellText(rowData, row, 6),
        countryCode: cellText(rowData, row, 7),
        country: cellText(rowData, row, 8),
        workLocation: cellText(rowData, row, 11),
        locationName: cellText(rowData, row, 12),
        roleSource: cellText(rowData, row, 13),
        shortBand: cellText(rowData, row, 14),
        inflationType: cellText(rowData, row, 20),
        lob: cellText(rowData, row, 19),
        localCurrency: cellText(rowData, row, 23),
        baseCostRate: cellText(rowData, row, 24),
        adder: cellText(rowData, row, 25),
        inflationCategory: cellText(rowData, row, 51),
      })
    }
    return list
  }, [rowData])

  const options = useMemo(() => {
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b))
    return {
      country: uniq(rows.map((r) => r.country)),
      company: uniq(rows.map((r) => r.company)),
    }
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((item) => {
      if (countryFilter && item.country !== countryFilter) return false
      if (companyFilter && item.company !== companyFilter) return false
      if (!q) return true
      return `${item.bandName} ${item.country} ${item.countryCode} ${item.shortBand} ${item.lob}`.toLowerCase().includes(q)
    })
  }, [rows, query, countryFilter, companyFilter])

  return (
    <section className="sheet-form-panel">
      <div className="sheet-panel-header">
        <div className="sheet-panel-header-left">
          <h2 className="sheet-panel-title">{getSheetDisplayName('Rates')}</h2>
        </div>
        <div className="stat-row">
          <span className="stat-badge stat-badge--blue">{rows.length} Entries</span>
          <span className="stat-badge stat-badge--gray">{filtered.length} Shown</span>
          {isSolutioner && <ColumnToggleButton />}
        </div>
      </div>

      {isSolutioner && <ColumnTogglePanel />}

      <CollapsibleSection label="Filters">
        <div className="sheet-form-grid">
          <label>
            <span>Search Band / Country / LoB</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rates..." />
          </label>

          <label>
            <span>Country</span>
            <select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}>
              <option value="">All</option>
              {options.country.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>

          <label>
            <span>Company</span>
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="">All</option>
              {options.company.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
      </CollapsibleSection>

      <div className="section-divider">Rate Card</div>

      <div className="sheet-data-table-wrap" style={{ maxHeight: '66vh' }}>
        <table className="sheet-data-table rates-table">
          <thead>
            <tr>
              {columns.map((c) => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.row}>
                {columns.map((c) =>
                  c.editable ? (
                    <td key={c.key}>
                      <CellInput value={item[c.key]} rowIndex={item.row - 1} colIndex={c.col} onCellEdit={onCellEdit} />
                    </td>
                  ) : (
                    <td key={c.key} className={c.className || ''}>{item[c.key]}</td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default memo(RatesSheetView)
