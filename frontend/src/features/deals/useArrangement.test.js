import { describe, expect, it } from 'vitest'
import { liveFilters, restoreArrangement } from './useArrangement'

describe('restoreArrangement', () => {
  it('brings back a saved grouping, filters, rows and open groups', () => {
    const saved = JSON.stringify({ grouping: 'status', filters: { practice: 'SAP', status: 7 }, rowsPerPage: 100, openGroups: ['SAP', 3] })
    expect(restoreArrangement(saved)).toEqual({ grouping: 'status', filters: { practice: 'SAP' }, rowsPerPage: 100, openGroups: ['SAP'] })
  })

  it('falls back to the defaults for anything missing or malformed', () => {
    const defaults = { grouping: null, filters: {}, rowsPerPage: 50, openGroups: [] }
    expect(restoreArrangement(null)).toEqual(defaults)
    expect(restoreArrangement('not json')).toEqual(defaults)
    expect(restoreArrangement(JSON.stringify({ grouping: 4, filters: [], rowsPerPage: 7, openGroups: 'SAP' }))).toEqual(defaults)
  })
})

describe('liveFilters', () => {
  it('keeps only the filter values the deals on hand still have', () => {
    expect(liveFilters({ status: 'Won', practice: 'SAP', sector: '' }, { status: ['Active'], practice: ['SAP'] }))
      .toEqual({ practice: 'SAP' })
  })
})
