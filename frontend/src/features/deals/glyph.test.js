import { describe, expect, it } from 'vitest'
import { glyphCells, glyphDepth, tcvMeter } from './glyph'

describe('deal glyph', () => {
  it('is the same every time for the same deal', () => {
    expect(glyphCells('1001', 4)).toEqual(glyphCells('1001', 4))
    expect(glyphCells('1001', 4)).not.toEqual(glyphCells('1002', 4))
  })

  it('tiles the whole square with no gaps', () => {
    const area = glyphCells('1001', 5).reduce((sum, cell) => sum + cell.size * cell.size, 0)
    expect(area).toBeCloseTo(100 * 100)
  })

  it('gets finer for bigger deals', () => {
    expect([glyphDepth(0), glyphDepth(2.5e6), glyphDepth(12e6), glyphDepth(250e6)]).toEqual([2, 2, 3, 5])
  })

  it('places TCV on a log scale between the smallest and largest deal', () => {
    const range = [Math.log10(1e6), Math.log10(100e6)]
    expect(tcvMeter(100e6, range)).toBe(1)
    expect(tcvMeter(10e6, range)).toBeCloseTo(0.5)
    expect(tcvMeter(0, range)).toBe(0)
  })
})
