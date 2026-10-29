import { describe, expect, it } from 'vitest'
import { outlookBadge } from './outlookBadge'

const status = (effective, found, running) => ({ app: { found, running }, mode: null, effective })

describe('outlookBadge', () => {
  it('stays quiet and grey until the status has loaded', () => {
    expect(outlookBadge(null)).toEqual({ state: 'unknown', label: 'Outlook', inUse: false })
  })

  it('is in colour with a green dot while the Outlook app is open', () => {
    expect(outlookBadge(status('app', true, true))).toEqual({
      state: 'connected', label: 'Outlook · the app on this computer · click for Quick contacts', inUse: true,
    })
  })

  it('stays in colour but quiet while the app is closed', () => {
    expect(outlookBadge(status('app', true, false))).toEqual({
      state: 'closed', label: 'Outlook · the app on this computer (open it to see your calendar) · click for Quick contacts', inUse: true,
    })
  })

  it('is grey when the chosen app is no longer set up', () => {
    expect(outlookBadge(status('app', false, false))).toEqual({
      state: 'missing', label: "Outlook · the app isn't set up on this computer · click to choose", inUse: false,
    })
  })

  it('is grey in the browser', () => {
    expect(outlookBadge(status('web', true, true))).toEqual({
      state: 'web', label: 'Outlook · in the browser · click for Quick contacts', inUse: false,
    })
  })
})
