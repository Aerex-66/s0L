/**
 * outlookStore — which Outlook this computer uses, and opening filled-in emails and
 * invites in it: a real draft in the Outlook app, or Outlook on the web in a new tab.
 * Shared by the header icon, Home and Documents.
 */
import { create } from 'zustand'
import { format } from 'date-fns'
import useDealStore from './dealStore'
import { outlookService } from './services/outlookService'
import { outlookWebEventLink, outlookWebMailLink } from './utils/outlookLinks'

/** 'app' or 'web' once the status has loaded; null before, when callers keep today's mailto: links. */
export const effectiveMode = (status) => status?.effective || null

const localTime = (date) => format(date, "yyyy-MM-dd'T'HH:mm")

const failed = (error) => {
  useDealStore.getState().setAppNotice(`Outlook: ${error.message}`)
  return false
}

const useOutlookStore = create((set, get) => ({
  status: null,
  panelOpen: false,
  panelTab: null,

  load: async () => {
    try {
      const status = await outlookService.status()
      set({ status })
      return status
    } catch {
      return null
    }
  },

  setMode: async (mode) => {
    const status = await outlookService.setMode(mode)
    set({ status })
    return status
  },

  /** The Outlook panel: which Outlook, then Quick contacts (on `tab` when given: deal_team, sal, sldl, srr, prr). */
  openPanel: (tab = null) => set({ panelOpen: true, panelTab: tab }),
  closePanel: () => set({ panelOpen: false, panelTab: null }),

  /** A filled-in email; resolves to whether it opened. The browser tab opens before any wait, so it isn't blocked. */
  openEmail: async (message, { dealId, attachments = [] } = {}) => {
    if (effectiveMode(get().status) === 'web') {
      window.open(outlookWebMailLink(message), '_blank', 'noopener')
      return true
    }
    try {
      await outlookService.draft({
        deal_id: dealId,
        to: message.to || [],
        cc: message.cc || [],
        subject: message.subject || '',
        body: message.body || '',
        attachments,
      })
      return true
    } catch (error) {
      return failed(error)
    }
  },

  /** A filled-in meeting invite ({ attendees, subject, start, end, location, body }); resolves to whether it opened. */
  openInvite: async (meeting, { dealId, attachments = [] } = {}) => {
    if (effectiveMode(get().status) === 'web') {
      window.open(outlookWebEventLink(meeting), '_blank', 'noopener')
      return true
    }
    try {
      await outlookService.invite({
        deal_id: dealId,
        attendees: meeting.attendees || [],
        subject: meeting.subject || '',
        start: localTime(meeting.start),
        end: localTime(meeting.end),
        location: meeting.location || '',
        body: meeting.body || '',
        attachments,
      })
      return true
    } catch (error) {
      return failed(error)
    }
  },
}))

export default useOutlookStore
