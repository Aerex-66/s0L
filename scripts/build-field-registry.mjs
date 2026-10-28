#!/usr/bin/env node
/**
 * Builds FIELD_REGISTRY.md — the human-readable view of shared/field_index.json.
 * Run `npm run registry` after editing the index; `--check` fails when the
 * committed registry is stale (the test suite runs it).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const index = JSON.parse(readFileSync(path.join(root, 'shared/field_index.json'), 'utf8'))
const target = path.join(root, 'FIELD_REGISTRY.md')

const cell = (value) => (value ? String(value).replace(/\|/g, '\\|') : '—')
const code = (value) => (value ? `\`${value}\`` : '—')
const list = (values) => (values && values.length ? values.map((v) => cell(v)).join(', ') : '—')

function isbdLabels(isbd) {
  if (!isbd) return '—'
  const parts = [...(isbd.labels || [])]
  for (const [slide, labels] of Object.entries(isbd.scoped || {})) {
    for (const label of labels) parts.push(`${label} *(${slide})*`)
  }
  return list(parts)
}

function source(entry) {
  if (entry.derive?.compute) return `computed: ${code(entry.derive.compute)}${entry.derive.role ? ` (${entry.derive.role})` : ''}`
  if (entry.derive?.path) return `from ${code(entry.derive.path)}`
  return code(entry.path)
}

function mondayColumn(block) {
  if (!block) return '—'
  if (block.source) return `row ${block.source === 'item_id' ? 'id' : block.source}`
  return `${cell(block.title)} (${code(block.column_id)}${block.part ? `, ${block.part}` : ''})${block.writable ? ' · s0L writes' : ''}`
}

const sections = {}
for (const [key, entry] of Object.entries(index.fields)) {
  (sections[entry.section] ||= []).push([key, entry])
}

const lines = [
  '# s0L Field Registry',
  '',
  '> Generated from [shared/field_index.json](shared/field_index.json) by `npm run registry`. Do not edit by hand — edit the index and regenerate.',
  '',
  'Every field that crosses a module or runtime boundary is declared once in the index. **Owner** decides who may write it:',
  '',
  ...Object.entries(index.owners).map(([owner, meaning]) => `- **${owner}** — ${meaning}`),
  '',
  `${Object.keys(index.fields).length} fields in ${Object.keys(sections).length} sections. Old names are aliases: any of them resolves to the key on write, and the load-time migration renames stored data.`,
  '',
]

for (const [section, fields] of Object.entries(sections)) {
  lines.push(`## ${section}`, '', '| Key | Label | Owner | Stored at / source | GSSM cell | monday column | iSBD labels | Old names |', '|---|---|---|---|---|---|---|---|')
  for (const [key, entry] of fields) {
    const owner = entry.editable_until_linked ? `${entry.owner} (deal-editable until linked)` : entry.owner
    lines.push(`| ${code(key)} | ${cell(entry.label)} | ${owner} | ${source(entry)} | ${code(entry.gssm)} | ${mondayColumn(entry.monday)} | ${isbdLabels(entry.isbd)} | ${list(entry.aliases)} |`)
  }
  lines.push('')
}

const output = lines.join('\n')
if (process.argv.includes('--check')) {
  const current = readFileSync(target, 'utf8').replace(/\r\n/g, '\n')
  if (current !== output) {
    console.error('FIELD_REGISTRY.md is stale. Run: npm run registry')
    process.exit(1)
  }
} else {
  writeFileSync(target, output)
  console.log(`Wrote FIELD_REGISTRY.md (${Object.keys(index.fields).length} fields)`)
}
