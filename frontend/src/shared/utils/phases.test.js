import { expect, it } from 'vitest'
import { matchPhase } from './phases'

it.each([
  ['◆ PREPARE  Wk 1–4  (4 wks)', 'Prepare'],
  ['Explore', 'Explore'],
  ['Realize', 'Build'],
  ['Test', 'Test'],
  ['Deploy', 'Go-Live'],
  ['Sustain', 'Hypercare'],
  ['nonsense', null],
])('matchPhase(%s) -> %s', (key, expected) => {
  expect(matchPhase(key)).toBe(expected)
})
