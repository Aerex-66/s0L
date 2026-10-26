import { describe, expect, it } from 'vitest'
import {
  MAX_LINK_LENGTH,
  approvalEmailLink,
  approverRecipients,
  buildAgenda,
  dealLabel,
  isoWithOffset,
  mailtoLink,
  nextBusinessDay,
  pendingItemsFor,
  teamsCallLink,
  teamsChatLink,
  teamsMeetingLink,
} from './handoff'

describe('mailtoLink', () => {
  it('keeps addresses readable, encodes spaces as %20 and breaks lines with CRLF', () => {
    const link = mailtoLink({ to: ['ana@ibm.com', 'bo@ibm.com'], subject: 'Acme – S4', body: 'Hi Ana,\nThanks' })
    expect(link).toBe('mailto:ana@ibm.com,bo@ibm.com?subject=Acme%20%E2%80%93%20S4&body=Hi%20Ana%2C%0D%0AThanks')
  })

  it('adds cc and drops empty parts', () => {
    expect(mailtoLink({ to: ['ana@ibm.com'], cc: ['', 'cy@ibm.com'] })).toBe('mailto:ana@ibm.com?cc=cy@ibm.com')
  })

  it('trims a long body so the link stays openable', () => {
    const link = mailtoLink({ to: ['ana@ibm.com'], body: 'x'.repeat(5000) })
    expect(link.length).toBeLessThanOrEqual(MAX_LINK_LENGTH)
    expect(link.endsWith(encodeURIComponent('…'))).toBe(true)
  })
})

describe('isoWithOffset', () => {
  it('writes local time with an explicit UTC offset that round-trips to the same instant', () => {
    const date = new Date(2026, 9, 22, 10, 30)
    const iso = isoWithOffset(date)
    expect(iso).toMatch(/^2026-10-22T10:30:00[+-]\d{2}:\d{2}$/)
    expect(new Date(iso).getTime()).toBe(date.getTime())
  })
})

describe('teamsMeetingLink', () => {
  const start = new Date(2026, 9, 22, 10, 0)
  const end = new Date(2026, 9, 22, 10, 30)

  it('opens the Teams desktop scheduling form with every field filled', () => {
    const link = teamsMeetingLink({
      attendees: ['ana@ibm.com', 'bo@ibm.com'], subject: 'SAL review', start, end, content: 'Open items',
    })
    expect(link.startsWith('msteams:/l/meeting/new?')).toBe(true)
    expect(link).toContain('attendees=ana@ibm.com,bo@ibm.com')
    expect(link).toContain('subject=SAL%20review')
    expect(link).not.toContain('+')
    const params = new URL(link).searchParams
    expect(new Date(params.get('startTime')).getTime()).toBe(start.getTime())
    expect(new Date(params.get('endTime')).getTime()).toBe(end.getTime())
    expect(params.get('content')).toBe('Open items')
  })

  it('can produce the web form link for copying', () => {
    expect(teamsMeetingLink({ subject: 'x', web: true }).startsWith('https://teams.microsoft.com/l/meeting/new?')).toBe(true)
  })

  it('trims long meeting details to stay under the link limit', () => {
    const link = teamsMeetingLink({ subject: 'x', start, end, content: 'agenda line\n'.repeat(400) })
    expect(link.length).toBeLessThanOrEqual(MAX_LINK_LENGTH)
  })
})

describe('teamsChatLink and teamsCallLink', () => {
  it('starts a chat with a topic and a draft message', () => {
    expect(teamsChatLink({ users: ['ana@ibm.com', 'bo@ibm.com'], topicName: 'Acme', message: 'Hi all' }))
      .toBe('msteams:/l/chat/0/0?users=ana@ibm.com,bo@ibm.com&topicName=Acme&message=Hi%20all')
  })

  it('starts an audio call, or a video call when asked', () => {
    expect(teamsCallLink({ users: ['ana@ibm.com'] })).toBe('msteams:/l/call/0/0?users=ana@ibm.com')
    expect(teamsCallLink({ users: ['ana@ibm.com'], video: true })).toBe('msteams:/l/call/0/0?users=ana@ibm.com&withVideo=true')
  })
})

describe('nextBusinessDay', () => {
  it('skips the weekend', () => {
    expect(nextBusinessDay(new Date(2026, 9, 23, 15, 0))).toEqual(new Date(2026, 9, 26))
    expect(nextBusinessDay(new Date(2026, 9, 24))).toEqual(new Date(2026, 9, 26))
    expect(nextBusinessDay(new Date(2026, 9, 21))).toEqual(new Date(2026, 9, 22))
  })
})

