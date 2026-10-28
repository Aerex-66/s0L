import { cx } from '../../../shared/utils/cx'
import { pageWindow } from '../pagination'

export default function Pagination({ page, pageCount, total, pageSize, onPage }) {
  if (pageCount <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <nav className="deal-pagination" aria-label="Pages">
      <span className="deal-pagination-range">{from}–{to} of {total}</span>
      <div className="deal-pagination-pages">
        <button type="button" className="chip chip--interactive" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
        {pageWindow(page, pageCount).map((p, i) => (p === '…' ? (
          <span key={`gap-${i}`} className="deal-pagination-gap" aria-hidden="true">…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={cx('chip', 'chip--interactive', p === page && 'chip--active')}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        )))}
        <button type="button" className="chip chip--interactive" disabled={page === pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
      </div>
    </nav>
  )
}
