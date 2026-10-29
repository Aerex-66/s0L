import { describe, expect, it } from 'vitest'
import { readyUpdate } from './updateStore'
import { promptFor } from '../shell/updateOffer'

describe('readyUpdate', () => {
  it('names the version waiting to be installed, only in the packaged app', () => {
    expect(readyUpdate(null)).toBe(null)
    expect(readyUpdate({ enabled: false, ready: '1.1.0' })).toBe(null)
    expect(readyUpdate({ enabled: true, ready: '' })).toBe(null)
    expect(readyUpdate({ enabled: true, ready: '1.1.0' })).toBe('1.1.0')
  })

  it('stays after Later, which only stops the prompt from asking again', () => {
    const status = { enabled: true, ready: '1.1.0' }
    expect(promptFor(status, '1.1.0')).toBe(null)
    expect(readyUpdate(status)).toBe('1.1.0')
  })
})