describe('pendingItemsFor', () => {
  const activities = [
    { activity: 'RTR SAL Approval', reviewer_approver: 'Ana Silva', status: 'In Progress' },
    { activity: 'OTC SAL Approval', reviewer_approver: 'Ana Silva', status: 'Completed' },
    { activity: 'PTP SAL Approval', reviewer_approver: 'Dan Berard / Matt Langer', status: '' },
    { activity: 'DCA', reviewer_approver: 'Someone Else', status: 'Not Started' },
    { activity: 'Credit Check', reviewer_approver: 'Ana Silva', status: 'N/A' },
  ]

  it('lists open items for the given people, matching shared slots and ignoring case', () => {
    expect(pendingItemsFor(activities, ['Ana Silva', 'matt langer'])).toEqual([
      { who: 'Ana Silva', activity: 'RTR SAL Approval', status: 'In Progress' },
      { who: 'matt langer', activity: 'PTP SAL Approval', status: 'Not Started' },
    ])
  })
})

describe('buildAgenda and dealLabel', () => {
  it('writes a readable agenda from open items', () => {
    const items = [{ who: 'Ana Silva', activity: 'RTR SAL Approval', status: 'In Progress' }]
    expect(buildAgenda({ label: 'Acme – S4', items }))
      .toBe('Re: Acme – S4\n\nOpen items:\n• Ana Silva — RTR SAL Approval (In Progress)')
    expect(buildAgenda({ label: 'Acme – S4', items: [] })).toBe('Re: Acme – S4')
  })

  it('names the deal from client and project', () => {
    expect(dealLabel({ client_name: 'Acme', project_name: 'S4' })).toBe('Acme – S4')
    expect(dealLabel({ project_name: 'S4' })).toBe('S4')
    expect(dealLabel({})).toBe('Deal')
  })
})

describe('approverRecipients', () => {
  const people = [
    { name: 'Matt Langer', email: 'matt@ibm.com' },
    { name: 'Dan Berard', email: '' },
    { name: 'Ana Silva', email: 'ana@ibm.com' },
    { name: 'ana silva', email: 'ANA@ibm.com' },
  ]

  it('resolves each person in a shared slot, skipping anyone without an email', () => {
    expect(approverRecipients('Dan Berard / Matt Langer', people)).toEqual([{ name: 'Matt Langer', email: 'matt@ibm.com' }])
  })

  it('matches names case-insensitively and never repeats an address', () => {
    expect(approverRecipients(' ana SILVA ', people)).toEqual([{ name: 'Ana Silva', email: 'ana@ibm.com' }])
  })

  it('returns nobody for an empty slot', () => {
    expect(approverRecipients('', people)).toEqual([])
    expect(approverRecipients(undefined, people)).toEqual([])
  })
})

describe('approvalEmailLink', () => {
  const ana = { name: 'Ana Silva', email: 'ana@ibm.com' }
  const matt = { name: 'Matt Langer', email: 'matt@ibm.com' }
  const decode = (link) => decodeURIComponent(link)

  it('asks one approver about one item, with status and target date', () => {
    const link = approvalEmailLink({
      label: 'Acme – S4',
      recipients: [ana],
      items: [{ who: 'Ana Silva', activity: 'RTR SAL Approval', status: 'In Progress', date: '2026-11-04' }],
    })
    expect(link.startsWith('mailto:ana@ibm.com?')).toBe(true)
    expect(decode(link)).toContain('subject=Acme – S4: RTR SAL Approval')
    expect(decode(link)).toContain('body=Hi Ana,\r\n\r\nCan you approve this for Acme – S4?\r\n\r\n• RTR SAL Approval — In Progress, target Wed 4 Nov\r\n\r\nThanks')
  })

  it('greets a shared slot by both first names and defaults a blank status', () => {
    const link = approvalEmailLink({
      label: 'Acme',
      recipients: [ana, matt],
      items: [{ who: 'Ana Silva / Matt Langer', activity: 'PTP SAL Approval', status: '' }],
    })
    expect(link.startsWith('mailto:ana@ibm.com,matt@ibm.com?')).toBe(true)
    expect(decode(link)).toContain('Hi Ana and Matt,')
    expect(decode(link)).toContain('• PTP SAL Approval — Not Started\r\n')
  })

  it('groups many open items by approver in one email to everyone', () => {
    const link = approvalEmailLink({
      label: 'Acme',
      recipients: [ana, matt, { name: 'Cy Ode', email: 'cy@ibm.com' }],
      items: [
        { who: 'Ana Silva', activity: 'RTR SAL', status: 'Blocked' },
        { who: 'Matt Langer', activity: 'PTP SAL', status: 'In Progress' },
        { who: 'Ana Silva', activity: 'OTC SAL', status: 'Not Started' },
      ],
    })
    expect(decode(link)).toContain('subject=Acme: approvals needed')
    expect(decode(link)).toContain('Hi all,\r\n\r\nThese approvals are still open for Acme:\r\n\r\nAna Silva\r\n• RTR SAL — Blocked\r\n• OTC SAL — Not Started\r\n\r\nMatt Langer\r\n• PTP SAL — In Progress\r\n\r\nThanks')
  })

  it('gives no link when nobody has an email', () => {
    expect(approvalEmailLink({ label: 'Acme', recipients: [], items: [{ who: 'X', activity: 'Y' }] })).toBe('')
  })
})
