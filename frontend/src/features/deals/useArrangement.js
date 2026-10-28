import { useEffect, useMemo, useState } from 'react'
import { GROUPINGS, groupDeals } from './grouping'
import { applyFilters, filterOptions, searchDeals } from './listFilters'
import { dealTcv } from './tcv'

export const ROW_PAGE_SIZES = [25, 50, 100]
const DEFAULT_ROWS = 50

const isText = (value) => typeof value === 'string'

/** A saved arrangement (JSON text) made safe to use; anything missing or malformed takes its default. */
export function restoreArrangement(text) {
  let saved = {}
  try {
    saved = JSON.parse(text) || {}
  } catch {
    saved = {}
  }
  const filters = saved.filters && typeof saved.filters === 'object' && !Array.isArray(saved.filters) ? saved.filters : {}
  return {
    grouping: isText(saved.grouping) ? saved.grouping : null,
    filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => isText(value) && value)),
    rowsPerPage: ROW_PAGE_SIZES.includes(saved.rowsPerPage) ? saved.rowsPerPage : DEFAULT_ROWS,
    openGroups: Array.isArray(saved.openGroups) ? saved.openGroups.filter(isText) : [],
  }
}

/** The filters that still match something here, so a remembered value can't empty the list. */
export const liveFilters = (filters, options) =>
  Object.fromEntries(Object.entries(filters).filter(([key, value]) => value && options[key]?.includes(value)))

function load(key) {
  try {
    return restoreArrangement(key ? localStorage.getItem(key) : null)
  } catch {
    return restoreArrangement(null)
  }
}

/**
 * How a list of deals is arranged on screen: search, the list filters, a grouping (with its open
 * groups) and rows per page. `groupings` limits the groupings offered; `filtering` turns the filters off.
 * With `rememberAs`, everything but the search is kept on this computer under that localStorage key.
 */
export function useArrangement(deals, { groupings = GROUPINGS, defaultGroup = 'none', filtering = true, rememberAs } = {}) {
  const [saved] = useState(() => load(rememberAs))
  const [searchTerm, setSearchTerm] = useState('')
  const [grouping, setGrouping] = useState(saved.grouping)
  const [filters, setFilters] = useState(saved.filters)
  const [rowsPerPage, setRowsPerPage] = useState(saved.rowsPerPage)
  const [openGroups, setOpenGroups] = useState(() => new Set(saved.openGroups))

  useEffect(() => {
    if (!rememberAs) return
    try {
      localStorage.setItem(rememberAs, JSON.stringify({ grouping, filters, rowsPerPage, openGroups: [...openGroups] }))
    } catch {
      // Private mode: the arrangement just isn't remembered.
    }
  }, [rememberAs, grouping, filters, rowsPerPage, openGroups])

  const picked = grouping ?? defaultGroup
  const groupBy = groupings.some((option) => option.id === picked) ? picked : 'none'
  const options = useMemo(() => filterOptions(deals), [deals])
  const applied = liveFilters(filters, options)
  const searched = searchDeals(deals, searchTerm)
  const shown = filtering ? applyFilters(searched, applied) : searched
  const groups = groupDeals(shown, groupBy, dealTcv)

  const toggleGroup = (key) => setOpenGroups((open) => {
    const next = new Set(open)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return {
    searchTerm, setSearchTerm,
    groupings, groupBy, setGrouping,
    filtering, filters: applied, setFilters, options,
    rowsPerPage, setRowsPerPage,
    openGroups, toggleGroup,
    shown, groups,
    resetKey: `${searchTerm}|${groupBy}|${JSON.stringify(applied)}`,
  }
}
