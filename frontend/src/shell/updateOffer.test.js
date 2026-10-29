import { describe, expect, it } from 'vitest'
import { promptFor, updateNotice } from './updateOffer'

describe('promptFor', () => {
  it('stays quiet until there is a ready update in the packaged app', () => {
    expect(promptFor(null)).toBe(null)
    expect(promptFor({ enabled: false, ready: '1.1.0' })).toBe(null)
    expect(promptFor({ enabled: true, ready: '' })).toBe(null)
  })

  it('offers the ready version unless the person said Later to it', () => {
    expect(promptFor({ enabled: true, ready: '1.1.0' }, null)).toBe('1.1.0')
    expect(promptFor({ enabled: true, ready: '1.1.0' }, '1.1.0')).toBe(null)
    expect(promptFor({ enabled: true, ready: '1.1.1' }, '1.1.0')).toBe('1.1.1')
  })
})

describe('updateNotice', () => {
  it('explains what the person can do about an update that cannot arrive', () => {
    expect(updateNotice({ notice: 'no_access' })).toBe(
      "Your monday account can't see s0L's update board, so s0L can't update itself. Ask the board's owner for access.",
    )
    expect(updateNotice({ notice: 'reconnect' })).toBe(
      'Connect monday again (the icon at the top) so s0L can keep itself up to date.',
    )
  })

  it('says nothing otherwise', () => {
    expect(updateNotice({ notice: null })).toBe(null)
    expect(updateNotice(null)).toBe(null)
  })
})
