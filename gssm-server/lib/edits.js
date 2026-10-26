/**
 * Edit normalization — value coercion, XML sanitisation, and edit
 * validation against sheet metadata (formula-cell protection, bounds,
 * validation-range warnings).
 */
import { toA1 } from './cellRefs.js'
import { buildValidationRangesBySheet } from './validations.js'

export const sanitizeXmlUnsafeText = (value) => {
  const text = String(value || '')
  let result = ''
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31)) {
      continue
    }
    result += text[index]
  }
  return result
}

export const normalizeEditValue = (value) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    if (trimmed.startsWith('=')) return `=${sanitizeXmlUnsafeText(trimmed.slice(1))}`
    if (trimmed.toUpperCase() === 'TRUE') return true
    if (trimmed.toUpperCase() === 'FALSE') return false
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed)) return parsed
    }
    return sanitizeXmlUnsafeText(trimmed)
  }
  return sanitizeXmlUnsafeText(String(value))
}

export const buildFormulaCellSet = (sheetMeta) => {
  const set = new Set()
  ;(sheetMeta?.cells || []).forEach((cell) => {
    if (!cell?.formula || cell?.row == null || cell?.col == null) return
    set.add(`${Number(cell.row) - 1}:${Number(cell.col) - 1}`)
  })
  return set
}

const isWithinRanges = (row, col, ranges = []) =>
  ranges.some((range) => row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol)

export const normalizeIncomingEdits = ({ updates = [], session }) => {
  const validEdits = []
  const rejected = []
  const warnings = []

  const formulaBySheet = new Map()
  const rangesBySheet = buildValidationRangesBySheet(session)

  ;(Array.isArray(updates) ? updates : []).forEach((edit, index) => {
    const sheet = String(edit?.sheet || '').trim()
    const row = Number(edit?.row)
    const col = Number(edit?.col)
    const value = normalizeEditValue(edit?.value)

    if (!sheet || !Number.isInteger(row) || row < 0 || row > 1048576 || !Number.isInteger(col) || col < 0 || col > 16384) {
      rejected.push({ index, reason: 'invalid_coordinates_or_sheet', edit })
      return
    }

    const sheetMeta = session?.sheetMetaMap?.get(sheet)
    if (!sheetMeta) {
      rejected.push({ index, reason: 'unknown_sheet', edit })
      return
    }

    if (!formulaBySheet.has(sheet)) {
      formulaBySheet.set(sheet, buildFormulaCellSet(sheetMeta))
    }

    const formulaSet = formulaBySheet.get(sheet)
    if (formulaSet.has(`${row}:${col}`)) {
      rejected.push({ index, reason: 'formula_cell_protected', sheet, row, col, address: toA1(row, col) })
      return
    }

    const ranges = rangesBySheet.get(sheet) || []
    if (ranges.length > 0 && !isWithinRanges(row, col, ranges)) {
      warnings.push({ index, reason: 'outside_validation_ranges', sheet, row, col, address: toA1(row, col) })
    }

    validEdits.push({ sheet, row, col, value })
  })

  return { validEdits, rejected, warnings }
}

export const normalizeEditsShallow = (updates = []) => {
  const validEdits = []
  const rejected = []

  ;(Array.isArray(updates) ? updates : []).forEach((edit, index) => {
    const sheet = String(edit?.sheet || '').trim()
    const row = Number(edit?.row)
    const col = Number(edit?.col)
    if (!sheet || !Number.isInteger(row) || row < 0 || row > 1048576 || !Number.isInteger(col) || col < 0 || col > 16384) {
      rejected.push({ index, reason: 'invalid_coordinates_or_sheet', edit })
      return
    }

    validEdits.push({
      sheet,
      row,
      col,
      value: normalizeEditValue(edit?.value),
    })
  })

  return { validEdits, rejected }
}
