import { execFileSync } from 'node:child_process'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

it('FIELD_REGISTRY.md is generated from the current field index', () => {
  const run = () => execFileSync(execPath, ['scripts/build-field-registry.mjs', '--check'], { cwd: root, encoding: 'utf8' })
  expect(run).not.toThrow()
})
