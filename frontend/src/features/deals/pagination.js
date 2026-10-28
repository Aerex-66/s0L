import { useState } from 'react'

/** Page numbers to show around the current page, with '…' for the gaps: [1, '…', 4, 5, 6, '…', 29]. */
export function pageWindow(page, pageCount, radius = 1) {
  const pages = []
  for (let p = 1; p <= pageCount; p += 1) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= radius) pages.push(p)
    else if (pages[pages.length - 1] !== '…') pages.push('…')
  }
  return pages
}

/** Current page for a list; goes back to page 1 whenever resetKey changes (new filter, view or sort). */
export function usePage(total, pageSize, resetKey) {
  const [state, setState] = useState({ page: 1, key: resetKey })
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = state.key === resetKey ? Math.min(state.page, pageCount) : 1
  const setPage = (next) => setState({ page: Math.max(1, Math.min(next, pageCount)), key: resetKey })
  return { page, pageCount, setPage }
}
