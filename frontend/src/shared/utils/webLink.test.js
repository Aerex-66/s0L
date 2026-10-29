import { describe, expect, it } from 'vitest'
import { webLink } from './webLink'

describe('webLink', () => {
  it('keeps http and https addresses', () => {
    expect(webLink(' https://ibm.box.com/s/abc ')).toBe('https://ibm.box.com/s/abc')
    expect(webLink('http://intranet.example/x')).toBe('http://intranet.example/x')
  })

  it('refuses anything that is not a web address', () => {
    expect(webLink('javascript:alert(1)')).toBeNull()
    expect(webLink('file:///C:/secret.txt')).toBeNull()
    expect(webLink('ibm.box.com/s/abc')).toBeNull()
    expect(webLink('https://')).toBeNull()
    expect(webLink('')).toBeNull()
    expect(webLink(null)).toBeNull()
  })
})
