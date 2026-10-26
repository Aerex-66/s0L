/**
 * Data-validation helpers — named-range resolution, list expansion, and
 * validation range mapping used for edit gating and dropdown options.
 */
import { parseRangeRef, parseSheetRef } from './cellRefs.js'

export const resolveNamedRange = (session, name) => {
  const targets = session?.workbookMeta?.definedNames || []
  // Prefer global scope (localSheetId === null) over sheet-scoped names
  const match = targets.find((entry) =>
    String(entry.name || '').toLowerCase() === String(name || '').toLowerCase() && entry.localSheetId == null
  ) || targets.find((entry) =>
    String(entry.name || '').toLowerCase() === String(name || '').toLowerCase()
  )
  const rangeText = Array.isArray(match?.ranges) ? match.ranges[0] : match?.text || null
  if (!rangeText) return null

  // Try direct cell/range reference first
  const direct = parseSheetRef(rangeText, null)
  if (direct) return direct

  // Handle OFFSET(Sheet!$Col$Row, rowOffset, colOffset, ...) by extracting the anchor
  const offsetMatch = rangeText.match(/OFFSET\((?:'([^']+)'|([A-Za-z][A-Za-z0-9_ ]*))?!?\$?([A-Z]+)\$?(\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/i)
  if (offsetMatch) {
    const sheetName = offsetMatch[1] || offsetMatch[2]
    const toNumber = (col) => col.toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0)
    const anchorCol = toNumber(offsetMatch[3])
    const anchorRow = Number(offsetMatch[4])
    const rowOff = Number(offsetMatch[5])
    const colOff = Number(offsetMatch[6])
    // Return a large range hint — getRangeValues will filter empties
    return {
      sheetName,
      range: { startRow: anchorRow + rowOff, endRow: anchorRow + rowOff + 10000, startCol: anchorCol + colOff, endCol: anchorCol + colOff },
    }
  }

  return null
}

export const buildCellValueMap = (sheetMeta) => {
  const map = new Map()
  // Support _sparseRows format from NDJSON parser
  if (sheetMeta?._sparseRows) {
    const rows = sheetMeta._sparseRows
    for (let r = 0; r < rows.length; r += 1) {
      const rowObj = rows[r]
      if (!rowObj) continue
      for (const [field, value] of Object.entries(rowObj)) {
        if (!field.startsWith('c')) continue
        const col = Number(field.slice(1))
        map.set(`${r + 1}:${col + 1}`, value)  // 1-based like cells format
      }
    }
    return map
  }
  ;(sheetMeta?.cells || []).forEach((cell) => {
    if (cell.row == null || cell.col == null) return
    map.set(`${cell.row}:${cell.col}`, cell.value)
  })
  return map
}

export const getRangeValues = (sheetMeta, range) => {
  if (!sheetMeta || !range) return []
  const cellMap = buildCellValueMap(sheetMeta)
  const values = []
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const value = cellMap.get(`${row}:${col}`)
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        values.push(value)
      }
    }
  }
  return values
}

export const parseValidationList = (validation, session, currentSheet) => {
  if (!validation || validation.type !== 'list') return null
  const formula = String(validation.formula1 || '').trim()
  if (!formula) return null

  if (formula.startsWith('"') && formula.endsWith('"')) {
    const raw = formula.slice(1, -1)
    return raw.split(',').map((item) => item.trim()).filter(Boolean)
  }

  const ref = parseSheetRef(formula, currentSheet) || resolveNamedRange(session, formula)
  if (!ref) return null
  const sheetMeta = session.sheetMetaMap?.get(ref.sheetName)
  const values = getRangeValues(sheetMeta, ref.range)
  return values.map((value) => String(value))
}

export const expandValidationRanges = (sheetMeta, session) => {
  const validations = sheetMeta?.dataValidations || []
  const ranges = []
  validations.forEach((validation) => {
    const options = parseValidationList(validation, session, sheetMeta?.name)
    if (!options || options.length === 0) return
    const refs = String(validation.sqref || '').split(' ').filter(Boolean)
    refs.forEach((ref) => {
      const parsed = parseRangeRef(ref)
      if (!parsed) return
      ranges.push({
        startRow: parsed.startRow - 1,
        endRow: parsed.endRow - 1,
        startCol: parsed.startCol - 1,
        endCol: parsed.endCol - 1,
        options,
      })
    })
  })
  return ranges
}

export const buildValidationRangesBySheet = (session) => {
  const map = new Map()
  ;(session?.sheetMetaMap || new Map()).forEach((sheetMeta, sheetName) => {
    const ranges = expandValidationRanges(sheetMeta, session)
    map.set(sheetName, ranges)
  })
  return map
}
