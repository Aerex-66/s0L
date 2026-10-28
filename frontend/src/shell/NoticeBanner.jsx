import { useEffect, useRef, useState } from 'react'
import useNoticeStore from '../shared/noticeStore'
import { ChevronDownIcon, MegaphoneIcon } from '../shared/ui/Icons'
import { formatShortDate, formatShortDateWithYear } from '../shared/utils/formatters'
import { cx } from '../shared/utils/cx'

const ROTATE_MS = 6000
const PEEK = 5
const REFRESH_MS = 5 * 60 * 1000

/**
 * The TT Execs' notices, centered in the header: the latest few take turns, hovering shows them
 * with their dates, and expanding pins the whole list open.
 */
export default function NoticeBanner() {
  const notices = useNoticeStore((s) => s.notices)
  const load = useNoticeStore((s) => s.load)
  const [turn, setTurn] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const root = useRef(null)
  const latest = notices.slice(0, PEEK)

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (latest.length < 2 || hovered || expanded) return undefined
    const timer = setInterval(() => setTurn((current) => (current + 1) % latest.length), ROTATE_MS)
    return () => clearInterval(timer)
  }, [latest.length, hovered, expanded])

  useEffect(() => {
    if (!expanded) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') setExpanded(false) }
    const closeOutside = (event) => { if (!root.current?.contains(event.target)) setExpanded(false) }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOutside)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOutside)
    }
  }, [expanded])

  if (!notices.length) return null
  const current = latest[turn % latest.length]
  const shown = expanded ? notices : latest

  return (
    <div className="notice-banner" ref={root} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="notice-banner-bar">
        <MegaphoneIcon className="notice-banner-icon" aria-hidden="true" />
        <span key={current.id} className="notice-banner-text" title={current.text}>{current.text}</span>
        <time className="notice-banner-date" dateTime={current.created_at}>{formatShortDate(current.created_at)}</time>
        {latest.length > 1 && <span className="notice-banner-count">{(turn % latest.length) + 1}/{latest.length}</span>}
        <button
          type="button"
          className="notice-banner-expand"
          aria-expanded={expanded}
          aria-label={expanded ? 'Close the notices' : `Show all ${notices.length} notices`}
          onClick={() => setExpanded((open) => !open)}
        >
          <ChevronDownIcon aria-hidden="true" />
        </button>
      </div>
      {(hovered || expanded) && (
        <div className="notice-banner-pop">
          <ul className={cx('notice-banner-list', expanded && 'notice-banner-list--all')}>
            {shown.map((notice) => (
              <li key={notice.id} className="notice-item">
                <time className="notice-item-date" dateTime={notice.created_at}>{formatShortDateWithYear(notice.created_at)}</time>
                <span className="notice-item-text">{notice.text}</span>
                {notice.author && <span className="notice-item-author">{notice.author}</span>}
              </li>
            ))}
          </ul>
          {!expanded && notices.length > PEEK && (
            <button type="button" className="notice-banner-more" onClick={() => setExpanded(true)}>
              Show all {notices.length}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
