import { describe, expect, it } from 'vitest'
import { clientKey } from './clientLogoStore'

describe('clientKey', () => {
  it('matches the backend key: lower-case, single-spaced, trimmed', () => {
    expect(clientKey('  Contoso   Ltd ')).toBe('contoso ltd')
    expect(clientKey(null)).toBe('')
  })
})
