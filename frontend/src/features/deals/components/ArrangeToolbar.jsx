import { cx } from '../../../shared/utils/cx'
import { LIST_FILTERS } from '../listFilters'
import { ROW_PAGE_SIZES } from '../useArrangement'

/** The toolbar strip that arranges a deal list: Group, then (when on) Filter and Rows. Reads and sets a useArrangement(). */
export default function ArrangeToolbar({ arrangement, rows = true, label = 'Arrange deals' }) {
  const { groupings, groupBy, setGrouping, filtering, filters, setFilters, options, rowsPerPage, setRowsPerPage, groups } = arrangement
  const filtersSet = LIST_FILTERS.some(({ key }) => filters[key])

  return (
    <div className="toolbar-strip deal-toolbar" role="toolbar" aria-label={label}>
      <div className="toolbar-strip-group">
        <span className="toolbar-strip-label">Group</span>
        {groupings.map(({ id, label: name }) => (
          <button
            key={id}
            type="button"
            className={cx('chip', 'chip--interactive', groupBy === id && 'chip--active')}
            aria-pressed={groupBy === id}
            onClick={() => setGrouping(id)}
          >
            {name}
          </button>
        ))}
      </div>
      {filtering && (
        <div className="toolbar-strip-group">
          <span className="toolbar-strip-label">Filter</span>
          {LIST_FILTERS.map(({ key, label: name }) => (
            <select
              key={key}
              className={cx('deal-filter', filters[key] && 'deal-filter--set')}
              value={filters[key] || ''}
              aria-label={name}
              onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))}
            >
              <option value="">{name}: all</option>
              {options[key].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          ))}
          {filtersSet && (
            <button type="button" className="chip chip--interactive" onClick={() => setFilters({})}>Clear</button>
          )}
        </div>
      )}
      {rows && !groups && (
        <div className="toolbar-strip-group">
          <span className="toolbar-strip-label">Rows</span>
          {ROW_PAGE_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={cx('chip', 'chip--interactive', rowsPerPage === size && 'chip--active')}
              aria-pressed={rowsPerPage === size}
              onClick={() => setRowsPerPage(size)}
            >
              {size}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
