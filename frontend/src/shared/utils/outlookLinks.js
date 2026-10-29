/**
 * Hand-off links to Outlook on the web: the person's browser opens a filled-in email
 * or event, s0L makes no request, and nothing is sent until they press Send.
 */
export const OUTLOOK_WEB = 'https://outlook.office.com'
export const WEB_LINK_LIMIT = 8000

const enc = (s) => encodeURIComponent(s)
const addresses = (list = []) => list.map((a) => (a || '').trim()).filter(Boolean).map(enc).join(';')
const query = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&')
const utc = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z')

// Very long links fail; shorten the free text (whole characters, so no emoji is split), never the recipients
function fitted(make, body = '') {
  const characters = Array.from(body)
  let link = make(body)
  let keep = characters.length
  while (link.length > WEB_LINK_LIMIT && keep > 0) {
    keep = Math.floor(keep * 0.85)
    link = make(keep ? `${characters.slice(0, keep).join('').trimEnd()}…` : '')
  }
  return link
}

export function outlookWebMailLink({ to = [], cc = [], subject = '', body = '' } = {}) {
  return fitted((text) => {
    const q = query([['to', addresses(to)], ['cc', addresses(cc)], ['subject', subject && enc(subject)], ['body', text && enc(text)]])
    return `${OUTLOOK_WEB}/mail/deeplink/compose${q ? `?${q}` : ''}`
  }, body)
}

export function outlookWebEventLink({ attendees = [], subject = '', start, end, location = '', body = '' } = {}) {
  return fitted((text) => `${OUTLOOK_WEB}/calendar/deeplink/compose?${query([
    ['path', '/calendar/action/compose'],
    ['rru', 'addevent'],
    ['startdt', start && utc(start)],
    ['enddt', end && utc(end)],
    ['subject', subject && enc(subject)],
    ['location', location && enc(location)],
    ['body', text && enc(text)],
    ['to', addresses(attendees)],
  ])}`, body)
}
