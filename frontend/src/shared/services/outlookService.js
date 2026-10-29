/**
 * outlookService — the only frontend client for the Outlook integration. The backend
 * talks to the Outlook app on this computer; nothing here signs in to anything.
 */
import { get, post, put } from '../apiClient'

export const outlookService = {
  /** { app: { found, running }, mode, effective } */
  status:  ()        => get('/api/outlook/status'),
  /** 'app' or 'web', remembered for this computer; resolves to the new status. */
  setMode: (mode)    => put('/api/outlook/mode', { mode }),
  /** Opens a filled-in email in the Outlook app: { deal_id, to, cc, subject, body, attachments: [document ids] } */
  draft:   (payload) => post('/api/outlook/draft', payload),
  /** Opens a filled-in meeting invite: { deal_id, attendees, subject, start, end, location, body, attachments } */
  invite:  (payload) => post('/api/outlook/invite', payload),
  /** Who Outlook thinks a typed name is: { status: ok | not_running | web | no_app | failed, people: [{ name, email, title, department, company, phone, source }] } */
  people:  (query)   => get(`/api/outlook/people?q=${encodeURIComponent(query)}`),
  /** Opens Outlook's own address book to pick one person: { person } (null when closed without picking) */
  pickPerson: ()     => post('/api/outlook/people/pick', {}),
}
