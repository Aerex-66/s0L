import { describe, expect, it } from 'vitest'
import { salesforceBadge } from './salesforceBadge'

const when = (iso) => `T(${iso})`
const signedIn = { app_configured: true, connected: true, user: { name: 'Ann Lee' }, last_check: '2026-10-28T09:30:00Z' }

describe('salesforceBadge', () => {
  it('stays quiet until the status has loaded', () => {
    expect(salesforceBadge(null)).toEqual({ state: 'unknown', label: 'Salesforce' })
  })

  it('says when Salesforce is not set up on this computer', () => {
    expect(salesforceBadge({ app_configured: false, connected: false })).toEqual({
      state: 'unavailable', label: "Salesforce isn't set up on this computer",
    })
  })

  it('offers to connect when signed out', () => {
    expect(salesforceBadge({ app_configured: true, connected: false })).toEqual({ state: 'disconnected', label: 'Connect Salesforce' })
  })

  it('waits for the browser sign-in while connecting', () => {
    expect(salesforceBadge({ app_configured: true, connected: false }, { connecting: true })).toEqual({
      state: 'connecting', label: 'Finish signing in to Salesforce in your browser',
    })
  })

  it('shows who is connected, the last check, and that a click checks', () => {
    expect(salesforceBadge(signedIn, { when })).toEqual({
      state: 'connected',
      label: 'Salesforce · connected as Ann Lee · checked T(2026-10-28T09:30:00Z) · click to check the board now',
    })
  })

  it('leaves out the check time before the first check', () => {
    expect(salesforceBadge({ ...signedIn, last_check: null, user: null }, { when }).label)
      .toBe('Salesforce · connected · click to check the board now')
  })

  it('shows a running check', () => {
    expect(salesforceBadge(signedIn, { checking: true, when })).toEqual({
      state: 'checking', label: "Salesforce · checking the board's deals",
    })
  })

  it('a finished sign-in wins over a stale connecting flag', () => {
    expect(salesforceBadge(signedIn, { connecting: true, when }).state).toBe('connected')
  })
})
