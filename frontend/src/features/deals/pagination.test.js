import { describe, expect, it } from 'vitest'
import { pageWindow } from './pagination'

describe('pageWindow', () => {
  it.each([
    [1, 1, [1]],
    [2, 3, [1, 2, 3]],
    [1, 10, [1, 2, '…', 10]],
    [5, 10, [1, '…', 4, 5, 6, '…', 10]],
    [10, 10, [1, '…', 9, 10]],
  ])('page %i of %i -> %j', (page, pageCount, expected) => {
    expect(pageWindow(page, pageCount)).toEqual(expected)
  })
})
