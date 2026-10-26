import { useMemo, useState } from 'react'
import { addMinutes, format } from 'date-fns'
import { Copy, Mail, Plus, RotateCcw, Video, X } from 'lucide-react'
import Modal from '../../../shared/ui/Modal'
import { FormField } from '../../../shared/ui/FormField'
import {
  buildAgenda, dealLabel, mailtoLink, nextBusinessDay, pendingItemsFor, teamsMeetingLink,
} from '../handoff'

const DURATIONS = [15, 30, 45, 60, 90]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const same = (a, b) => a.toLowerCase() === b.toLowerCase()

function toStart(date, time) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

/** Pre-fills a Teams meeting (or an Outlook email) — the user reviews and sends from the app itself. */
export default function MeetingComposer({ deal, initial = {}, onClose }) {
  const label = dealLabel(deal)
  const people = useMemo(() => (deal.contacts || []).filter((c) => c.email), [deal.contacts])

  const [subject, setSubject] = useState(initial.subject || label)
  const [date, setDate] = useState(format(initial.date || nextBusinessDay(), 'yyyy-MM-dd'))
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState(30)
  const [attendees, setAttendees] = useState(() => initial.attendees ?? people.map((p) => p.email))
  const [draftEmail, setDraftEmail] = useState('')
  const [agendaEdit, setAgendaEdit] = useState(null)
  const [status, setStatus] = useState('')

  const isOn = (email) => attendees.some((a) => same(a, email))
  const guests = attendees.filter((a) => !people.some((p) => same(p.email, a)))

  const autoAgenda = useMemo(() => {
    const names = people.filter((p) => attendees.some((a) => same(a, p.email))).map((p) => p.name)
    return buildAgenda({ label, items: pendingItemsFor(deal.activities, names) })
  }, [people, attendees, deal.activities, label])
  const agenda = agendaEdit ?? autoAgenda

  const start = toStart(date || '', time || '')
  const valid = !Number.isNaN(start.getTime()) && subject.trim() !== ''
  const end = valid ? addMinutes(start, duration) : null

  const meeting = { attendees, subject: subject.trim(), start, end, content: agenda }
  const teamsLink = valid ? teamsMeetingLink(meeting) : undefined
  const mailLink = valid
    ? mailtoLink({
      to: attendees,
      subject: subject.trim(),
      body: `Proposed time: ${format(start, 'EEE d MMM yyyy, HH:mm')}–${format(end, 'HH:mm')}\n\n${agenda}`,
    })
    : undefined

  const toggle = (email) => setAttendees((list) => (
    list.some((a) => same(a, email)) ? list.filter((a) => !same(a, email)) : [...list, email]
  ))

  const addGuest = () => {
    const email = draftEmail.trim()
    if (!EMAIL_RE.test(email)) { setStatus('Enter a valid email address.'); return }
    if (!isOn(email)) setAttendees((list) => [...list, email])
    setDraftEmail('')
    setStatus('')
  }

  const copyWebLink = async () => {
    try {
      await navigator.clipboard.writeText(teamsMeetingLink({ ...meeting, web: true }))
      setStatus('Teams web link copied.')
    } catch {
      setStatus('Copy failed — your browser blocked clipboard access.')
    }
  }

  return (
    <Modal title="Schedule a Teams meeting" onClose={onClose} className="mc-modal">
      <div className="mc">
        <FormField label="Subject" required>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </FormField>

        <div className="mc-when">
          <FormField label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Start">
            <input type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} />
          </FormField>
          <FormField label="Length">
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </FormField>
        </div>

        <div className="mc-section">
          <div className="mc-section-head">
            <span className="mc-caption">Attendees</span>
            <span className="mc-count">{attendees.length} invited</span>
          </div>
          {people.length > 0 ? (
            <div className="mc-people">
              {people.map((p) => (
                <button
                  key={p.id || p.email}
                  type="button"
                  className={`mc-person${isOn(p.email) ? ' is-on' : ''}`}
                  aria-pressed={isOn(p.email)}
                  onClick={() => toggle(p.email)}
                  title={p.email}
                >
                  <span className="mc-avatar">{(p.name || p.email)[0].toUpperCase()}</span>
                  <span className="mc-who">{p.name || p.email}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mc-empty">No deal contacts with an email yet — add guests below.</p>
          )}
          {guests.length > 0 && (
            <div className="mc-people">
              {guests.map((g) => (
                <span key={g} className="mc-person is-on is-guest">
                  <span className="mc-who">{g}</span>
                  <button type="button" className="mc-remove" onClick={() => toggle(g)} aria-label={`Remove ${g}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="mc-add">
            <input
              type="email"
              placeholder="Add a guest by email"
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest() } }}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={addGuest} disabled={!draftEmail.trim()}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        <div className="mc-section">
          <div className="mc-section-head">
            <span className="mc-caption">Agenda</span>
            {agendaEdit !== null && (
              <button type="button" className="btn-text mc-rebuild" onClick={() => setAgendaEdit(null)}>
                <RotateCcw size={12} /> Rebuild from open items
              </button>
            )}
          </div>
          <textarea className="mc-agenda" rows={6} value={agenda} onChange={(e) => setAgendaEdit(e.target.value)} />
        </div>

        <div className="mc-footer">
          <p className="mc-hint" role="status">
            {status || 'Teams opens the form with everything filled in. Nothing is sent until you press Send there.'}
          </p>
          <div className="mc-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={copyWebLink} disabled={!valid}>
              <Copy size={14} /> Copy link
            </button>
            <a
              className={`btn btn-secondary btn-sm${valid ? '' : ' is-disabled'}`}
              href={mailLink}
              aria-disabled={!valid}
            >
              <Mail size={14} /> Email in Outlook
            </a>
            <a
              className={`btn btn-primary btn-sm${valid ? '' : ' is-disabled'}`}
              href={teamsLink}
              aria-disabled={!valid}
              onClick={() => valid && setStatus('Opening Teams — review the meeting there and press Send.')}
            >
              <Video size={14} /> Open in Teams
            </a>
          </div>
        </div>
      </div>
    </Modal>
  )
}
