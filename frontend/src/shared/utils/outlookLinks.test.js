import { describe, expect, it } from 'vitest'
import { WEB_LINK_LIMIT, outlookWebEventLink, outlookWebMailLink } from './outlookLinks'

describe('outlookWebMailLink', () => {
  it('fills in recipients, subject and body', () => {
    const url = new URL(outlookWebMailLink({
      to: ['ann@ibm.com', 'bob@ibm.com'], cc: ['cy@ibm.com'], subject: 'Acme – S4: approvals', body: 'Hi all,\nLine 2 & more',
    }))
    expect(`${url.origin}${url.pathname}`).toBe('https://outlook.office.com/mail/deeplink/compose')
    expect(url.searchParams.get('to')).toBe('ann@ibm.com;bob@ibm.com')
    expect(url.searchParams.get('cc')).toBe('cy@ibm.com')
    expect(url.searchParams.get('subject')).toBe('Acme – S4: approvals')
    expect(url.searchParams.get('body')).toBe('Hi all,\nLine 2 & more')
  })

  it('shortens only the body to stay under the limit', () => {
    const link = outlookWebMailLink({ to: ['ann@ibm.com'], subject: 'S', body: 'x'.repeat(20000) })
    const url = new URL(link)
    expect(link.length).toBeLessThanOrEqual(WEB_LINK_LIMIT)
    expect(url.searchParams.get('to')).toBe('ann@ibm.com')
    expect(url.searchParams.get('body').endsWith('…')).toBe(true)
  })

  it('leaves out what is empty', () => {
    expect(outlookWebMailLink({ subject: 'Only a subject' })).toBe(
      'https://outlook.office.com/mail/deeplink/compose?subject=Only%20a%20subject',
    )
  })

  it('never cuts a character in half when shortening', () => {
    const link = outlookWebMailLink({ to: ['ann@ibm.com'], body: '😀'.repeat(5000) })
    expect(link.length).toBeLessThanOrEqual(WEB_LINK_LIMIT)
    expect(new URL(link).searchParams.get('body').endsWith('…')).toBe(true)
  })
})

describe('outlookWebEventLink', () => {
  it('opens a new event with its times in UTC', () => {
    const url = new URL(outlookWebEventLink({
      attendees: ['ann@ibm.com'], subject: 'SRR prep', location: 'Teams', body: 'Agenda',
      start: new Date(Date.UTC(2026, 9, 29, 15, 0)), end: new Date(Date.UTC(2026, 9, 29, 15, 30)),
    }))
    expect(`${url.origin}${url.pathname}`).toBe('https://outlook.office.com/calendar/deeplink/compose')
    expect(url.searchParams.get('path')).toBe('/calendar/action/compose')
    expect(url.searchParams.get('rru')).toBe('addevent')
    expect(url.searchParams.get('startdt')).toBe('2026-10-29T15:00:00Z')
    expect(url.searchParams.get('enddt')).toBe('2026-10-29T15:30:00Z')
    expect(url.searchParams.get('to')).toBe('ann@ibm.com')
    expect(url.searchParams.get('subject')).toBe('SRR prep')
    expect(url.searchParams.get('location')).toBe('Teams')
    expect(url.searchParams.get('body')).toBe('Agenda')
  })
})
