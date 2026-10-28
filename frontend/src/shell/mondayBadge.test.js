import { describe, expect, it } from 'vitest'
import { mondayBadge } from './mondayBadge'

const when = (iso) => `T(${iso})`
const signedIn = { app_configured: true, connected: true, user: { name: 'Ana Ruiz' }, last_sync: '2026-10-28T09:30:00Z' }

describe('mondayBadge', () => {
  it('stays quiet until the status has loaded', () => {
    expect(mondayBadge(null)).toEqual({ state: 'unknown', label: 'monday' })
  })

  it('says when monday is not set up on this computer', () => {
    expect(mondayBadge({ app_configured: false, connected: false })).toEqual({
      state: 'unavailable', label: "monday isn't set up on this computer",
    })
  })

  it('offers to connect when signed out', () => {
    expect(mondayBadge({ app_configured: true, connected: false })).toEqual({ state: 'disconnected', label: 'Connect monday' })
  })

  it('waits for the browser sign-in while connecting', () => {
    expect(mondayBadge({ app_configured: true, connected: false }, { connecting: true })).toEqual({
      state: 'connecting', label: 'Finish signing in to monday in your browser',
    })
  })

  it('shows who is connected, the last sync, and that a click syncs', () => {
    expect(mondayBadge(signedIn, { when })).toEqual({
      state: 'connected', label: 'monday · connected as Ana Ruiz · synced T(2026-10-28T09:30:00Z) · click to sync now',
    })
  })

  it('leaves out the sync time before the first sync', () => {
    expect(mondayBadge({ ...signedIn, last_sync: null, user: null }, { when }).label)
      .toBe('monday · connected · click to sync now')
  })

  it('shows a running sync', () => {
    expect(mondayBadge(signedIn, { syncing: true, when })).toEqual({ state: 'syncing', label: 'monday · syncing the deal board' })
  })

  it('a finished sign-in wins over a stale connecting flag', () => {
    expect(mondayBadge(signedIn, { connecting: true, when }).state).toBe('connected')
  })

  it('names the board name once it is picked', () => {
    expect(mondayBadge(signedIn, { who: 'Abi Bolatiwa', when }).label).toMatch(/^monday · connected as Abi Bolatiwa ·/)
  })
})
