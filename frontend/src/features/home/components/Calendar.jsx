import { useState, useMemo, useCallback, useEffect } from 'react'
import { Video } from 'lucide-react'
import { getWorkStatusColor } from '../../../shared/constants'
import { formatMonthDayYear, formatMonthYear, formatShortDate } from '../../../shared/utils/formatters'
import { get } from '../../../shared/apiClient'
import { webLink } from '../../../shared/utils/webLink'
import { dealLabel } from '../handoff'
import MeetingComposer from './MeetingComposer'

/* ── helpers ──────────────────────────────────────── */
function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function collectEvents(deal) {
  const events = []

  // Activities with dates
  for (const a of deal.activities || []) {
    if (!a.date) continue
    const dateStr = a.date.includes('T') ? a.date.split('T')[0] : a.date
    events.push({
      date: dateStr,
      title: a.activity || 'Activity',
      type: 'activity',
      status: a.status || '',
      color: getWorkStatusColor(a.status),
      detail: a.reviewer_approver ? `Reviewer: ${a.reviewer_approver}` : '',
      comments: a.comments || '',
      raw: a,
    })
  }

  // Timeline milestones (phase start/end)
  for (const tl of deal.timelines || []) {
    if (tl.project_start_date) {
      events.push({
        date: tl.project_start_date.split('T')[0],
        title: 'Project Start',
        type: 'milestone',
        status: '',
        color: 'var(--ibm-blue)',
        detail: '',
        comments: '',
      })
    }
    // Extract phase milestones from timeline object { phaseName: { duration, unit } }
    const phases = tl.timeline || {}
    let monthOffset = 0
    for (const [phaseName, phaseData] of Object.entries(phases)) {
      if (tl.project_start_date && phaseData) {
        const start = new Date(tl.project_start_date)
        if (!isNaN(start.getTime())) {
          start.setMonth(start.getMonth() + monthOffset)
          events.push({
            date: toDateKey(start),
            title: `${phaseName} Start`,
            type: 'milestone',
            status: '',
            color: 'var(--phase-color, var(--ibm-blue))',
            detail: phaseData.duration ? `${phaseData.duration} ${phaseData.unit || 'months'}` : '',
            comments: '',
          })
          const dur = phaseData.duration || 0
          monthOffset += phaseData.unit === 'weeks' ? Math.ceil(dur / 4.33) : dur
        }
      }
    }
  }

  // Key dates from deal top-level
  if (deal.rfp_submission_date) {
    events.push({ date: deal.rfp_submission_date.split('T')[0], title: 'RFP Submission', type: 'deadline', status: '', color: 'var(--status-error)', detail: '', comments: '' })
  }

  return events
}

