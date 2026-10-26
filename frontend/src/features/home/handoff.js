// Hand-off links: s0L pre-fills Outlook/Teams and the installed app does the sending.
// s0L itself never makes a network request (UI_ARCHITECTURE invariant #2).

import { format } from 'date-fns'

export const MAX_LINK_LENGTH = 2000

const DONE_STATUSES = new Set(['Completed', 'N/A'])

const pad = (n) => String(n).padStart(2, '0')
const enc = (s) => encodeURIComponent(s)

// '@' stays literal; commas between addresses must not be encoded or Teams reads one address
const addresses = (list = []) =>
  list.map((a) => (a || '').trim()).filter(Boolean).map((a) => enc(a).replace(/%40/g, '@')).join(',')

const query = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&')

// Protocol handlers choke on very long URLs — shorten the free text, never the recipients
function fit(make, text = '') {
  let link = make(text)
  let keep = text.length
  while (link.length > MAX_LINK_LENGTH && keep > 0) {
    keep = Math.floor(keep * 0.85)
    link = make(keep ? `${text.slice(0, keep).trimEnd()}…` : '')
  }
  return link
}

export function dealLabel(deal = {}) {
  return [deal.client_name, deal.project_name].filter(Boolean).join(' – ') || 'Deal'
}

export function isoWithOffset(date) {
  const offset = -date.getTimezoneOffset()
  const abs = Math.abs(offset)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${offset >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

export function nextBusinessDay(from = new Date()) {
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1)
  while (day.getDay() === 0 || day.getDay() === 6) day.setDate(day.getDate() + 1)
  return day
}

export function pendingItemsFor(activities = [], names = []) {
  const wanted = names.map((n) => ({ who: n.trim(), key: n.trim().toLowerCase() })).filter((n) => n.key)
  const items = []
  for (const a of activities) {
    if (DONE_STATUSES.has(a.status)) continue
    const reviewers = (a.reviewer_approver || '').split('/').map((r) => r.trim().toLowerCase())
    for (const { who, key } of wanted) {
      if (reviewers.includes(key)) items.push({ who, activity: a.activity, status: a.status || 'Not Started' })
    }
  }
  return items
}

export function buildAgenda({ label, items = [] }) {
  const head = `Re: ${label}`
  if (!items.length) return head
  return `${head}\n\nOpen items:\n${items.map((i) => `• ${i.who} — ${i.activity} (${i.status})`).join('\n')}`
}

export function mailtoLink({ to = [], cc = [], subject = '', body = '' } = {}) {
  return fit((text) => {
    const q = query([
      ['cc', addresses(cc)],
      ['subject', subject && enc(subject)],
      ['body', text && enc(text.replace(/\r?\n/g, '\r\n'))],
    ])
    return `mailto:${addresses(to)}${q ? `?${q}` : ''}`
  }, body)
}

export function teamsMeetingLink({ attendees = [], subject = '', start, end, content = '', web = false } = {}) {
  const base = web ? 'https://teams.microsoft.com' : 'msteams:'
  return fit((text) => `${base}/l/meeting/new?${query([
    ['subject', subject && enc(subject)],
    ['attendees', addresses(attendees)],
    ['startTime', start && enc(isoWithOffset(start))],
    ['endTime', end && enc(isoWithOffset(end))],
    ['content', text && enc(text)],
  ])}`, content)
}

export function teamsChatLink({ users = [], topicName = '', message = '' } = {}) {
  return fit((text) => `msteams:/l/chat/0/0?${query([
    ['users', addresses(users)],
    ['topicName', topicName && enc(topicName)],
    ['message', text && enc(text)],
  ])}`, message)
}

export function teamsCallLink({ users = [], video = false } = {}) {
  return `msteams:/l/call/0/0?${query([['users', addresses(users)], ['withVideo', video && 'true']])}`
}

/** Who to email for an approver slot — slots can hold several people ("A / B"). */
export function approverRecipients(reviewer, people = []) {
  const same = (a, b) => a.toLowerCase() === b.toLowerCase()
  const found = []
  for (const part of (reviewer || '').split('/')) {
    const key = part.trim().toLowerCase()
    if (!key) continue
    const person = people.find((p) => p.email && (p.name || '').trim().toLowerCase() === key)
    if (person && !found.some((f) => same(f.email, person.email))) found.push({ name: person.name, email: person.email })
  }
  return found
}

function greeting(recipients) {
  const names = recipients.map((r) => (r.name || '').trim().split(/\s+/)[0]).filter(Boolean)
  return names.length && names.length <= 2 ? `Hi ${names.join(' and ')},` : 'Hi all,'
}

// Read 'YYYY-MM-DD' as a local calendar day; new Date('YYYY-MM-DD') would parse it as UTC
function targetDay(date) {
  const [y, m, d] = (date || '').split('T')[0].split('-').map(Number)
  return y && m && d ? format(new Date(y, m - 1, d), 'EEE d MMM') : ''
}

function itemLine(item) {
  const due = targetDay(item.date)
  return `• ${item.activity} — ${item.status || 'Not Started'}${due ? `, target ${due}` : ''}`
}

/** One approval → a direct ask; several → one chaser grouped by approver. Empty when nobody has an email. */
export function approvalEmailLink({ label, recipients = [], items = [] }) {
  if (!recipients.length || !items.length) return ''
  const to = recipients.map((r) => r.email)
  if (items.length === 1) {
    return mailtoLink({
      to,
      subject: `${label}: ${items[0].activity}`,
      body: `${greeting(recipients)}\n\nCan you approve this for ${label}?\n\n${itemLine(items[0])}\n\nThanks`,
    })
  }
  const groups = new Map()
  for (const item of items) groups.set(item.who, [...(groups.get(item.who) || []), item])
  const sections = [...groups].map(([who, list]) => `${who}\n${list.map(itemLine).join('\n')}`)
  return mailtoLink({
    to,
    subject: `${label}: approvals needed`,
    body: `${greeting(recipients)}\n\nThese approvals are still open for ${label}:\n\n${sections.join('\n\n')}\n\nThanks`,
  })
}
