import { describe, expect, it } from 'vitest'
import { largestFit } from './fitText'

describe('largestFit', () => {
  it('keeps the full size when the text already fits', () => {
    expect(largestFit(() => true, 11, 21.6)).toBe(21.6)
  })

  it('finds the largest whole pixel size that fits', () => {
    expect(largestFit((size) => size <= 14.3, 11, 21.6)).toBe(14)
  })

  it('stops at the minimum when nothing fits', () => {
    expect(largestFit(() => false, 11, 21.6)).toBe(11)
  })
})