function buildIcs(events, dealName) {
  const fold = (s) => s.replace(/(.{72})/g, '$1\r\n ')
  const esc = (s) => s.replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//s0L Deal Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const ev of events) {
    const dtVal = ev.date.replace(/-/g, '')
    const uid = `${dtVal}-${encodeURIComponent(ev.title)}@s0l`
    lines.push(
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${dtVal}`,
      `DTEND;VALUE=DATE:${dtVal}`,
      `SUMMARY:${fold(esc(`[${dealName}] ${ev.title}`))}`,
      ev.detail ? `DESCRIPTION:${fold(esc(ev.detail))}` : '',
      `UID:${uid}`,
      `CATEGORIES:${ev.type.toUpperCase()}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.filter(Boolean).join('\r\n')
}

function downloadIcs(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ── Outlook event normalizer ────────────────────── */
const searchable = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function normalizeOutlookEvents(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(ev => {
    const start = ev.start || ''
    const dateStr = start.split('T')[0]
    const timeStr = start.includes('T') ? start.split('T')[1]?.slice(0, 5) : ''
    const endTime = ev.end?.includes('T') ? ev.end.split('T')[1]?.slice(0, 5) : ''
    const timePart = ev.isAllDay ? 'All day' : (timeStr && endTime ? `${timeStr} – ${endTime}` : timeStr)
    const location = String(ev.location || '').trim()
    // A web address in the location is the online meeting's join link, not a place to print in full
    const url = location.match(/https?:\/\/\S+/i)?.[0] || ''
    const joinUrl = webLink(url)
    const room = location.replace(url, '').replace(/^[\s;,]+|[\s;,]+$/g, '')
    const place = room || (joinUrl ? (/teams\.microsoft\.com/i.test(joinUrl) ? 'Teams meeting' : 'Online meeting') : '')
    const title = ev.subject || '(No subject)'
    return {
      date: dateStr,
      title,
      type: 'outlook',
      status: '',
      color: 'var(--accent-2)',
      detail: [timePart, place].filter(Boolean).join(' · '),
      comments: ev.organizer ? `Organizer: ${ev.organizer}` : '',
      joinUrl,
      cancelled: /^cancell?ed\b/i.test(title),
      text: searchable([title, location, ev.organizer].join(' ')),
    }
  }).filter(ev => ev.date)
}

const LEGAL_WORDS = /\b(inc|incorporated|corp|corporation|co|company|llc|ltd|limited|plc|us|usa)\b/g

/** Words that tie a calendar event to this deal: the client as written, its bracketed or short name, the opportunity number. */
function dealTerms(deal) {
  const client = String(deal.client_name || '')
  const candidates = [
    client,
    client.replace(/\(.*?\)/g, ' '),
    ...(client.match(/\(([^)]+)\)/g) || []),
    searchable(client).replace(LEGAL_WORDS, ' '),
    deal.opportunity_number,
  ]
  return [...new Set(candidates.map(searchable).map(t => t.replace(/\s+/g, ' ')))].filter(t => t.length >= 3)
}

function EventItem({ ev, lead, action, showComments = false }) {
  return (
    <div className={`cal-ev${ev.cancelled ? ' cancelled' : ''}`} style={{ '--ev-color': ev.color }}>
      <div className="cal-ev-bar" />
      <div className="cal-ev-body">
        <div className="cal-ev-top">
          {lead}
          <strong className="cal-ev-title" title={ev.title}>{ev.title}</strong>
        </div>
        {ev.status && <span className={`status-badge status-${ev.status.toLowerCase().replace(/\s/g, '-')}`}>{ev.status}</span>}
        {(ev.detail || ev.joinUrl) && (
          <p className="cal-ev-detail">
            {ev.detail}
            {ev.joinUrl && !ev.cancelled && (
              <a className="cal-ev-join" href={ev.joinUrl} target="_blank" rel="noopener noreferrer">Join</a>
            )}
          </p>
        )}
        {showComments && ev.comments && <p className="cal-ev-detail muted">{ev.comments}</p>}
      </div>
      {action}
    </div>
  )
}

/* ── component ───────────────────────────────────── */
export default function Calendar({ deal }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [outlookEvents, setOutlookEvents] = useState([])
  const [outlookStatus, setOutlookStatus] = useState('loading') // loading | ok | stale | waiting | web | no_app | error
  const [outlookAge, setOutlookAge] = useState(null)
  const [outlookMessage, setOutlookMessage] = useState('')
  const [composer, setComposer] = useState(null)
  const [scope, setScope] = useState('deal') // deal | all

  // Fetch Outlook calendar events (polls every 60s)
  useEffect(() => {
    let cancelled = false
    const fetchOutlook = () => {
      get('/api/calendar/outlook')
        .then(data => {
          if (cancelled) return
          setOutlookMessage(data.message || '')
          if (data.status === 'ok') {
            setOutlookEvents(normalizeOutlookEvents(data.events))
            setOutlookAge(data.age_seconds)
            setOutlookStatus(data.age_seconds > 300 ? 'stale' : 'ok')
          } else if (['web', 'no_app', 'waiting', 'empty'].includes(data.status)) {
            setOutlookEvents([])
            setOutlookStatus(data.status === 'empty' ? 'waiting' : data.status)
          } else {
            setOutlookEvents([])
            setOutlookStatus('error')
          }
        })
        .catch(() => {
          if (cancelled) return
          setOutlookEvents([])
          setOutlookStatus('error')
        })
    }
    fetchOutlook()
    const timer = setInterval(fetchOutlook, 60000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const today = new Date()
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  // Monday-start: shift Sunday (0) to end
  const startOffset = firstDow === 0 ? 6 : firstDow - 1
  const isCurrentMonth = month === today.getMonth() && year === today.getFullYear()

  const dealEvents = useMemo(() => collectEvents(deal), [deal])
  const terms = useMemo(() => dealTerms(deal), [deal])
  const shownOutlook = useMemo(
    () => (scope === 'all' ? outlookEvents : outlookEvents.filter(ev => terms.some(t => ` ${ev.text} `.includes(` ${t} `)))),
    [scope, outlookEvents, terms],
  )
  const allEvents = useMemo(() => [...dealEvents, ...shownOutlook], [dealEvents, shownOutlook])

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const ev of allEvents) {
      ;(map[ev.date] ||= []).push(ev)
    }
    return map
  }, [allEvents])

  const selectedKey = selectedDate != null ? toDateKey(new Date(year, month, selectedDate)) : null
  const selectedEvents = selectedKey ? (eventsByDate[selectedKey] || []) : []

  const prevMonth = () => { setCurrentDate(new Date(year, month - 1)); setSelectedDate(null) }
  const nextMonth = () => { setCurrentDate(new Date(year, month + 1)); setSelectedDate(null) }
  const goToday = () => { setCurrentDate(new Date()); setSelectedDate(today.getDate()) }

  const handleExportAll = useCallback(() => {
    const dealName = deal.project_name || deal.client_name || 'Deal'
    const ics = buildIcs(allEvents, dealName)
    downloadIcs(ics, `${dealName.replace(/\s+/g, '_')}_calendar.ics`)
  }, [allEvents, deal])

  const handleExportDay = useCallback(() => {
    if (!selectedEvents.length) return
    const dealName = deal.project_name || deal.client_name || 'Deal'
    const ics = buildIcs(selectedEvents, dealName)
    downloadIcs(ics, `${dealName.replace(/\s+/g, '_')}_${selectedKey}.ics`)
  }, [selectedEvents, selectedKey, deal])

  // Upcoming events (next 14 days) for agenda
  const upcoming = useMemo(() => {
    const start = toDateKey(today)
    const end = new Date(today)
    end.setDate(end.getDate() + 14)
    const endKey = toDateKey(end)
    return allEvents
      .filter(ev => ev.date >= start && ev.date <= endKey)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [allEvents, today])

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // Invite whoever owns the item when they're a deal contact; a past date falls back to the next business day
  const meetAbout = (ev) => {
    const [y, m, d] = ev.date.split('-').map(Number)
    const when = new Date(y, m - 1, d)
    const owners = (ev.raw?.reviewer_approver || '').split('/').map(r => r.trim().toLowerCase()).filter(Boolean)
    const attendees = (deal.contacts || [])
      .filter(c => c.email && owners.includes((c.name || '').trim().toLowerCase()))
      .map(c => c.email)
    setComposer({ subject: `${dealLabel(deal)}: ${ev.title}`, date: when > today ? when : undefined, attendees })
  }

  const meetButton = (ev) => ev.type !== 'outlook' && (
    <button
      type="button"
      className="cal-ev-meet"
      onClick={() => meetAbout(ev)}
      title="Schedule a Teams meeting about this"
      aria-label={`Schedule a Teams meeting about ${ev.title}`}
    >
      <Video size={14} />
    </button>
  )

  const scopeToggle = outlookEvents.length > 0 && (
    <div className="cal-scope" role="group" aria-label="Which Outlook events to show">
      {[['deal', 'This deal'], ['all', 'Everything']].map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`chip chip--interactive${scope === id ? ' chip--active' : ''}`}
          aria-pressed={scope === id}
          onClick={() => setScope(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const emptyText = (when) => (scope === 'deal' && outlookEvents.length > 0 ? (
    <>
      Nothing {when} mentions {deal.client_name || 'this deal'}.{' '}
      <button type="button" className="cal-link" onClick={() => setScope('all')}>Show everything</button>
    </>
  ) : `No events ${when}`)

  return (
    <div className="cal-outlook">
      {/* Left: mini calendar */}
      <div className="cal-mini">
        <div className="cal-nav">
          <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
          <span className="cal-nav-title">{formatMonthYear(currentDate)}</span>
          <button className="cal-nav-btn" onClick={nextMonth}>›</button>
          <button className="cal-today-btn" onClick={goToday}>Today</button>
        </div>

        <div className="cal-grid">
          <div className="cal-hdr-row">
            {WEEKDAYS.map(d => <div key={d} className="cal-hdr">{d}</div>)}
          </div>
          <div className="cal-body">
            {Array.from({ length: startOffset }, (_, i) => (
              <div key={`e${i}`} className="cal-cell empty" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              const key = toDateKey(new Date(year, month, day))
              const evts = eventsByDate[key] || []
              const isToday = isCurrentMonth && day === today.getDate()
              const isSel = selectedDate === day
              const isWeekend = (() => {
                const dow = new Date(year, month, day).getDay()
                return dow === 0 || dow === 6
              })()
              return (
                <div
                  key={day}
                  className={`cal-cell${isToday ? ' today' : ''}${isSel ? ' selected' : ''}${evts.length ? ' has-events' : ''}${isWeekend ? ' weekend' : ''}`}
                  onClick={() => setSelectedDate(isSel ? null : day)}
                >
                  <span className="cal-num">{day}</span>
                  {evts.length > 0 && (
                    <div className="cal-indicators">
                      {evts.slice(0, 3).map((ev, j) => (
                        <span key={j} className="cal-ind" style={{ background: ev.color }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="cal-actions">
          {outlookStatus === 'ok' && <span className="cal-outlook-badge">Outlook synced{outlookAge != null ? ` (${Math.round(outlookAge / 60)}m ago)` : ''}</span>}
          {outlookStatus === 'stale' && <span className="cal-outlook-badge stale" title="s0L reads the calendar while Outlook is open">Open Outlook to refresh</span>}
          {outlookStatus === 'waiting' && <span className="cal-outlook-badge stale" title={outlookMessage}>Open Outlook to see your calendar</span>}
          {outlookStatus === 'web' && <span className="cal-outlook-badge" title={outlookMessage}>Outlook in the browser</span>}
          {outlookStatus === 'no_app' && <span className="cal-outlook-badge error" title={outlookMessage}>No Outlook app</span>}
          {outlookStatus === 'error' && <span className="cal-outlook-badge error" title={outlookMessage}>Outlook error</span>}
          {outlookStatus === 'loading' && <span className="cal-outlook-badge">Loading Outlook…</span>}
          <button
            className="cal-meet-btn"
            onClick={() => setComposer({ attendees: [], date: selectedDate ? new Date(year, month, selectedDate) : undefined })}
          >
            <Video size={14} /> New Teams meeting
          </button>
          <button className="cal-export-btn" onClick={handleExportAll} title="Export all events to Outlook (.ics)">
            Export .ics
          </button>
        </div>
      </div>

      {/* Right: agenda / day detail */}
      <div className="cal-agenda">
        {selectedDate ? (
          <>
            <div className="cal-agenda-header">
              <h3>{formatMonthDayYear(new Date(year, month, selectedDate))}</h3>
              <div className="cal-agenda-actions">
                {scopeToggle}
                <button
                  className="cal-export-btn small"
                  onClick={() => setComposer({ attendees: [], date: new Date(year, month, selectedDate) })}
                  title="Schedule a Teams meeting on this day"
                >
                  <Video size={12} /> Meet
                </button>
                {selectedEvents.length > 0 && (
                  <button className="cal-export-btn small" onClick={handleExportDay} title="Export this day to Outlook">
                    .ics
                  </button>
                )}
                <button className="cal-close" onClick={() => setSelectedDate(null)} aria-label="Back to upcoming">×</button>
              </div>
            </div>
            {selectedEvents.length === 0 ? (
              <p className="cal-empty">{emptyText('on this day')}</p>
            ) : (
              <div className="cal-event-list">
                {selectedEvents.map((ev, i) => (
                  <EventItem
                    key={i}
                    ev={ev}
                    lead={<span className={`cal-ev-type ${ev.type}`}>{ev.type}</span>}
                    action={meetButton(ev)}
                    showComments
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="cal-agenda-header">
              <h3>Upcoming</h3>
              <div className="cal-agenda-actions">
                {scopeToggle}
                <span className="cal-agenda-range">Next 14 days</span>
              </div>
            </div>
            {upcoming.length === 0 ? (
              <p className="cal-empty">{emptyText('in the next 14 days')}</p>
            ) : (
              <div className="cal-event-list">
                {upcoming.map((ev, i) => (
                  <EventItem
                    key={i}
                    ev={ev}
                    lead={<span className="cal-ev-date">{formatShortDate(ev.date)}</span>}
                    action={meetButton(ev)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {composer && <MeetingComposer deal={deal} initial={composer} onClose={() => setComposer(null)} />}
    </div>
  )
}
