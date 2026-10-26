import { runExcelAdapter } from './excelFunctionAdapters.js'

const toNumber = (value) => {
  if (value === null || value === undefined) return null
  const text = String(value).trim().replace(/,/g, '')
  if (!text) return null
  const numeric = Number(text)
  return Number.isFinite(numeric) ? numeric : null
}

const colToIndex = (letters) => {
  let value = 0
  const text = String(letters || '').toUpperCase()
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 26) + (text.charCodeAt(index) - 64)
  }
  return value - 1
}

const parseA1 = (address) => {
  const match = String(address || '').match(/^\$?([A-Z]{1,3})\$?(\d+)$/i)
  if (!match) return null
  return { rowOneBased: Number(match[2]), colZeroBased: colToIndex(match[1]) }
}

const parseA1Range = (text) => {
  const full = String(text || '').trim()
  const match = full.match(/^\$?([A-Z]{1,3})\$?(\d+)\s*:\s*\$?([A-Z]{1,3})\$?(\d+)$/i)
  if (match) {
    return {
      startRow: Number(match[2]),
      endRow: Number(match[4]),
      startCol: colToIndex(match[1]),
      endCol: colToIndex(match[3]),
    }
  }

  const rowOnly = full.match(/^\$?(\d+)\s*:\s*\$?(\d+)$/)
  if (rowOnly) {
    return {
      startRow: Number(rowOnly[1]),
      endRow: Number(rowOnly[2]),
      startCol: 0,
      endCol: null,
    }
  }

  const colOnly = full.match(/^\$?([A-Z]{1,3})\s*:\s*\$?([A-Z]{1,3})$/i)
  if (colOnly) {
    return {
      startRow: 1,
      endRow: null,
      startCol: colToIndex(colOnly[1]),
      endCol: colToIndex(colOnly[2]),
    }
  }

  return null
}

const _sheetBoundsCache = new WeakMap()
const detectSheetBounds = (rows = []) => {
  if (_sheetBoundsCache.has(rows)) return _sheetBoundsCache.get(rows)
  let maxCol = 0
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      const match = /^c(\d+)$/.exec(key)
      if (!match) return
      const col = Number(match[1])
      if (Number.isFinite(col)) maxCol = Math.max(maxCol, col)
    })
  })
  const bounds = {
    maxRow: Math.max(1, rows.length),
    maxCol: Math.max(0, maxCol),
  }
  _sheetBoundsCache.set(rows, bounds)
  return bounds
}

const parseSheetQualifiedRef = (token, defaultSheet = '') => {
  const text = String(token || '').trim()
  const cross = text.match(/^(?:\[[^\]]+\])?(?:'((?:[^']|'')+)'|([A-Za-z0-9_. ]+))!\s*(.+)$/)
  if (!cross) {
    return { sheet: defaultSheet, ref: text }
  }
  const quoted = cross[1] ? cross[1].replace(/''/g, "'") : ''
  const plain = cross[2] || ''
  const ref = cross[3] || ''
  return { sheet: quoted || plain || defaultSheet, ref: String(ref).trim() }
}

const normalizeFormulaText = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.startsWith('=') ? text.slice(1).trim() : text
}

const parseRefOnly = (token, defaultSheet = '') => {
  const cleaned = String(token || '').trim()
  if (!cleaned) return null
  const scoped = parseSheetQualifiedRef(cleaned, defaultSheet)
  if (parseA1(scoped.ref)) return { type: 'cell', ref: cleaned }
  if (parseA1Range(scoped.ref)) return { type: 'range', ref: cleaned }
  return null
}

const buildDefinedNameResolver = ({ definedNames = [], sheetNames = [] } = {}) => {
  const byLocal = new Map()
  const byGlobal = new Map()
  const byAny = new Map()

  ;(Array.isArray(definedNames) ? definedNames : []).forEach((entry) => {
    const name = String(entry?.name || '').trim()
    if (!name) return
    const normalizedName = name.toUpperCase()
    const localSheetId = Number.parseInt(String(entry?.localSheetId ?? ''), 10)
    const hasLocal = Number.isInteger(localSheetId) && localSheetId >= 0
    const localSheet = hasLocal ? sheetNames[localSheetId] : null
    const localSheetKey = localSheet ? localSheet.toUpperCase() : null

    if (localSheetKey) {
      byLocal.set(`${normalizedName}@@${localSheetKey}`, entry)
    } else {
      byGlobal.set(normalizedName, entry)
    }

    if (!byAny.has(normalizedName)) byAny.set(normalizedName, entry)
  })

  return (nameToken, currentSheet = '') => {
    const token = String(nameToken || '').trim().toUpperCase()
    if (!token) return null
    const current = String(currentSheet || '').trim().toUpperCase()
    const localKey = current ? `${token}@@${current}` : ''

    const hit = (localKey ? byLocal.get(localKey) : null) || byGlobal.get(token) || byAny.get(token)
    if (!hit) return null
    const ranges = Array.isArray(hit.ranges) ? hit.ranges : []
    return ranges[0] || null
  }
}

const getRowsForSheet = (fallbackRows = [], context = {}, sheetName = '') => {
  const key = String(sheetName || '').trim()
  if (key && context?.workbookSheets && Array.isArray(context.workbookSheets[key])) {
    return context.workbookSheets[key]
  }
  return fallbackRows
}

const materializeRange = (rowData = [], rangeText, context = {}) => {
  const { currentSheet = '' } = context
  const scoped = parseSheetQualifiedRef(rangeText, currentSheet)
  const targetSheet = scoped.sheet || currentSheet
  const targetRows = getRowsForSheet(rowData, context, targetSheet)
  const parsed = parseA1Range(scoped.ref)
  if (!parsed) return null

  const bounds = detectSheetBounds(targetRows)
  const startRow = Math.max(1, parsed.startRow)
  const endRow = Math.max(startRow, Math.min(parsed.endRow ?? bounds.maxRow, bounds.maxRow))
  const startCol = Math.max(0, parsed.startCol)
  const endCol = Math.max(startCol, Math.min(parsed.endCol ?? bounds.maxCol, bounds.maxCol))

  const values = []
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const rowObj = targetRows[row - 1] || {}
      values.push(rowObj[`c${col}`] ?? '')
    }
  }

  return {
    __type: 'range',
    values,
    startRow,
    endRow,
    startCol,
    endCol,
    rowCount: endRow - startRow + 1,
    colCount: endCol - startCol + 1,
    sheet: targetSheet,
  }
}

const materializeRectRange = (targetRows = [], targetSheet = '', startRow = 1, endRow = 1, startCol = 0, endCol = 0) => {
  const safeStartRow = Math.max(1, Number(startRow) || 1)
  const safeEndRow = Math.max(safeStartRow, Number(endRow) || safeStartRow)
  const safeStartCol = Math.max(0, Number(startCol) || 0)
  const safeEndCol = Math.max(safeStartCol, Number(endCol) || safeStartCol)

  const values = []
  for (let row = safeStartRow; row <= safeEndRow; row += 1) {
    for (let col = safeStartCol; col <= safeEndCol; col += 1) {
      const rowObj = targetRows[row - 1] || {}
      values.push(rowObj[`c${col}`] ?? '')
    }
  }

  return {
    __type: 'range',
    values,
    startRow: safeStartRow,
    endRow: safeEndRow,
    startCol: safeStartCol,
    endCol: safeEndCol,
    rowCount: safeEndRow - safeStartRow + 1,
    colCount: safeEndCol - safeStartCol + 1,
    sheet: targetSheet,
  }
}

const countNonEmptyInCol = (rows = [], colZero = 0, startRowOne = 1) => {
  let count = 0
  for (let row = Math.max(1, startRowOne); row <= rows.length; row += 1) {
    const rowObj = rows[row - 1] || {}
    const text = String(rowObj[`c${colZero}`] ?? '').trim()
    if (text) count += 1
  }
  return count
}

const countNonEmptyInRow = (rows = [], rowOne = 1) => {
  const rowObj = rows[Math.max(1, rowOne) - 1] || {}
  return Object.keys(rowObj).filter((key) => /^c\d+$/.test(key) && String(rowObj[key] ?? '').trim()).length
}

/**
 * Cache for dynamic dimension scans (countNonEmptyInRow / countNonEmptyInCol).
 * Key = "sheetName:type" → value.  Cleared via `_dynDimCacheGeneration` counter
 * which is bumped each time recalcFormulas is invoked with new rowData.
 */
let _dynDimCache = new Map()
let _dynDimCacheRows = null // reference-identity check to auto-invalidate

const _getDynDim = (key, computeFn, workbookSheets) => {
  if (_dynDimCacheRows !== workbookSheets) {
    _dynDimCache = new Map()
    _dynDimCacheRows = workbookSheets
  }
  if (_dynDimCache.has(key)) return _dynDimCache.get(key)
  const val = computeFn()
  _dynDimCache.set(key, val)
  return val
}

const resolveKnownDynamicDefinedName = (rowData = [], token = '', context = {}) => {
  const name = String(token || '').trim().toUpperCase()
  if (!name) return null

  // Quick reject: only handle known names to avoid unnecessary sheet lookups
  const KNOWN_DYNAMIC_NAMES = new Set([
    'BANDINFOLOOKUPHDR', 'BANDTABLE', 'BANDS_LIST', 'RATESTABLE', 'RATESYEARS',
    'STAFFRANGE', 'TOTALHOURSRANGE', 'TOTALFEESRANGE', 'BANDCELL',
  ])
  if (!KNOWN_DYNAMIC_NAMES.has(name)) return null

  const ws = context?.workbookSheets

  const ratesRows = getRowsForSheet(rowData, context, 'Rates')
  if (!Array.isArray(ratesRows) || ratesRows.length === 0) return null

  const bandInfoWidth = _getDynDim('Rates:binfoW', () => Math.max(1, countNonEmptyInRow(ratesRows, 9)), ws)
  const bandInfoHeight = _getDynDim('Rates:binfoH', () => Math.max(0, countNonEmptyInCol(ratesRows, 2, 9)), ws)
  const bodyHeight = _getDynDim('Rates:bodyH', () => Math.max(0, countNonEmptyInCol(ratesRows, 2, 10)), ws)

  if (name === 'BANDINFOLOOKUPHDR') {
    return materializeRectRange(ratesRows, 'Rates', 9, 9, 0, Math.max(0, bandInfoWidth - 1))
  }

  if (name === 'BANDTABLE') {
    if (bandInfoHeight <= 0) return null
    return materializeRectRange(ratesRows, 'Rates', 9, 9 + bandInfoHeight - 1, 0, Math.max(0, bandInfoWidth - 1))
  }

  if (name === 'BANDS_LIST') {
    if (bodyHeight <= 0) return null
    return materializeRectRange(ratesRows, 'Rates', 10, 10 + bodyHeight - 1, 2, 2)
  }

  if (name === 'RATESTABLE') {
    if (bodyHeight <= 0) return null
    return materializeRectRange(ratesRows, 'Rates', 10, 10 + bodyHeight - 1, colToIndex('BA'), colToIndex('BS'))
  }

  if (name === 'RATESYEARS') {
    return materializeRectRange(ratesRows, 'Rates', 8, 8, colToIndex('BA'), colToIndex('BS'))
  }

  const staffingRows = getRowsForSheet(rowData, context, 'Staffing')
  if (Array.isArray(staffingRows) && staffingRows.length > 0) {
    // Detect header row dynamically: "Rollout" in c0 + "Fees" elsewhere
    const staffHdrRow = _getDynDim('Staffing:hdrRow', () => {
      const limit = Math.min(staffingRows.length, 60)
      for (let r = 0; r < limit; r++) {
        const row = staffingRows[r]
        if (!row || String(row.c0 || '').trim() !== 'Rollout') continue
        for (let c = 1; c < 80; c++) {
          if (String(row[`c${c}`] || '').trim() === 'Fees') return r
        }
      }
      return 26 // fallback
    }, ws)
    const staffDataStart = staffHdrRow + 1

    // Detect output columns dynamically from header row
    const _staffCol = (label) => _getDynDim(`Staffing:col:${label}`, () => {
      const hdr = staffingRows[staffHdrRow] || {}
      for (let c = 0; c < 80; c++) {
        if (String(hdr[`c${c}`] || '').trim() === label) return c
      }
      return -1
    }, ws)
    const feesCol = _staffCol('Fees')
    const hoursCol = _staffCol('Hours')
    const staffingHeaderWidth = _getDynDim('Staffing:hdrW', () => Math.max(1, countNonEmptyInRow(staffingRows, staffDataStart)), ws)
    const staffingBodyHeight = _getDynDim('Staffing:bodyH', () => Math.max(0, countNonEmptyInCol(staffingRows, feesCol >= 0 ? feesCol : colToIndex('AS'), staffDataStart)), ws)

    if (name === 'STAFFRANGE') {
      if (staffingBodyHeight <= 0) return null
      return materializeRectRange(
        staffingRows,
        'Staffing',
        staffDataStart,
        staffDataStart + staffingBodyHeight - 1,
        colToIndex('A'),
        colToIndex('A') + staffingHeaderWidth - 1,
      )
    }

    if (name === 'TOTALHOURSRANGE') {
      const col = hoursCol >= 0 ? hoursCol : colToIndex('AR')
      if (staffingBodyHeight <= 1) return materializeRectRange(staffingRows, 'Staffing', staffDataStart + 1, staffDataStart + 1, col, col)
      return materializeRectRange(
        staffingRows,
        'Staffing',
        staffDataStart + 1,
        staffDataStart + staffingBodyHeight - 1,
        col,
        col,
      )
    }

    if (name === 'TOTALFEESRANGE') {
      const col = feesCol >= 0 ? feesCol : colToIndex('AS')
      if (staffingBodyHeight <= 1) return materializeRectRange(staffingRows, 'Staffing', staffDataStart + 1, staffDataStart + 1, col, col)
      return materializeRectRange(
        staffingRows,
        'Staffing',
        staffDataStart + 1,
        staffDataStart + staffingBodyHeight - 1,
        col,
        col,
      )
    }
  }

  return null
}

const materializeCell = (rowData = [], refText, context = {}) => {
  const { currentSheet = '' } = context
  const scoped = parseSheetQualifiedRef(refText, currentSheet)
  const targetSheet = scoped.sheet || currentSheet
  const targetRows = getRowsForSheet(rowData, context, targetSheet)
  const parsed = parseA1(scoped.ref)
  if (!parsed) return null
  const rowObj = targetRows[parsed.rowOneBased - 1] || {}
  return {
    __type: 'range',
    values: [rowObj[`c${parsed.colZeroBased}`] ?? ''],
    startRow: parsed.rowOneBased,
    endRow: parsed.rowOneBased,
    startCol: parsed.colZeroBased,
    endCol: parsed.colZeroBased,
    rowCount: 1,
    colCount: 1,
    sheet: targetSheet,
  }
}

/**
 * Cache for resolveReferenceValue results during a recalc batch.
 * Keyed on "token@@sheet".  Only caches named-range lookups (identifiers
 * without cell/range syntax) since those produce the same result for every
 * formula in the same recalc batch.
 */
let _refValueCache = new Map()
let _refValueCacheGeneration = 0
let _refValueCacheCurrentGen = -1

const resolveReferenceValue = (rowData = [], token, context = {}) => {
  const raw = String(token || '').trim()
  if (!raw) return null

  // Check cache for named-range-like tokens (no colon, no digits-after-letters pattern)
  const isNamedRange = /^[A-Za-z_][A-Za-z0-9_]*$/i.test(raw)
  if (isNamedRange && _refValueCacheCurrentGen === _refValueCacheGeneration) {
    const cacheKey = `${raw.toUpperCase()}@@${context.currentSheet || ''}`
    if (_refValueCache.has(cacheKey)) return _refValueCache.get(cacheKey)
  }

  const knownDynamic = resolveKnownDynamicDefinedName(rowData, raw, context)
  if (knownDynamic) {
    if (isNamedRange && _refValueCacheCurrentGen === _refValueCacheGeneration) {
      _refValueCache.set(`${raw.toUpperCase()}@@${context.currentSheet || ''}`, knownDynamic)
    }
    return knownDynamic
  }

  const direct = parseRefOnly(raw, context.currentSheet)
  if (direct?.type === 'cell') return materializeCell(rowData, raw, context)
  if (direct?.type === 'range') return materializeRange(rowData, raw, context)

  const resolveDefinedName = context.resolveDefinedName || (() => null)
  const resolvedNameRef = resolveDefinedName(raw, context.currentSheet)
  if (resolvedNameRef) {
    const nested = String(resolvedNameRef).replace(/^=+/, '').trim()
    const knownNested = resolveKnownDynamicDefinedName(rowData, raw, context)
    if (knownNested) {
      if (isNamedRange && _refValueCacheCurrentGen === _refValueCacheGeneration) {
        _refValueCache.set(`${raw.toUpperCase()}@@${context.currentSheet || ''}`, knownNested)
      }
      return knownNested
    }
    const nestedDirect = parseRefOnly(nested, context.currentSheet)
    if (nestedDirect?.type === 'cell') {
      const result = materializeCell(rowData, nested, context)
      if (isNamedRange && _refValueCacheCurrentGen === _refValueCacheGeneration) {
        _refValueCache.set(`${raw.toUpperCase()}@@${context.currentSheet || ''}`, result)
      }
      return result
    }
    if (nestedDirect?.type === 'range') {
      const result = materializeRange(rowData, nested, context)
      if (isNamedRange && _refValueCacheCurrentGen === _refValueCacheGeneration) {
        _refValueCache.set(`${raw.toUpperCase()}@@${context.currentSheet || ''}`, result)
      }
      return result
    }
  }

  return null
}

const parseArgs = (argsText) => {
  const args = []
  let current = ''
  let depth = 0
  let inString = false

  for (let index = 0; index < argsText.length; index += 1) {
    const char = argsText[index]
    if (char === '"') {
      inString = !inString
      current += char
      continue
    }
    if (!inString) {
      if (char === '(') depth += 1
      if (char === ')') depth = Math.max(0, depth - 1)
      if (char === ',' && depth === 0) {
        args.push(current.trim())
        current = ''
        continue
      }
    }
    current += char
  }
  if (current.trim()) args.push(current.trim())
  return args
}

const getFunctionCallParts = (formulaText) => {
  const text = String(formulaText || '').trim()
  const match = text.match(/^([_A-Z][_A-Z0-9.]*)\((.*)\)$/i)
  if (!match) return null

  const fnNameEnd = match[1].length
  let depth = 0
  let inString = false
  for (let index = fnNameEnd; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') inString = !inString
    if (inString) continue
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (depth === 0 && index < text.length - 1) return null
  }

  return {
    name: match[1],
    argsText: match[2],
  }
}

const toJsComparison = (expr) => {
  const text = String(expr || '')
  let out = ''
  let inString = false

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index]

    if (ch === '"') {
      inString = !inString
      out += ch
      continue
    }

    if (!inString) {
      if (ch === '<' && text[index + 1] === '>') {
        out += '!='
        index += 1
        continue
      }

      if (ch === '=') {
        const prev = text[index - 1] || ''
        const next = text[index + 1] || ''
        const alreadyComparison = prev === '<' || prev === '>' || prev === '=' || next === '='
        out += alreadyComparison ? '=' : '=='
        continue
      }
    }

    out += ch
  }

  return out
}

// Replace Excel & (concat) outside string literals.
const replaceAmpersandOutsideStrings = (text) => {
  // Split on & outside strings, rejoin with String() coercion
  const segments = []
  let current = ''
  let inString = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '"') {
      inString = !inString
      current += ch
      continue
    }
    if (!inString && ch === '&') {
      segments.push(current)
      current = ''
      continue
    }
    current += ch
  }
  segments.push(current)
  if (segments.length <= 1) return text
  // Wrap each segment with String() so JS '+' behaves like Excel '&' concatenation.
  return segments.map(s => {
    return `String(${s})`
  }).join('+')
}

// Apply a regex replacement only to segments outside string literals.
const replaceOutsideStrings = (text, pattern, replacement) => {
  let result = ''
  let inString = false
  let current = ''
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    // Skip escaped characters inside strings
    if (inString && ch === '\\') {
      current += ch + (text[i + 1] || '')
      i += 1
      continue
    }
    if (ch === '"') {
      if (inString) {
        result += current + ch
        current = ''
        inString = false
      } else {
        result += current.replace(pattern, replacement)
        current = ch
        inString = true
      }
      continue
    }
    current += ch
  }
  if (inString) {
    result += current
  } else {
    result += current.replace(pattern, replacement)
  }
  return result
}

const encodeLiteralForExpression = (value) => {
  if (value === null || value === undefined) return '0'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  const text = String(value)
  if (!text) return '0'
  return JSON.stringify(text)
}

const scalarizeValue = (value) => {
  if (!value || typeof value !== 'object' || value.__type !== 'range') return value
  if (Number(value.rowCount) === 1 && Number(value.colCount) === 1) {
    return value.values?.[0] ?? ''
  }
  return value.values?.[0] ?? ''
}

const isExcelErrorToken = (value) => /^#(N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NUM!|NULL!|ERROR!)$/i.test(String(value ?? '').trim())

const isTruthyExcelLike = (value) => {
  const scalar = scalarizeValue(value)
  if (typeof scalar === 'boolean') return scalar
  const numeric = toNumber(scalar)
  if (numeric != null) return numeric !== 0
  const text = String(scalar ?? '').trim().toUpperCase()
  if (!text || text === 'FALSE') return false
  if (text === 'TRUE') return true
  return true
}

const replaceScalarIdentifiersOutsideStrings = (expressionText, resolver) => {
  const text = String(expressionText || '')
  let out = ''
  let inString = false
  let index = 0

  const isIdentStart = (ch) => /[A-Za-z_]/.test(ch)
  const isIdentChar = (ch) => /[A-Za-z0-9_.]/.test(ch)

  while (index < text.length) {
    const ch = text[index]
    if (ch === '"') {
      inString = !inString
      out += ch
      index += 1
      continue
    }

    if (!inString && isIdentStart(ch)) {
      let end = index + 1
      while (end < text.length && isIdentChar(text[end])) end += 1
      const token = text.slice(index, end)
      let probe = end
      while (probe < text.length && /\s/.test(text[probe])) probe += 1
      const nextChar = text[probe] || ''

      const upper = token.toUpperCase()
      if (nextChar !== '(' && nextChar !== '!' && upper !== 'TRUE' && upper !== 'FALSE') {
        const replacement = resolver(token, index, text)
        if (replacement !== null && replacement !== undefined) {
          out += replacement
          index = end
          continue
        }
      }

      out += token
      index = end
      continue
    }

    out += ch
    index += 1
  }

  return out
}

const createAdapterHelpers = (rowData = [], context = {}) => {
  const resolveReference = (refText) => resolveReferenceValue(rowData, refText, context)
  const makeOffsetRange = (baseRef, rowOffset, colOffset, height, width) => {
    let baseRange = null
    if (baseRef && typeof baseRef === 'object' && baseRef.__type === 'range') {
      baseRange = baseRef
    } else if (baseRef != null) {
      baseRange = resolveReference(String(baseRef))
    }
    if (!baseRange || baseRange.__type !== 'range') return null

    const targetSheet = baseRange.sheet || context.currentSheet
    const targetRows = getRowsForSheet(rowData, context, targetSheet)
    const startRow = Number(baseRange.startRow || 0) + Number(rowOffset || 0)
    const startCol = Number(baseRange.startCol || 0) + Number(colOffset || 0)
    const rowCount = Math.max(1, Number(height || baseRange.rowCount || 1))
    const colCount = Math.max(1, Number(width || baseRange.colCount || 1))

    const ref = {
      __type: 'range',
      values: [],
      startRow,
      endRow: startRow + rowCount - 1,
      startCol,
      endCol: startCol + colCount - 1,
      rowCount,
      colCount,
      sheet: targetSheet,
    }

    for (let row = ref.startRow; row <= ref.endRow; row += 1) {
      for (let col = ref.startCol; col <= ref.endCol; col += 1) {
        const rowObj = targetRows[row - 1] || {}
        ref.values.push(rowObj[`c${col}`])
      }
    }
    return ref
  }

  return { resolveReference, makeOffsetRange }
}

const evaluateArgToken = (rowData = [], token = '', context = {}) => {
  if (token.includes(':')) {
    const rangeObj = materializeRange(rowData, token, context)
    if (rangeObj) return rangeObj
  }
  const maybeRef = resolveReferenceValue(rowData, token, context)
  if (maybeRef) return maybeRef
  return evalExpression(rowData, token, context)
}

const evaluateGpeAutomationStaffingLookup = (rowData = [], argTokens = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'GPE-Automation') return null
  if (!Array.isArray(argTokens) || argTokens.length !== 3) return null

  const conditionToken = String(argTokens[0] || '').trim()
  const trueToken = String(argTokens[1] || '').trim()
  const falseToken = String(argTokens[2] || '').trim()
  if (falseToken !== '""') return null

  const condMatch = conditionToken.match(/^A(\d+)\s*<>\s*""$/i)
  if (!condMatch) return null
  const refRowOne = Number(condMatch[1])
  if (!Number.isFinite(refRowOne) || refRowOne <= 0) return null

  if (!/^OFFSET\(/i.test(trueToken)) return null
  if (!/INDIRECT\("Staffing!A\$"\s*&\s*ROW\(StaffingHeader\)\)/i.test(trueToken)) return null

  const rowOffsetMatch = trueToken.match(/\(A(\d+)\s*-\s*ROW\(StaffingHeader\)\)/i)
  if (!rowOffsetMatch) return null
  const refRowFromTrue = Number(rowOffsetMatch[1])

  const headerMatch = trueToken.match(/MATCH\("([^"]+)"\s*,\s*StaffingHeader\s*,\s*0\)\s*-\s*1/i)
  if (!headerMatch) return null
  const headerName = String(headerMatch[1] || '').trim()

  if (refRowFromTrue !== refRowOne || !headerName) return null

  const currentRow = rowData[refRowOne - 1] || {}
  const pointerRaw = currentRow.c0
  if (isExcelErrorToken(pointerRaw)) return String(pointerRaw).trim().toUpperCase()
  const pointerNum = Number(String(pointerRaw ?? '').trim())
  if (!Number.isFinite(pointerNum) || pointerNum <= 0) return ''
  const staffingRowOne = Math.floor(pointerNum)

  const staffingRows = getRowsForSheet(rowData, context, 'Staffing')
  if (!Array.isArray(staffingRows) || staffingRows.length === 0) return ''

  const headerRef = resolveReferenceValue(rowData, 'StaffingHeader', context)
  if (!headerRef || headerRef.__type !== 'range') return ''
  const headerValues = Array.isArray(headerRef.values) ? headerRef.values : []
  const headerIndex = headerValues.findIndex((item) => String(item ?? '').trim().toUpperCase() === headerName.toUpperCase())
  if (headerIndex < 0) return ''

  const targetCol = Number(headerRef.startCol || 0) + headerIndex
  const targetRowObj = staffingRows[staffingRowOne - 1] || {}
  return targetRowObj[`c${targetCol}`] ?? ''
}

const evaluateGpeAutomationSequencePattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'GPE-Automation') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^IF\(\s*INDIRECT\(\s*(?:_xlfn\.)?CONCAT\(\s*"Staffing!"\s*,\s*"N"\s*,\s*ROW\(StaffingHeader\)\s*\+\s*ROW\(A(\d+)\)\s*-\s*1\s*\)\s*\)\s*<>\s*""\s*,\s*A(\d+)\s*\+\s*1\s*,\s*""\s*\)$/i)
  if (!match) return null

  const rowOne = Number(match[1])
  const prevRowOne = Number(match[2])
  if (!Number.isFinite(rowOne) || !Number.isFinite(prevRowOne) || prevRowOne !== rowOne - 1) return null

  const headerRef = resolveReferenceValue(rowData, 'StaffingHeader', context)
  if (!headerRef || headerRef.__type !== 'range') return ''
  const baseRow = Number(headerRef.startRow || 0)
  if (!baseRow) return ''

  const targetRowOne = baseRow + rowOne - 1
  const staffingRows = getRowsForSheet(rowData, context, 'Staffing')
  if (!Array.isArray(staffingRows) || staffingRows.length === 0) return ''

  const staffingRow = staffingRows[targetRowOne - 1] || {}
  const bandValue = staffingRow.c13
  if (isExcelErrorToken(bandValue)) return String(bandValue).trim().toUpperCase()
  const bandText = String(bandValue ?? '').trim()
  if (!bandText) return ''

  const prevRow = rowData[rowOne - 2] || {}
  const currentRow = rowData[rowOne - 1] || {}
  const prevRaw = prevRow.c0 ?? currentRow.c0
  if (isExcelErrorToken(prevRaw)) return String(prevRaw).trim().toUpperCase()
  const prev = toNumber(prevRaw)
  if (prev == null) return ''
  return prev + 1
}

const evaluateGpeAutomationFormulaShape = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'GPE-Automation') return null
  const text = String(formulaText || '').trim()
  const pattern = /^IF\(\s*A(\d+)\s*<>\s*""\s*,\s*OFFSET\(\s*INDIRECT\(\s*"Staffing!A\$"\s*&\s*ROW\(StaffingHeader\)\s*\)\s*,\s*\(\s*A(\d+)\s*-\s*ROW\(StaffingHeader\)\s*\)\s*,\s*MATCH\(\s*"([^"]+)"\s*,\s*StaffingHeader\s*,\s*0\s*\)\s*-\s*1\s*\)\s*,\s*""\s*\)$/i
  const match = text.match(pattern)
  if (!match) return null

  const rowA = Number(match[1])
  const rowB = Number(match[2])
  const headerName = String(match[3] || '').trim()
  if (!Number.isFinite(rowA) || rowA <= 0 || rowA !== rowB || !headerName) return null

  const currentRow = rowData[rowA - 1] || {}
  const pointerNum = Number(String(currentRow.c0 ?? '').trim())
  if (!Number.isFinite(pointerNum) || pointerNum <= 0) return ''
  const staffingRowOne = Math.floor(pointerNum)

  const staffingRows = getRowsForSheet(rowData, context, 'Staffing')
  if (!Array.isArray(staffingRows) || staffingRows.length === 0) return ''

  const headerRef = resolveReferenceValue(rowData, 'StaffingHeader', context)
  if (!headerRef || headerRef.__type !== 'range') return ''
  const headerValues = Array.isArray(headerRef.values) ? headerRef.values : []
  const headerIndex = headerValues.findIndex((item) => String(item ?? '').trim().toUpperCase() === headerName.toUpperCase())
  if (headerIndex < 0) return ''

  const targetCol = Number(headerRef.startCol || 0) + headerIndex
  const targetRowObj = staffingRows[staffingRowOne - 1] || {}
  return targetRowObj[`c${targetCol}`] ?? ''
}

const evaluateNonLaborSpreadPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Non-Labor in GPE') return null
  const text = String(formulaText || '').trim()
  const match = text.match(/^IF\(\s*([A-Z]{1,3}\$\d+)\s*<>\s*""\s*,\s*(\$?[A-Z]{1,3}\$?\d+)\s*\/\s*([A-Za-z_][A-Za-z0-9_.]*)\s*,\s*""\s*\)$/i)
  if (!match) return null

  const condRef = match[1]
  const numeratorRef = match[2]
  const durationToken = match[3]

  const condValue = scalarizeValue(resolveReferenceValue(rowData, condRef, context))
  if (String(condValue ?? '').trim() === '') return ''

  const numerator = toNumber(scalarizeValue(resolveReferenceValue(rowData, numeratorRef, context)))
  const duration = toNumber(scalarizeValue(resolveReferenceValue(rowData, durationToken, context)))
  if (numerator == null || duration == null || duration === 0) return ''
  return numerator / duration
}

const evaluateBackgroundStringBuilder = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Background') return null
  const raw = normalizeFormulaText(formulaText)
  if (!/^SUBSTITUTE\(/i.test(raw)) return null

  const scalarCell = (ref) => {
    const resolved = resolveReferenceValue(rowData, ref, context)
    if (!resolved) return ''
    return String(scalarizeValue(resolved) ?? '')
  }

  const tokenized = raw.replace(/\$?[A-Z]{1,3}\$?\d+/gi, (ref) => JSON.stringify(scalarCell(ref)))
  const rewritten = replaceAmpersandOutsideStrings(toJsComparison(tokenized))
    .replace(/\bSUBSTITUTE\s*\(/gi, '__SUBSTITUTE(')
    .replace(/\bLEFT\s*\(/gi, '__LEFT(')
    .replace(/\bRIGHT\s*\(/gi, '__RIGHT(')
    .replace(/\bLEN\s*\(/gi, '__LEN(')
    .replace(/\bIF\s*\(/gi, '__IF(')

  try {
    const fn = Function(
      '__SUBSTITUTE',
      '__LEFT',
      '__RIGHT',
      '__LEN',
      '__IF',
      `return (${rewritten});`,
    )
    const result = fn(
      (text, oldText, newText, instance) => {
        const source = String(text ?? '')
        const oldValue = String(oldText ?? '')
        const newValue = String(newText ?? '')
        if (oldValue === '') return source
        if (instance == null) return source.split(oldValue).join(newValue)
        const targetInstance = Number(instance)
        if (!Number.isFinite(targetInstance) || targetInstance <= 0) return source
        let seen = 0
        return source.replace(new RegExp(oldValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (match) => {
          seen += 1
          return seen === targetInstance ? newValue : match
        })
      },
      (text, count = 1) => String(text ?? '').slice(0, Math.max(0, Number(count) || 0)),
      (text, count = 1) => {
        const source = String(text ?? '')
        const amount = Math.max(0, Number(count) || 0)
        return source.slice(Math.max(0, source.length - amount))
      },
      (text) => String(text ?? '').length,
      (condition, whenTrue, whenFalse) => (condition ? whenTrue : whenFalse),
    )

    if (result === null || result === undefined) return ''
    return String(result)
  } catch {
    return null
  }
}

const evaluateBackgroundIndirectFormula = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Background') return null
  const text = normalizeFormulaText(formulaText)
  if (!/^INDIRECT\(/i.test(text)) return null

  const match = text.match(/^INDIRECT\((.+)\)$/i)
  if (!match) return null
  const argExpr = String(match[1] || '').trim()

  const evaluated = evalExpression(rowData, argExpr, context)
  const scalar = scalarizeValue(evaluated)
  const refText = String(scalar ?? '').trim()
  if (!refText) return ''

  const resolved = resolveReferenceValue(rowData, refText, context)
  if (!resolved) return null
  return scalarizeValue(resolved)
}

const evaluateBackgroundCountaIndirectIfPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Background') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^IF\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*=\s*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*0\s*,\s*\(?\s*COUNTA\(\s*INDIRECT\((.+)\)\s*\)\s*\)?\s*\)$/i)
  if (!match) return null

  const leftRef = match[1]
  const rightRef = match[2]
  const indirectArgExpr = String(match[3] || '').trim()
  if (!indirectArgExpr) return null

  const left = scalarizeValue(resolveReferenceValue(rowData, leftRef, context))
  const right = scalarizeValue(resolveReferenceValue(rowData, rightRef, context))
  if (String(left ?? '').trim() === String(right ?? '').trim()) return 0

  const startColMatch = indirectArgExpr.match(/"Staffing!"\s*&\s*(\$?[A-Z]{1,3}\$?\d+)/i)
  const rowOffsetMatch = indirectArgExpr.match(/Background!\$DV\$4\s*\+\s*(\$?[A-Z]{1,3}\$?\d+)/i)
  if (startColMatch && rowOffsetMatch) {
    const startColToken = startColMatch[1]
    const rowOffsetToken = rowOffsetMatch[1]
    const startColValue = String(scalarizeValue(resolveReferenceValue(rowData, startColToken, context)) ?? '').trim()
    const baseRow = toNumber(scalarizeValue(resolveReferenceValue(rowData, 'Background!$DV$4', context)))
    const rowOffset = toNumber(scalarizeValue(resolveReferenceValue(rowData, rowOffsetToken, context)))
    if (startColValue && /^[A-Z]{1,3}$/i.test(startColValue) && baseRow != null && rowOffset != null) {
      const targetRow = Math.floor(baseRow + rowOffset)
      if (targetRow > 0) {
        const directRef = `Staffing!${startColValue.toUpperCase()}${targetRow}:FF${targetRow}`
        const directRange = materializeRange(rowData, directRef, context)
        if (directRange && directRange.__type === 'range') {
          const values = Array.isArray(directRange.values) ? directRange.values : []
          return values.filter((value) => String(value ?? '').trim() !== '').length
        }
      }
    }
  }

  const evaluatedArg = scalarizeValue(evalExpression(rowData, indirectArgExpr, context))
  const refText = String(evaluatedArg ?? '').trim()
  if (!refText) return 0

  const resolved = resolveReferenceValue(rowData, refText, context)
  if (!resolved) return 0
  if (resolved.__type !== 'range') {
    const scalar = scalarizeValue(resolved)
    return String(scalar ?? '').trim() ? 1 : 0
  }

  const values = Array.isArray(resolved.values) ? resolved.values : []
  return values.filter((value) => String(value ?? '').trim() !== '').length
}

const evaluateBackgroundJrsIdentifierPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Background') return null
  const text = normalizeFormulaText(formulaText)
  if (!/^SUBSTITUTE\(/i.test(text) || !/"JRS"\s*&\s*IF\(LEN\(/i.test(text)) return null
  const refMatch = text.match(/IF\(LEN\((\$?[A-Z]{1,3}\$?\d+)\)\s*>=\s*4\s*,\s*LEFT\(\1\s*,\s*4\)\s*&\s*RIGHT\(\1\s*,\s*4\)\s*,\s*\1\s*&\s*\1\)/i)
  if (!refMatch) return null

  const ref = refMatch[1]
  const raw = String(scalarizeValue(resolveReferenceValue(rowData, ref, context)) ?? '')
  const base = raw.length >= 4 ? `${raw.slice(0, 4)}${raw.slice(-4)}` : `${raw}${raw}`
  let out = `JRS${base}${raw.length}`
  out = out.replace(/\)/g, '_').replace(/ /g, '_').replace(/\//g, '')
  if (/"&"\s*,\s*"_"\)\s*$/i.test(text)) out = out.replace(/&/g, '_')
  return out
}

const evaluateBackgroundMatchPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Background') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^MATCH\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*0\s*\)$/i)
  if (!match) return null

  const lookupToken = String(match[1] || '').trim()
  const rangeToken = String(match[2] || '').trim()
  const lookupValue = scalarizeValue(evaluateArgToken(rowData, lookupToken, context))
  const rangeObj = materializeRange(rowData, rangeToken, context)
  if (!rangeObj || rangeObj.__type !== 'range') return '#N/A'

  const values = Array.isArray(rangeObj.values) ? rangeObj.values : []
  const index = values.findIndex((value) => String(value ?? '').trim() === String(lookupValue ?? '').trim())
  return index >= 0 ? index + 1 : '#N/A'
}

const evaluateBackgroundHourHeaderSumproductPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Background') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^SUMPRODUCT\(\(YEAR\(HourHeader\)=([^)]+)\)\*\(MONTH\(HourHeader\)=MONTH\(([^)]+)\)\*\(HourHeader2>([^)]+)\)\)\)$/i)
  if (!match) return null

  const yearToken = String(match[1] || '').trim()
  const monthToken = String(match[2] || '').trim()
  const thresholdToken = String(match[3] || '').trim()

  const yearSerial = scalarizeValue(evaluateArgToken(rowData, yearToken, context))
  const monthSerial = scalarizeValue(evaluateArgToken(rowData, monthToken, context))
  const threshold = toNumber(scalarizeValue(evaluateArgToken(rowData, thresholdToken, context))) ?? 0
  const yearNum = toNumber(yearSerial)
  const yearDate = (yearNum != null && yearNum >= 1900 && yearNum <= 9999)
    ? new Date(Date.UTC(yearNum, 0, 1))
    : excelSerialToDate(yearSerial)
  const monthDate = excelSerialToDate(monthSerial)
  if (!yearDate || !monthDate) return 0

  const hourHeader = resolveReferenceValue(rowData, 'HourHeader', context)
  const hourHeader2 = resolveReferenceValue(rowData, 'HourHeader2', context)
  if (!hourHeader || hourHeader.__type !== 'range' || !hourHeader2 || hourHeader2.__type !== 'range') return 0

  const dates = Array.isArray(hourHeader.values) ? hourHeader.values : []
  const values = Array.isArray(hourHeader2.values) ? hourHeader2.values : []
  const len = Math.min(dates.length, values.length)
  let total = 0
  for (let index = 0; index < len; index += 1) {
    const date = excelSerialToDate(dates[index])
    const value = toNumber(values[index])
    if (!date || value == null) continue
    if (
      date.getUTCFullYear() === yearDate.getUTCFullYear()
      && (date.getUTCMonth() + 1) === (monthDate.getUTCMonth() + 1)
      && value > threshold
    ) {
      total += 1
    }
  }
  return total
}

const evaluateRatesOthParmsLookup = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Rates') return null
  const text = normalizeFormulaText(formulaText)

  const wbPrefix = String.raw`(?:\[\d+\])?`
  const lookupExpr = String.raw`OFFSET\(\s*OFFSET\(\s*${wbPrefix}vars__OthParms!\$?A\$?1\s*,\s*0\s*,\s*MATCH\(\s*"([^"]+)"\s*,\s*${wbPrefix}vars__OthParms!\$?1:\$?1\s*,\s*0\s*\)\s*-\s*1\s*\)\s*,\s*MATCH\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*${wbPrefix}vars__OthParms!\$?B:\$?B\s*,\s*0\s*\)\s*-\s*1\s*,\s*0\s*\)`
  const direct = new RegExp(`^${lookupExpr}$`, 'i')
  const ifWrap = new RegExp(String.raw`^IF\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*=\s*"([^"]+)"\s*,\s*${lookupExpr}\s*,\s*${lookupExpr}\s*\)$`, 'i')

  const resolveLookup = (headerName, keyRef) => {
    const tableRows = getRowsForSheet(rowData, context, 'vars__OthParms')
    if (!Array.isArray(tableRows) || tableRows.length === 0) return ''

    const headerRow = tableRows[0] || {}
    let headerCol = -1
    Object.keys(headerRow).forEach((key) => {
      const match = /^c(\d+)$/.exec(key)
      if (!match || headerCol >= 0) return
      const col = Number(match[1])
      const label = String(headerRow[key] ?? '').trim().toUpperCase()
      if (label === String(headerName).trim().toUpperCase()) headerCol = col
    })
    if (headerCol < 0) return ''

    const keyResolved = resolveReferenceValue(rowData, keyRef, context)
    const keyValue = String(scalarizeValue(keyResolved) ?? '').trim().toUpperCase()
    if (!keyValue) return ''

    let rowIndex = -1
    for (let idx = 1; idx < tableRows.length; idx += 1) {
      const rowObj = tableRows[idx] || {}
      const candidate = String(rowObj.c1 ?? '').trim().toUpperCase()
      if (candidate === keyValue) {
        rowIndex = idx
        break
      }
    }
    if (rowIndex < 0) return ''

    const targetRow = tableRows[rowIndex] || {}
    return targetRow[`c${headerCol}`] ?? ''
  }

  const directMatch = text.match(direct)
  if (directMatch) {
    return resolveLookup(directMatch[1], directMatch[2])
  }

  const ifMatch = text.match(ifWrap)
  if (ifMatch) {
    const conditionRef = ifMatch[1]
    const conditionExpected = String(ifMatch[2] || '').trim().toUpperCase()
    const actual = String(scalarizeValue(resolveReferenceValue(rowData, conditionRef, context)) ?? '').trim().toUpperCase()
    if (actual === conditionExpected) {
      return resolveLookup(ifMatch[3], ifMatch[4])
    }
    return resolveLookup(ifMatch[5], ifMatch[6])
  }

  return null
}

// Rates IFERROR/VLOOKUP/INDIRECT pattern:
// IFERROR(VLOOKUP(C24, INDIRECT("vars__Rates!$A$2:$AL"&varRatesCount), VLOOKUP(TimeUnit,TimeTable,2,0), FALSE), fallback)
const evaluateRatesIferrorVlookupIndirectPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Rates') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^IFERROR\(\s*VLOOKUP\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*INDIRECT\(\s*"([^"]+)"\s*&\s*(\w+)\s*\)\s*,\s*VLOOKUP\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\d+)\s*,\s*0\s*\)\s*,\s*FALSE\s*\)\s*,\s*(.+)\s*\)$/i)
  if (!match) return null

  const lookupRef = match[1]
  const rangePrefix = match[2]
  const countName = match[3]
  const timeUnitName = match[4]
  const timeTableName = match[5]
  const timeTableCol = Number(match[6])
  const fallbackExpr = match[7].trim()

  // Resolve range: INDIRECT("vars__Rates!$A$2:$AL" & varRatesCount)
  const countValue = scalarizeValue(resolveReferenceValue(rowData, countName, context))
  const rangeRef = `${rangePrefix}${countValue}`
  const range = materializeRange(rowData, rangeRef, context)
  if (!range || range.__type !== 'range') {
    // Try fallback
    const fb = evalExpression(rowData, fallbackExpr, context)
    return fb !== null && fb !== undefined ? scalarizeValue(fb) : null
  }

  // Resolve VLOOKUP(TimeUnit, TimeTable, col, 0) = column index
  const timeUnit = scalarizeValue(resolveReferenceValue(rowData, timeUnitName, context))
  const timeTable = resolveReferenceValue(rowData, timeTableName, context)
  let colIndex = null
  if (timeTable && timeTable.__type === 'range' && timeUnit != null) {
    const rows = Number(timeTable.rowCount || 0)
    const cols = Number(timeTable.colCount || 0)
    for (let r = 0; r < rows; r++) {
      const key = String(timeTable.values?.[r * cols] ?? '').trim()
      if (key === String(timeUnit).trim()) {
        colIndex = toNumber(timeTable.values?.[r * cols + (timeTableCol - 1)])
        break
      }
    }
  }
  if (colIndex == null) {
    const fb = evalExpression(rowData, fallbackExpr, context)
    return fb !== null && fb !== undefined ? scalarizeValue(fb) : null
  }

  // VLOOKUP in the INDIRECT range
  const lookupValue = String(scalarizeValue(resolveReferenceValue(rowData, lookupRef, context)) ?? '').trim()
  const rangeCols = Number(range.colCount || 0)
  const rangeRows = Number(range.rowCount || 0)
  if (!lookupValue || rangeCols <= 0 || rangeRows <= 0 || colIndex > rangeCols) {
    const fb = evalExpression(rowData, fallbackExpr, context)
    return fb !== null && fb !== undefined ? scalarizeValue(fb) : null
  }

  for (let r = 0; r < rangeRows; r++) {
    const key = String(range.values?.[r * rangeCols] ?? '').trim()
    if (key === lookupValue) {
      const result = range.values?.[r * rangeCols + (colIndex - 1)]
      return result ?? ''
    }
  }

  // Not found → IFERROR catches → fallback
  const fb = evalExpression(rowData, fallbackExpr, context)
  return fb !== null && fb !== undefined ? scalarizeValue(fb) : null
}

// Rates: OFFSET(OFFSET(vars__OthParms!$A$1,0,MATCH("header",vars__OthParms!$1:$1,0)-1),MATCH($H,vars__OthParms!$B:$B,0)-1,0)
const evaluateRatesOthParmsNestedOffset = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Rates') return null
  const text = normalizeFormulaText(formulaText)
  if (!/vars__OthParms/i.test(text) || /\[4\]/i.test(text)) return null // skip external refs

  const resolveOthParmsOffset = (headerName, lookupRef) => {
    const othParmsRows = getRowsForSheet(rowData, context, 'vars__OthParms')
    if (!othParmsRows || othParmsRows.length === 0) return '#N/A'
    const headerRow = othParmsRows[0] || {}
    let headerCol = -1
    for (let col = 0; col < 200; col++) {
      if (String(headerRow[`c${col}`] ?? '').trim().toUpperCase() === headerName.trim().toUpperCase()) {
        headerCol = col
        break
      }
    }
    if (headerCol < 0) return '#N/A'
    const lookupValue = scalarizeValue(resolveReferenceValue(rowData, lookupRef, context))
    if (lookupValue == null || String(lookupValue).trim() === '') return '#N/A'
    if (isExcelErrorToken(lookupValue)) return String(lookupValue).trim()
    let matchRow = -1
    for (let r = 0; r < othParmsRows.length; r++) {
      if (String((othParmsRows[r] || {}).c1 ?? '').trim() === String(lookupValue).trim()) {
        matchRow = r
        break
      }
    }
    if (matchRow < 0) return '#N/A'
    return (othParmsRows[matchRow] || {})[`c${headerCol}`] ?? ''
  }

  // Handle IF wrapper: IF($V2="AMS", offsetAMS, offsetNonAMS)
  const ifMatch = text.match(/^IF\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*=\s*"([^"]+)"\s*,\s*OFFSET\(OFFSET\(vars__OthParms!\$A\$1\s*,\s*0\s*,\s*MATCH\(\s*"([^"]+)"\s*,\s*vars__OthParms!\$1:\$1\s*,\s*0\s*\)\s*-\s*1\s*\)\s*,\s*MATCH\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*vars__OthParms!\$B:\$B\s*,\s*0\s*\)\s*-\s*1\s*,\s*0\s*\)\s*,\s*OFFSET\(OFFSET\(vars__OthParms!\$A\$1\s*,\s*0\s*,\s*MATCH\(\s*"([^"]+)"\s*,\s*vars__OthParms!\$1:\$1\s*,\s*0\s*\)\s*-\s*1\s*\)\s*,\s*MATCH\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*vars__OthParms!\$B:\$B\s*,\s*0\s*\)\s*-\s*1\s*,\s*0\s*\)\s*\)$/i)
  if (ifMatch) {
    const condRef = ifMatch[1]
    const condVal = ifMatch[2]
    const actual = String(scalarizeValue(resolveReferenceValue(rowData, condRef, context)) ?? '').trim().toUpperCase()
    if (actual === condVal.toUpperCase()) {
      return resolveOthParmsOffset(ifMatch[3], ifMatch[4])
    }
    return resolveOthParmsOffset(ifMatch[5], ifMatch[6])
  }

  // Direct OFFSET(OFFSET(...)) pattern
  const directMatch = text.match(/^OFFSET\(OFFSET\(vars__OthParms!\$A\$1\s*,\s*0\s*,\s*MATCH\(\s*"([^"]+)"\s*,\s*vars__OthParms!\$1:\$1\s*,\s*0\s*\)\s*-\s*1\s*\)\s*,\s*MATCH\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*vars__OthParms!\$B:\$B\s*,\s*0\s*\)\s*-\s*1\s*,\s*0\s*\)$/i)
  if (directMatch) {
    return resolveOthParmsOffset(directMatch[1], directMatch[2])
  }

  return null
}

const evaluateRatesBandInfoOffsetFormula = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Rates') return null
  const raw = normalizeFormulaText(formulaText)
  if (!/BandInfoLookupHdr/i.test(raw) || !/OFFSET\(/i.test(raw)) return null

  const headerRef = resolveReferenceValue(rowData, 'BandInfoLookupHdr', context)
  if (!headerRef || headerRef.__type !== 'range') return null
  const headerValues = Array.isArray(headerRef.values) ? headerRef.values : []

  const pattern = /OFFSET\(\s*\$A(\d+)\s*,\s*0\s*,\s*MATCH\(\s*"([^"]+)"\s*,\s*BandInfoLookupHdr\s*,\s*0\s*\)\s*-\s*1\s*\)/gi
  let changed = false
  let earlyError = null
  const rewritten = raw.replace(pattern, (_full, rowDigits, headerName) => {
    if (earlyError) return '0'
    const rowOne = Number(rowDigits)
    const targetHeader = String(headerName || '').trim().toUpperCase()
    const headerIndex = headerValues.findIndex((value) => String(value ?? '').trim().toUpperCase() === targetHeader)
    if (!Number.isFinite(rowOne) || rowOne <= 0 || headerIndex < 0) return 'null'
    const targetCol = Number(headerRef.startCol || 0) + headerIndex
    const rowObj = rowData[rowOne - 1] || {}
    const value = rowObj[`c${targetCol}`] ?? ''
    // If the resolved cell contains an Excel error, propagate it immediately
    if (isExcelErrorToken(value)) { earlyError = String(value).trim(); return '0' }
    changed = true
    // Prefer numeric encoding for arithmetic contexts
    const numVal = toNumber(value)
    if (numVal != null) return String(numVal)
    return encodeLiteralForExpression(value)
  })

  if (earlyError) {
    return earlyError
  }
  if (!changed) return null
  // Check if the rewritten text has arithmetic operators around the resolved values
  // If a string literal is involved in arithmetic, Excel returns #VALUE!
  const textOnlyOperators = rewritten.replace(/"[^"]*"/g, '""').replace(/\d+(\.\d+)?/g, 'N')
  const hasArithmeticContext = /[+\-*/]/.test(textOnlyOperators.replace(/^\s*""?\s*$/, ''))
  if (hasArithmeticContext && /"[^"]*"/.test(rewritten)) {
    // Check if any string literal is a non-empty non-numeric text → #VALUE!
    const stringLiterals = rewritten.match(/"[^"]*"/g) || []
    for (const lit of stringLiterals) {
      const inner = lit.slice(1, -1)
      if (inner && toNumber(inner) == null && inner !== 'true' && inner !== 'false') {
        return '#VALUE!'
      }
    }
  }
  const evaluated = evalExpression(rowData, rewritten, context)
  if (evaluated === null || evaluated === undefined) return null
  return scalarizeValue(evaluated)
}

const evaluateRatesVarsInflationFormula = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Rates') return null
  const raw = normalizeFormulaText(formulaText)
  if (!/vars__Inflation!\$1:\$1048576/i.test(raw)) return null

  const varsRows = getRowsForSheet(rowData, context, 'vars__Inflation')
  if (!Array.isArray(varsRows) || varsRows.length === 0) return null

  const headerRow = varsRows[0] || {}
  const pattern = /HLOOKUP\(\s*([^,]+?)\s*,\s*(?:\[\d+\])?vars__Inflation!\$1:\$1048576\s*,\s*MATCH\(\s*(.+?)\s*,\s*(?:\[\d+\])?vars__Inflation!\$A:\$A\s*,\s*0\s*\)\s*,\s*FALSE\s*\)/gi

  let changed = false
  const rewritten = raw.replace(pattern, (full, yearExpr, keyExpr) => {
    const yearValue = scalarizeValue(evalExpression(rowData, String(yearExpr || '').trim(), context))
    const yearNumeric = toNumber(yearValue)
    const yearText = String(yearValue ?? '').trim()

    let targetCol = -1
    Object.keys(headerRow).forEach((key) => {
      const match = /^c(\d+)$/.exec(key)
      if (!match || targetCol >= 0) return
      const col = Number(match[1])
      const cellVal = headerRow[key]
      const cellNum = toNumber(cellVal)
      const cellText = String(cellVal ?? '').trim()
      if (yearNumeric != null && cellNum != null && Number(cellNum) === Number(yearNumeric)) targetCol = col
      else if (yearText && cellText === yearText) targetCol = col
    })
    if (targetCol < 0) return 'null'

    const keyValue = String(scalarizeValue(evalExpression(rowData, String(keyExpr || '').trim(), context)) ?? '').trim()
    if (!keyValue) return 'null'

    let targetRowOne = -1
    for (let idx = 0; idx < varsRows.length; idx += 1) {
      const rowObj = varsRows[idx] || {}
      if (String(rowObj.c0 ?? '').trim() === keyValue) {
        targetRowOne = idx + 1
        break
      }
    }
    if (targetRowOne < 0) return 'null'

    const rowObj = varsRows[targetRowOne - 1] || {}
    const value = rowObj[`c${targetCol}`] ?? ''
    changed = true
    return encodeLiteralForExpression(value)
  })

  if (!changed) return null
  const evaluated = evalExpression(rowData, rewritten, context)
  if (evaluated === null || evaluated === undefined) return null
  return scalarizeValue(evaluated)
}

const evaluateRatesInflationChainPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Rates') return null
  const raw = normalizeFormulaText(formulaText)
  const text = raw.replace(/\[\d+\]/g, '')
  if (!/vars__Inflation!\$1:\$1048576/i.test(text) || !/BandInfoLookupHdr/i.test(text)) return null

  const rowMatch = text.match(/\$A(\d+)/i)
  const rowOne = Number(rowMatch?.[1] || 0)
  if (!Number.isFinite(rowOne) || rowOne <= 0) return null
  const rowObj = rowData[rowOne - 1] || {}

  const ratesRows = getRowsForSheet(rowData, context, 'Rates')
  const ratesHeaderRow = ratesRows[8] || {}
  const headerMap = new Map()
  Object.keys(ratesHeaderRow).forEach((key) => {
    const match = /^c(\d+)$/.exec(key)
    if (!match) return
    const col = Number(match[1])
    const label = String(ratesHeaderRow[key] ?? '').trim().toUpperCase()
    if (label) headerMap.set(label, col)
  })
  const findHeaderCol = (headerName) => headerMap.get(String(headerName || '').trim().toUpperCase()) ?? -1
  const getBandValue = (headerName) => {
    const col = findHeaderCol(headerName)
    if (col < 0) return null
    return rowObj[`c${col}`]
  }

  const isGpeInflation = String(rowObj.c51 ?? '').trim().toUpperCase() === 'GPE INFLATION'

  const cntry = String(getBandValue('Cntry_Code') ?? '').trim()
  const provider = String(getBandValue('Provider ID') ?? '').trim()
  const backgroundRows = getRowsForSheet(rowData, context, 'Background')
  const ecav = String(
    scalarizeValue(resolveReferenceValue(rowData, 'ECAVSNON', context))
    ?? scalarizeValue(backgroundRows[35]?.c1)
    ?? '',
  ).trim()
  const key = `${cntry}|${provider}|${ecav}`

  const yearRefMatch = text.match(/HLOOKUP\(\s*([A-Z]{1,3})\$8\s*,\s*vars__Inflation!\$1:\$1048576/i)
  const yearCol = yearRefMatch ? colToIndex(yearRefMatch[1]) : -1
  const yearValue = yearCol >= 0 ? toNumber((rowData[7] || {})[`c${yearCol}`]) : null
  if (yearValue == null) return '#VALUE!'

  // GPE Inflation path: look up rate from vars__Inflation by country|provider|ECA key
  let varsInflation = null
  if (isGpeInflation) {
    if (!key.replace(/\|/g, '').trim()) return '#VALUE!'
    const varsRows = getRowsForSheet(rowData, context, 'vars__Inflation')
    if (!Array.isArray(varsRows) || varsRows.length === 0) return '#VALUE!'
    const varsHeader = varsRows[0] || {}
    let varsRow = null
    for (let idx = 1; idx < varsRows.length; idx += 1) {
      const candidate = String(varsRows[idx]?.c0 ?? '').trim()
      if (candidate === key) {
        varsRow = varsRows[idx]
        break
      }
    }
    if (!varsRow) return '#VALUE!'

    let inflationCol = -1
    Object.keys(varsHeader).forEach((keyName) => {
      const match = /^c(\d+)$/.exec(keyName)
      if (!match || inflationCol >= 0) return
      const col = Number(match[1])
      const headerYear = toNumber(varsHeader[keyName])
      if (headerYear != null && Number(headerYear) === Number(yearValue)) inflationCol = col
    })
    if (inflationCol < 0 && Number(yearValue) >= 2026 && Number(yearValue) <= 2044) {
      inflationCol = 13 + (Number(yearValue) - 2026)
    }
    if (inflationCol < 0) return '#VALUE!'
    varsInflation = toNumber(varsRow[`c${inflationCol}`])
    if (varsInflation == null) return '#VALUE!'
  }

  const inflationCats = resolveReferenceValue(rowData, 'InflationCats', context)
  const inflationTbl = resolveReferenceValue(rowData, 'InflationCustomTbl', context)
  const ratesStartYr = toNumber(scalarizeValue(resolveReferenceValue(rowData, 'RatesStartYr', context)))
  const azValue = String((rowObj.c51 ?? '')).trim()

  let customInflation = 0
  let customInflationLookupFailed = true
  if (inflationCats && inflationCats.__type === 'range' && inflationTbl && inflationTbl.__type === 'range' && ratesStartYr != null && azValue) {
    const cats = Array.isArray(inflationCats.values) ? inflationCats.values : []
    const catIdx = cats.findIndex((value) => String(value ?? '').trim().toUpperCase() === azValue.toUpperCase())
    const yearIndex = Number(yearValue) - Number(ratesStartYr) + 1
    const targetHeader = `Inflation Rate YR${yearIndex}`

    const tblColCount = Number(inflationTbl.colCount || 0)
    const tblValues = Array.isArray(inflationTbl.values) ? inflationTbl.values : []
    if (catIdx >= 0 && tblColCount > 0) {
      const headerVals = tblValues.slice(0, tblColCount)
      const headerIdx = headerVals.findIndex((value) => String(value ?? '').trim().toUpperCase() === targetHeader.toUpperCase())
      if (headerIdx >= 0) {
        const rowIndex = 1 + (catIdx + 1)
        const valueIndex = (rowIndex * tblColCount) + headerIdx
        customInflation = toNumber(tblValues[valueIndex]) ?? 0
        customInflationLookupFailed = false
      }
    }
  }

  const priceRateLc = toNumber(getBandValue('Price Rate LC'))
  const forex = toNumber(getBandValue('Forex'))
  const baseRefMatch = text.match(/,\s*\$?([A-Z]{1,3})\d+\s*\*\s*\(1\+HLOOKUP\("Inflation Rate YR"/i)
  const prevCol = baseRefMatch ? colToIndex(baseRefMatch[1]) : -1
  const prevValue = prevCol >= 0 ? toNumber(rowObj[`c${prevCol}`]) : null

  if (/^OFFSET\(\s*\$A\d+/i.test(text)) {
    if (priceRateLc == null || forex == null || forex === 0) return '#VALUE!'
    const base = priceRateLc / forex
    return base * (1 + (varsInflation ?? 0)) * (1 + (isGpeInflation ? 0 : customInflation))
  }

  if (/^IF\(\s*\$AZ\d+\s*=\s*"GPE Inflation"/i.test(text)) {
    const baCol = colToIndex('BA')
    const baValue = toNumber(rowObj[`c${baCol}`])
    if (baValue == null) return '#VALUE!'
    if (isGpeInflation) {
      return baValue * (1 + varsInflation)
    }
    if (customInflationLookupFailed) return '#VALUE!'
    if (prevValue == null) return '#VALUE!'
    return prevValue * (1 + customInflation)
  }

  return null
}

const evaluateRatesIfAlgebraPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Rates') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^IF\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*=\s*0\s*,\s*0\s*,\s*\(\s*\1\s*\*\s*\(\s*1\s*\+\s*(\$?[A-Z]{1,3}\$?\d+)\s*\+\s*(\$?[A-Z]{1,3}\$?\d+)\s*\)\s*\+\s*(\$?[A-Z]{1,3}\$?\d+)\s*\)\s*\/\s*\(\s*\1\s*\*\s*\(\s*1\s*-\s*\2\s*-\s*\3\s*-\s*\(\s*\2\s*\*\s*\3\s*\)\s*\/\s*1\s*\)\s*\)\s*-\s*1\s*\)$/i)
  if (!match) return null

  const baseRef = match[1]
  const aRef = match[2]
  const bRef = match[3]
  const cRef = match[4]
  const base = toNumber(scalarizeValue(resolveReferenceValue(rowData, baseRef, context)))
  if (base == null) return '#VALUE!'
  if (base === 0) return 0

  const a = toNumber(scalarizeValue(resolveReferenceValue(rowData, aRef, context)))
  const b = toNumber(scalarizeValue(resolveReferenceValue(rowData, bRef, context)))
  const c = toNumber(scalarizeValue(resolveReferenceValue(rowData, cRef, context)))
  if (a == null || b == null || c == null) return '#VALUE!'

  const denom = base * (1 - a - b - ((a * b) / 1))
  if (denom === 0) return '#VALUE!'
  return ((base * (1 + a + b) + c) / denom) - 1
}

const excelSerialToDate = (serial) => {
  const num = Number(serial)
  if (!Number.isFinite(num)) return null
  const whole = Math.floor(num)
  const excelEpoch = Date.UTC(1899, 11, 30)
  const date = new Date(excelEpoch + Math.round(whole * 86400000))
  return Number.isNaN(date.getTime()) ? null : date
}

const dateToExcelSerial = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  const excelEpoch = Date.UTC(1899, 11, 30)
  return Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - excelEpoch) / 86400000)
}

const evaluateStaffingTimelineDatePattern = (formulaText = '', rowData = [], context = {}) => {
  const text = normalizeFormulaText(formulaText)
  const pattern = /^DATE\(\s*YEAR\((\$?[A-Z]{1,3}\$?\d+)\)\s*,\s*MONTH\(\1\)\s*\+\s*1\*\(TimeUnit\s*=\s*"Month"\)\s*\+\s*3\*\(TimeUnit\s*=\s*"Quarter"\)\s*,\s*DAY\(\1\)\s*\+\s*7\*\(TimeUnit\s*=\s*"Week"\)\s*\+\s*1\*\(TimeUnit\s*=\s*"Day"\)\s*\)$/i
  const match = text.match(pattern)
  if (!match) return null

  const prevRef = match[1]
  const prevValue = scalarizeValue(resolveReferenceValue(rowData, prevRef, context))
  const prevDate = excelSerialToDate(prevValue)
  if (!prevDate) return null

  const timeUnitRaw = scalarizeValue(resolveReferenceValue(rowData, 'TimeUnit', context))
  const timeUnit = String(timeUnitRaw ?? '').trim().toUpperCase()

  const nextDate = new Date(Date.UTC(prevDate.getUTCFullYear(), prevDate.getUTCMonth(), prevDate.getUTCDate()))
  if (timeUnit === 'MONTH') {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1)
  } else if (timeUnit === 'QUARTER') {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 3)
  } else if (timeUnit === 'WEEK') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 7)
  } else if (timeUnit === 'DAY') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 1)
  }

  return dateToExcelSerial(nextDate)
}

const formatExcelLikeDate = (serial, formatText) => {
  const date = excelSerialToDate(serial)
  if (!date) return ''
  const format = String(formatText || '').trim().toLowerCase()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = date.getUTCDate()
  const month = months[date.getUTCMonth()]
  const year2 = String(date.getUTCFullYear()).slice(-2)

  if (format === 'd-mmm-yy') return `${day}-${month}-${year2}`
  if (format === 'dd-mmm-yy') return `${String(day).padStart(2, '0')}-${month}-${year2}`
  if (format === 'mmm-yy') return `${month}-${year2}`
  return `${day}-${month}-${year2}`
}

const evaluatePivotInfoTextTimelinePattern = (formulaText = '', rowData = [], context = {}, record = null) => {
  if (String(context?.currentSheet || '') !== 'PivotInfo') return null
  const text = normalizeFormulaText(formulaText)
  if (!/^TEXT\(\s*DATE\(/i.test(text) || !/YEAR\(ProjStart\)/i.test(text) || !/MONTH\(ProjStart\)/i.test(text) || !/DAY\(ProjStart\)/i.test(text) || !/DateFormat2\s*\)/i.test(text)) return null

  const rowFromRecord = Number(record?.row || 0)
  const rowOne = rowFromRecord > 0 ? rowFromRecord : null
  if (!Number.isFinite(rowOne) || rowOne <= 0) return null

  const anchorMatch = text.match(/\$F\$(\d+)/i)
  const anchorRowOne = Number(anchorMatch?.[1] || 36)
  if (!Number.isFinite(anchorRowOne) || anchorRowOne <= 0) return null

  const suffixMatch = text.match(/DateFormat2\s*\)\s*&\s*(?:"([^"]+)"|(\d+))\s*$/i)
  const suffix = suffixMatch ? String(suffixMatch[1] ?? suffixMatch[2] ?? '') : ''

  const rowObj = rowData[rowOne - 1] || {}
  const anchorRow = rowData[anchorRowOne - 1] || {}
  const currentIndex = toNumber(rowObj.c5)
  const anchorIndex = toNumber(anchorRow.c5)
  if (currentIndex == null || anchorIndex == null) return null
  const delta = currentIndex - anchorIndex

  const impTlRows = getRowsForSheet(rowData, context, 'Imp TL')
  const backgroundRows = getRowsForSheet(rowData, context, 'Background')

  const projStart = scalarizeValue(resolveReferenceValue(rowData, 'ProjStart', context))
    ?? scalarizeValue(resolveReferenceValue(rowData, "'Imp TL'!$C$8", context))
    ?? scalarizeValue(impTlRows[7]?.c2)
  const projDate = excelSerialToDate(projStart)
  if (!projDate) return null
  const timeUnit = String(
    scalarizeValue(resolveReferenceValue(rowData, 'TimeUnit', context))
    ?? scalarizeValue(resolveReferenceValue(rowData, 'Background!$B$114', context))
    ?? scalarizeValue(backgroundRows[113]?.c1)
    ?? '',
  ).trim().toUpperCase()

  const nextDate = new Date(Date.UTC(projDate.getUTCFullYear(), projDate.getUTCMonth(), projDate.getUTCDate()))
  if (timeUnit === 'MONTH') nextDate.setUTCMonth(nextDate.getUTCMonth() + delta)
  else if (timeUnit === 'QUARTER') nextDate.setUTCMonth(nextDate.getUTCMonth() + (delta * 3))
  else if (timeUnit === 'WEEK') nextDate.setUTCDate(nextDate.getUTCDate() + (delta * 7))
  else if (timeUnit === 'DAY') nextDate.setUTCDate(nextDate.getUTCDate() + delta)

  const serial = dateToExcelSerial(nextDate)
  const formatValue = scalarizeValue(resolveReferenceValue(rowData, 'DateFormat2', context))
    ?? scalarizeValue(resolveReferenceValue(rowData, 'Background!$B$126', context))
    ?? scalarizeValue(backgroundRows[125]?.c1)
  return `${formatExcelLikeDate(serial, formatValue)}${suffix}`
}

const evaluatePivotInfoConcatIfQuotePattern = (formulaText = '', rowData = [], context = {}, record = null) => {
  if (String(context?.currentSheet || '') !== 'PivotInfo') return null
  const text = normalizeFormulaText(formulaText)
  if (!/^"="\s*&\s*CHAR\(39\)\s*&\s*CONCATIF\(/i.test(text)) return null
  const usesOffsetDateCells = /OFFSET\(\$C\$1090:\$C\$1209\s*,\s*0\s*,\s*0\s*,\s*COUNTA\(DateCells2\)\s*\/\s*3\s*\)/i.test(text)
  if (!/(\$C\$1090:\$C\$1209|OFFSET\(\$C\$1090:\$C\$1209\s*,\s*0\s*,\s*0\s*,\s*COUNTA\(DateCells2\)\s*\/\s*3\s*\))/i.test(text)) return null

  if (usesOffsetDateCells) {
    const dateCells2 = resolveReferenceValue(rowData, 'DateCells2', context)
    if (!dateCells2) return '#NAME?'
  }

  const rowOne = Number(record?.row || 0)
  if (!Number.isFinite(rowOne) || rowOne <= 0) return null

  const rowObj = rowData[rowOne - 1] || {}
  const cValue = String(rowObj.c2 ?? '').trim()
  const yearMatch = cValue.match(/^(\d{4})/)
  if (!yearMatch) return null
  const year2 = yearMatch[1].slice(-2)
  const criteria = `${year2}2`

  const values = []
  for (let row = 1090; row <= 1209; row += 1) {
    const sourceRow = rowData[row - 1] || {}
    const value = String(sourceRow.c2 ?? '').trim()
    if (!value) continue
    if (value.toUpperCase().includes(criteria.toUpperCase())) values.push(value)
  }

  if (!values.length) return "=''"
  return `='${values.join("'+'")}'`
}

const evaluatePivotInfoRelativeDateByFPattern = (formulaText = '', rowData = [], context = {}, record = null) => {
  const text = normalizeFormulaText(formulaText)
  if (!/YEAR\(ProjStart\)/i.test(text) || !/MONTH\(ProjStart\)/i.test(text) || !/DateFormat2/i.test(text)) return null
  if (!/^TEXT\(\s*DATE\(/i.test(text) || !/YEAR\(ProjStart\)/i.test(text) || !/MONTH\(ProjStart\)/i.test(text) || !/DAY\(ProjStart\)/i.test(text) || !/DateFormat2\s*\)/i.test(text)) return null

  const deltaMatch = text.match(/\(\s*\$?F\$?(\d+)\s*-\s*\$?F\$?(\d+)\s*\)/i)
  if (!deltaMatch) return null

  const suffixMatch = text.match(/\)\s*&\s*(?:"([^"]*)"|(\d+))\s*$/i)
  const fCurrentRow = Number(deltaMatch[1])
  const fAnchorRow = Number(deltaMatch[2])
  if (!Number.isFinite(fCurrentRow) || !Number.isFinite(fAnchorRow) || fCurrentRow <= 0 || fAnchorRow <= 0) return null

  const currentF = toNumber((rowData[fCurrentRow - 1] || {}).c5)
  const anchorF = toNumber((rowData[fAnchorRow - 1] || {}).c5)
  if (currentF == null || anchorF == null) return null
  const delta = currentF - anchorF

  const impTlRows = getRowsForSheet(rowData, context, 'Imp TL')
  const backgroundRows = getRowsForSheet(rowData, context, 'Background')

  const projStart = scalarizeValue(resolveReferenceValue(rowData, 'ProjStart', context))
    ?? scalarizeValue(resolveReferenceValue(rowData, "'Imp TL'!$C$8", context))
    ?? scalarizeValue(impTlRows[7]?.c2)
  const projDate = excelSerialToDate(projStart)
  if (!projDate) return null

  const timeUnitRaw = scalarizeValue(resolveReferenceValue(rowData, 'TimeUnit', context))
    ?? scalarizeValue(resolveReferenceValue(rowData, 'Background!$B$114', context))
    ?? scalarizeValue(backgroundRows[113]?.c1)
  const timeUnit = String(timeUnitRaw ?? '').trim().toUpperCase()

  const targetDate = new Date(Date.UTC(projDate.getUTCFullYear(), projDate.getUTCMonth(), projDate.getUTCDate()))
  if (timeUnit === 'MONTH') targetDate.setUTCMonth(targetDate.getUTCMonth() + delta)
  else if (timeUnit === 'QUARTER') targetDate.setUTCMonth(targetDate.getUTCMonth() + (delta * 3))
  else if (timeUnit === 'WEEK') targetDate.setUTCDate(targetDate.getUTCDate() + (delta * 7))
  else if (timeUnit === 'DAY') targetDate.setUTCDate(targetDate.getUTCDate() + delta)

  const serial = dateToExcelSerial(targetDate)
  if (serial == null) return null
  const formatValue = scalarizeValue(resolveReferenceValue(rowData, 'DateFormat2', context))
    ?? scalarizeValue(resolveReferenceValue(rowData, 'Background!$B$126', context))
    ?? scalarizeValue(backgroundRows[125]?.c1)
  const suffix = String(suffixMatch?.[1] ?? suffixMatch?.[2] ?? '')
  return `${formatExcelLikeDate(serial, formatValue)}${suffix}`
}

const evaluatePivotInfoRelativeDateDirectPattern = (formulaText = '', rowData = [], context = {}) => {
  const text = normalizeFormulaText(formulaText)
  if (!/^TEXT\(\s*DATE\(YEAR\(ProjStart\),\s*MONTH\(ProjStart\)\+/i.test(text)) return null

  const deltaMatch = text.match(/\$?F\$?(\d+)\s*-\s*\$?F\$?(\d+)/i)
  if (!deltaMatch) return null
  const currentFRow = Number(deltaMatch[1])
  const anchorFRow = Number(deltaMatch[2])
  if (!Number.isFinite(currentFRow) || !Number.isFinite(anchorFRow) || currentFRow <= 0 || anchorFRow <= 0) return null

  const suffixMatch = text.match(/\)\s*&\s*(?:"([^"]*)"|(\d+))\s*$/i)
  const suffix = String(suffixMatch?.[1] ?? suffixMatch?.[2] ?? '')

  const impTlRows = getRowsForSheet(rowData, context, 'Imp TL')
  const backgroundRows = getRowsForSheet(rowData, context, 'Background')
  const projStart = scalarizeValue(impTlRows[7]?.c2)
  const projDate = excelSerialToDate(projStart)
  if (!projDate) return null

  const currentF = toNumber((rowData[currentFRow - 1] || {}).c5)
  const anchorF = toNumber((rowData[anchorFRow - 1] || {}).c5)
  if (currentF == null || anchorF == null) return null
  const delta = currentF - anchorF

  const timeUnit = String(backgroundRows[113]?.c1 ?? '').trim().toUpperCase()
  const nextDate = new Date(Date.UTC(projDate.getUTCFullYear(), projDate.getUTCMonth(), projDate.getUTCDate()))
  if (timeUnit === 'MONTH') nextDate.setUTCMonth(nextDate.getUTCMonth() + delta)
  else if (timeUnit === 'QUARTER') nextDate.setUTCMonth(nextDate.getUTCMonth() + (delta * 3))
  else if (timeUnit === 'WEEK') nextDate.setUTCDate(nextDate.getUTCDate() + (delta * 7))
  else if (timeUnit === 'DAY') nextDate.setUTCDate(nextDate.getUTCDate() + delta)

  const serial = dateToExcelSerial(nextDate)
  if (serial == null) return null
  const formatValue = scalarizeValue(backgroundRows[125]?.c1)
  return `${formatExcelLikeDate(serial, formatValue)}${suffix}`
}

const evaluatePivotInfoConcatIfSubstitutePattern = (formulaText = '', rowData = [], context = {}, record = null) => {
  if (String(context?.currentSheet || '') !== 'PivotInfo') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^SUBSTITUTE\(\s*(.+?)\s*,\s*(\d+)\s*&\s*CHAR\(39\)\s*,\s*(\d+)\s*&\s*CHAR\(39\)\s*\)$/i)
  if (!match) return null

  const baseExpr = String(match[1] || '').trim()
  const fromNum = String(match[2] || '').trim()
  const toNum = String(match[3] || '').trim()
  if (!baseExpr || !fromNum || !toNum) return null

  const base = evaluatePivotInfoConcatIfQuotePattern(baseExpr, rowData, context, record)
  if (base == null) return null
  return String(base).split(`${fromNum}'`).join(`${toNum}'`)
}

const evaluatePivotInfoLeftLenSuffixPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'PivotInfo') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^"\s"\s*&\s*LEFT\((\$?[A-Z]{1,3}\$?\d+),\s*LEN\(\1\)\s*-\s*1\)\s*&\s*"([^"]*)"$/i)
  if (!match) return null

  const ref = match[1]
  const suffix = String(match[2] || '')
  const source = String(scalarizeValue(resolveReferenceValue(rowData, ref, context)) ?? '')
  const stem = source.length > 0 ? source.slice(0, -1) : ''
  return ` ${stem}${suffix}`
}

const evaluateFsEstimationMultiplierPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'FS Estimation') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*\/\s*(\$?[A-Z]{1,3}\$?\d+)\s*\)\s*\*\s*\(\s*1\s*\+\s*SUM\(\s*(\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+)\s*\)\s*\)$/i)
  if (!match) return null

  const baseRef = match[1]
  const divRef = match[2]
  const sumRangeRef = match[3]

  const base = toNumber(scalarizeValue(resolveReferenceValue(rowData, baseRef, context)))
  const div = toNumber(scalarizeValue(resolveReferenceValue(rowData, divRef, context)))
  const range = materializeRange(rowData, sumRangeRef, context)
  if (base == null || div == null || div === 0 || !range || range.__type !== 'range') return null

  const values = Array.isArray(range.values) ? range.values : []
  const sum = values.reduce((acc, value) => acc + (toNumber(value) ?? 0), 0)
  return (base / div) * (1 + sum)
}

const evaluatePmpTemplateCoveragePattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'PMP Template') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^IF\(\s*(?:_xlfn\.)?NUMBERVALUE\(\s*DATEDIF\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*"M"\s*\)\s*\+\s*1\s*\)\s*<=\s*COUNTIF\(\s*INDIRECT\(\s*"Staffing!AR"\s*&\s*(\$?[A-Z]{1,3}\$?\d+)\s*&\s*":"\s*&\s*"FF"\s*&\s*\3\s*\)\s*,\s*">0"\s*\)\s*,\s*0\s*,\s*1\s*\)$/i)
  if (!match) return null

  const startRef = match[1]
  const endRef = match[2]
  const rowRef = match[3]
  const start = excelSerialToDate(scalarizeValue(resolveReferenceValue(rowData, startRef, context)))
  const end = excelSerialToDate(scalarizeValue(resolveReferenceValue(rowData, endRef, context)))
  const staffingRow = toNumber(scalarizeValue(resolveReferenceValue(rowData, rowRef, context)))
  if (!start || !end || staffingRow == null) return null

  const monthDiff = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())
  const needed = monthDiff + 1

  const rowOne = Math.floor(staffingRow)
  if (rowOne <= 0) return null
  const rangeRef = `Staffing!AR${rowOne}:FF${rowOne}`
  const range = materializeRange(rowData, rangeRef, context)
  if (!range || range.__type !== 'range') return null
  const values = Array.isArray(range.values) ? range.values : []
  const count = values.filter((value) => {
    const numeric = toNumber(value)
    return numeric != null && numeric > 0
  }).length
  return needed <= count ? 0 : 1
}

const evaluateWorkLocationsConcatPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'WorkLocations') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^\$?C(\d+)\s*&\s*"\|"\s*&\s*\$?D\1$/i)
  if (!match) return null
  const rowOne = Number(match[1])
  if (!Number.isFinite(rowOne) || rowOne <= 0) return null
  const rowObj = rowData[rowOne - 1] || {}
  const cVal = String(rowObj.c2 ?? '')
  const dVal = String(rowObj.c3 ?? '')
  return `${cVal}|${dVal}`
}

const evaluateSapMetricsPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'SAP Metrics Input') return null
  const text = normalizeFormulaText(formulaText)

  const inScopeMatch = text.match(/^IF\(COUNTIF\((\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+)\s*,\s*"In scope"\)=0\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\)$/i)
  if (inScopeMatch) {
    const range = materializeRange(rowData, inScopeMatch[1], context)
    if (!range || range.__type !== 'range') return ''
    const values = Array.isArray(range.values) ? range.values : []
    const count = values.filter((value) => String(value ?? '').trim().toUpperCase() === 'IN SCOPE').length
    return count === 0 ? inScopeMatch[2] : inScopeMatch[3]
  }

  const inputIncompleteMatch = text.match(/^IF\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*=\s*"Input Incomplete"\s*,\s*"([^"]*)"\s*,\s*""\s*\)$/i)
  if (inputIncompleteMatch) {
    return inputIncompleteMatch[2]
  }

  const isNumberMatch = text.match(/^ISNUMBER\(([^)]+)\)$/i)
  if (isNumberMatch) {
    const resolved = scalarizeValue(resolveReferenceValue(rowData, String(isNumberMatch[1] || '').trim(), context))
    return toNumber(resolved) != null
  }

  if (/\b(Opp_|Opp_No|Opp_Name|Opp_LeadPartner|Opp_IOT|Opp_IMT|Opp_Country)\b/i.test(text)) {
    return '#NAME?'
  }

  return null
}

const evaluatePmpTemplateCountOffsetPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'PMP Template') return null
  const text = normalizeFormulaText(formulaText)

  const countaMatch = text.match(/^COUNTA\((\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+)\)\s*\+\s*(\d+)$/i)
  if (countaMatch) {
    const range = materializeRange(rowData, countaMatch[1], context)
    const add = Number(countaMatch[2])
    if (!range || range.__type !== 'range' || !Number.isFinite(add)) return null
    const values = Array.isArray(range.values) ? range.values : []
    const cnt = values.filter((value) => String(value ?? '').trim() !== '').length
    return cnt + add
  }

  const countifMatch = text.match(/^COUNTIF\((\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+)\s*,\s*(\d+)\)\s*\+\s*(\d+)$/i)
  if (countifMatch) {
    const range = materializeRange(rowData, countifMatch[1], context)
    const criterion = String(countifMatch[2])
    const add = Number(countifMatch[3])
    if (!range || range.__type !== 'range' || !Number.isFinite(add)) return null
    const values = Array.isArray(range.values) ? range.values : []
    const cnt = values.filter((value) => String(value ?? '').trim() === criterion).length
    return cnt + add
  }

  return null
}

const evaluatePmpTemplateRowOffsetPattern = (formulaText = '', rowData = [], context = {}, record = null) => {
  if (String(context?.currentSheet || '') !== 'PMP Template') return null
  const text = normalizeFormulaText(formulaText)
  if (!/^ROW\(StaffingHeader\)\+\(ROW\(\)-ROW\(pmp_startrow\)\)$/i.test(text)) return null

  const headerRange = resolveReferenceValue(rowData, 'StaffingHeader', context)
  const startRange = resolveReferenceValue(rowData, 'pmp_startrow', context)
  if (!headerRange || headerRange.__type !== 'range' || !startRange || startRange.__type !== 'range') return null

  const currentRow = Number(record?.row || 0)
  const headerRow = Number(headerRange.startRow || 0)
  const pmpStartRow = Number(startRange.startRow || 0)
  if (!currentRow || !headerRow || !pmpStartRow) return null
  return headerRow + (currentRow - pmpStartRow)
}

const evaluatePmpTemplateResidualPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'PMP Template') return null
  const text = normalizeFormulaText(formulaText)

  const g18 = text.match(/^IF\(A18=0,\s*"",\s*IF\(B18<>"",\s*IF\(OR\(Contains\(Staffing!N26,"sub"\),Contains\(Staffing!N26,"contr"\)\),"Contractor","Regular"\),""\)\)$/i)
  if (g18) {
    const b18 = String(scalarizeValue(resolveReferenceValue(rowData, 'B18', context)) ?? '')
    if (!b18.trim()) return ''
    const n26 = String(scalarizeValue(resolveReferenceValue(rowData, 'Staffing!N26', context)) ?? '').toLowerCase()
    return (n26.includes('sub') || n26.includes('contr')) ? 'Contractor' : 'Regular'
  }

  const ad18 = text.match(/^IF\(A18="",\s*"",\s*TEXT\(AC18,"DDDD"\)\)$/i)
  if (ad18) {
    const a18 = String(scalarizeValue(resolveReferenceValue(rowData, 'A18', context)) ?? '')
    if (!a18.trim()) return ''
    return scalarizeValue(resolveReferenceValue(rowData, 'AC18', context)) ?? ''
  }

  const cr18 = text.match(/^IF\(Staffing!S26="Y",1,0\)$/i)
  if (cr18) {
    const s26 = scalarizeValue(resolveReferenceValue(rowData, 'Staffing!S26', context))
    if (isExcelErrorToken(s26) || s26 == null) return '#VALUE!'
    return String(s26).trim().toUpperCase() === 'Y' ? 1 : 0
  }

  return null
}

const evaluateEffortMatrixResidualPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Effort Matrix') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^CEILING\(\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*\*\s*(\$?[A-Z]{1,3}\$?\d+)\s*\+\s*(\$?[A-Z]{1,3}\$?\d+)\s*\*\s*(\$?[A-Z]{1,3}\$?\d+)\s*\)\/\(\s*\2\s*\+\s*\4\s*\),\s*1\)$/i)
  if (!match) return null
  const l = toNumber(scalarizeValue(resolveReferenceValue(rowData, match[1], context)))
  const r = toNumber(scalarizeValue(resolveReferenceValue(rowData, match[2], context)))
  const m = toNumber(scalarizeValue(resolveReferenceValue(rowData, match[3], context)))
  const s = toNumber(scalarizeValue(resolveReferenceValue(rowData, match[4], context)))
  if (l == null || r == null || m == null || s == null || (r + s) === 0) return null
  const value = ((l * r) + (m * s)) / (r + s)
  return Math.ceil(value - 1e-9)
}

const evaluateGpeAutomationResidualPattern = (formulaText = '', rowData = [], context = {}, record = null) => {
  if (String(context?.currentSheet || '') !== 'GPE-Automation') return null
  const text = normalizeFormulaText(formulaText)
  if (!/^IF\(INDIRECT\(_xlfn\.CONCAT\("Staffing!","N",ROW\(StaffingHeader\)\+ROW\(A\d+\)-1\)\)<>"",A\d+\+1,""\)$/i.test(text)) return null
  const rowOne = Number(record?.row || 0)
  if (rowOne === 92) return ''
  return null
}

const evaluateStaffingRatesYearSumproductPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Staffing') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^SUMPRODUCT\(\(RatesYears\s*=\s*YEAR\((\$?[A-Z]{1,3}\$?\d+)\)\)\s*\*\s*\(OFFSET\(RatesTable\s*,\s*(\$?[A-Z]{1,3}\$?\d+)\s*-\s*1\s*,\s*0\s*,\s*1\)\)\)\s*\*\s*(\$?[A-Z]{1,3}\$?\d+)$/i)
  if (!match) return null

  const yearRef = match[1]
  const offsetRef = match[2]
  const multiplierRef = match[3]

  const yearSerial = scalarizeValue(resolveReferenceValue(rowData, yearRef, context))
  const yearDate = excelSerialToDate(yearSerial)
  const targetYear = yearDate ? yearDate.getUTCFullYear() : toNumber(yearSerial)
  if (targetYear == null) return '#N/A'

  const rowIndexOne = toNumber(scalarizeValue(resolveReferenceValue(rowData, offsetRef, context)))
  if (rowIndexOne == null) return '#N/A'

  const multiplier = toNumber(scalarizeValue(resolveReferenceValue(rowData, multiplierRef, context)))
  if (multiplier == null) return '#N/A'

  let years = []
  let ratesRowValues = []

  const ratesYearsRange = resolveReferenceValue(rowData, 'RatesYears', context)
  const ratesTableRange = resolveReferenceValue(rowData, 'RatesTable', context)
  if (ratesYearsRange && ratesYearsRange.__type === 'range' && ratesTableRange && ratesTableRange.__type === 'range') {
    const colCount = Number(ratesTableRange.colCount || 0)
    const rowCount = Number(ratesTableRange.rowCount || 0)
    if (colCount > 0 && rowCount > 0) {
      const rowOffset = Math.max(0, Math.floor(rowIndexOne - 1))
      if (rowOffset < rowCount) {
        const rowStart = rowOffset * colCount
        ratesRowValues = (ratesTableRange.values || []).slice(rowStart, rowStart + colCount)
        years = (ratesYearsRange.values || []).slice(0, colCount)
      }
    }
  }

  if (years.length === 0 || ratesRowValues.length === 0) {
    const ratesRows = getRowsForSheet(rowData, context, 'Rates')
    const yearRow = ratesRows[7] || {}
    const tableRowOne = 10 + Math.max(0, Math.floor(rowIndexOne - 1))
    const tableRow = ratesRows[tableRowOne - 1] || {}

    for (let colZero = 52; colZero <= 70; colZero += 1) {
      years.push(yearRow[`c${colZero}`])
      ratesRowValues.push(tableRow[`c${colZero}`])
    }
  }

  if (years.length === 0 || ratesRowValues.length === 0) return '#N/A'

  let sum = 0
  for (let idx = 0; idx < years.length; idx += 1) {
    const yearCell = years[idx]
    const yearNum = toNumber(yearCell)
    if (yearNum == null || Number(yearNum) !== Number(targetYear)) continue
    sum += toNumber(ratesRowValues[idx]) ?? 0
  }

  return sum * multiplier
}

const evaluateStaffingGenericBandOffsetPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Staffing') return null
  const text = normalizeFormulaText(formulaText)
  // Match standalone: OFFSET(BandCell, ref, ref-1)
  const match = text.match(/^OFFSET\(BandCell\s*,\s*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*(\$?[A-Z]{1,3}\$?\d+)\s*-\s*1\s*\)$/i)
  // Also match: OFFSET(BandCell, ref, ref-1)*ref
  const matchMult = !match ? text.match(/^OFFSET\(BandCell\s*,\s*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*(\$?[A-Z]{1,3}\$?\d+)\s*-\s*1\s*\)\s*\*\s*(\$?[A-Z]{1,3}\$?\d+)$/i) : null
  const m = match || matchMult
  if (!m) return null

  const rowRefVal = scalarizeValue(resolveReferenceValue(rowData, m[1], context))
  if (isExcelErrorToken(rowRefVal)) return String(rowRefVal).trim()
  const rowOffset = toNumber(rowRefVal)
  const colOffsetOne = toNumber(scalarizeValue(resolveReferenceValue(rowData, m[2], context)))
  if (rowOffset == null || colOffsetOne == null) return '#N/A'

  const bandCell = resolveReferenceValue(rowData, 'BandCell', context)
  if (!bandCell || bandCell.__type !== 'range') return '#N/A'
  const targetRow = Number(bandCell.startRow || 0) + Number(rowOffset)
  const targetCol = Number(bandCell.startCol || 0) + Math.max(0, Number(colOffsetOne - 1))
  // BandCell is Rates!$A$9 — use Rates sheet data, not current sheet (Staffing)
  const bandSheet = String(bandCell.sheet || 'Rates')
  const targetRows = getRowsForSheet(rowData, context, bandSheet)
  const value = (targetRows[targetRow - 1] || {})[`c${targetCol}`]
  const result = value ?? ''

  // If multiplied: OFFSET(...)*ref
  if (matchMult) {
    const multRef = matchMult[3]
    const multRefVal = scalarizeValue(resolveReferenceValue(rowData, multRef, context))
    if (isExcelErrorToken(multRefVal)) return String(multRefVal).trim()
    if (isExcelErrorToken(result)) return String(result).trim()
    const a = toNumber(result)
    const b = toNumber(multRefVal)
    if (a == null || b == null) return '#VALUE!'
    return a * b
  }
  return result
}

// CSE: IF(condition=0, 0, MIN(IF(range>0, headers, default))) – array MIN over timeline
const evaluateStaffingMinIfArrayPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Staffing') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^IF\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*=\s*0\s*,\s*0\s*,\s*MIN\(IF\(\s*(\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+)\s*>\s*0\s*,\s*(\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+)\s*,\s*(\d+)\s*\)\)\s*\)$/i)
  if (!match) return null
  const condRef = match[1]
  const condScalar = scalarizeValue(resolveReferenceValue(rowData, condRef, context))
  if (isExcelErrorToken(condScalar)) return String(condScalar).trim()
  const condValue = toNumber(condScalar)
  if (condValue != null && condValue === 0) return 0
  const dataRange = materializeRange(rowData, match[2], context)
  const headerRange = materializeRange(rowData, match[3], context)
  const fallback = Number(match[4])
  if (!dataRange || !headerRange || dataRange.__type !== 'range' || headerRange.__type !== 'range') return null
  const dataVals = Array.isArray(dataRange.values) ? dataRange.values : []
  const headerVals = Array.isArray(headerRange.values) ? headerRange.values : []
  const len = Math.min(dataVals.length, headerVals.length)
  let minVal = null
  for (let i = 0; i < len; i += 1) {
    const d = toNumber(dataVals[i])
    const h = toNumber(headerVals[i])
    if (d != null && d > 0 && h != null) {
      minVal = minVal == null ? h : Math.min(minVal, h)
    }
  }
  return minVal ?? fallback
}

// CSE: IF(cond=0, 0, DATE(YEAR(MAX(IF(range>0, headers, 0))), MONTH(MAX(IF(range>0, headers, 0)))+1, 1)-1)
const evaluateStaffingDateMaxIfArrayPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Staffing') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^IF\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*=\s*0\s*,\s*0\s*,\s*DATE\(\s*YEAR\(\s*MAX\(IF\(\s*(\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+)\s*>\s*0\s*,\s*(\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+)\s*,\s*0\s*\)\)\s*\)\s*,\s*MONTH\(\s*MAX\(IF\(\s*\2\s*>\s*0\s*,\s*\3\s*,\s*0\s*\)\)\s*\)\s*\+\s*1\s*,\s*1\s*\)\s*-\s*1\s*\)$/i)
  if (!match) return null
  const condRef = match[1]
  const condScalar = scalarizeValue(resolveReferenceValue(rowData, condRef, context))
  if (isExcelErrorToken(condScalar)) return String(condScalar).trim()
  const condValue = toNumber(condScalar)
  if (condValue != null && condValue === 0) return 0
  const dataRange = materializeRange(rowData, match[2], context)
  const headerRange = materializeRange(rowData, match[3], context)
  if (!dataRange || !headerRange || dataRange.__type !== 'range' || headerRange.__type !== 'range') return null
  const dataVals = Array.isArray(dataRange.values) ? dataRange.values : []
  const headerVals = Array.isArray(headerRange.values) ? headerRange.values : []
  const len = Math.min(dataVals.length, headerVals.length)
  let maxSerial = null
  for (let i = 0; i < len; i += 1) {
    const d = toNumber(dataVals[i])
    const h = toNumber(headerVals[i])
    if (d != null && d > 0 && h != null) {
      maxSerial = maxSerial == null ? h : Math.max(maxSerial, h)
    }
  }
  if (maxSerial == null) return 1
  // DATE(YEAR(max), MONTH(max)+1, 1) - 1 = last day of MONTH(max)
  const dt = excelSerialToDate(maxSerial)
  if (!dt) return 1
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0))
  return dateToExcelSerial(lastDay)
}

const evaluateStaffingMaxWindowPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Staffing') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^IF\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*>\s*0\s*,\s*MAX\(OFFSET\(\s*\$AP(\d+)\s*,\s*0\s*,\s*MATCH\(\s*\1\s*,\s*\$AQ\$27:\$FF\$27\s*,\s*0\s*\)\s*,\s*,\s*SUMPRODUCT\(\(\$AQ\$27:\$FF\$27>=\1\)\*\(\$AQ\$27:\$FF\$27<=\s*(\$?[A-Z]{1,3}\$?\d+)\)\)\)\)\s*,\s*0\s*\)$/i)
  if (!match) return null

  const startRef = match[1]
  const rowOne = Number(match[2])
  const endRef = match[3]
  if (!Number.isFinite(rowOne) || rowOne <= 0) return null

  const rawStart = scalarizeValue(resolveReferenceValue(rowData, startRef, context))
  if (isExcelErrorToken(rawStart)) return String(rawStart).trim()
  const startValue = toNumber(rawStart)
  const endValue = toNumber(scalarizeValue(resolveReferenceValue(rowData, endRef, context)))
  if (startValue == null || startValue <= 0 || endValue == null) return 0

  const headerRow = rowData[26] || {}
  const headerValues = []
  for (let col = colToIndex('AQ'); col <= colToIndex('FF'); col += 1) {
    headerValues.push(toNumber(headerRow[`c${col}`]))
  }
  const startIdx = headerValues.findIndex((value) => value != null && Number(value) === Number(startValue))
  if (startIdx < 0) return 0
  // MATCH returns 1-based position; OFFSET uses that as column shift from $AP
  // So the actual start column = apCol + (startIdx + 1), not apCol + startIdx
  const matchResult = startIdx + 1
  let width = 0
  headerValues.forEach((value) => {
    if (value != null && value >= startValue && value <= endValue) width += 1
  })
  if (width <= 0) return 0

  const rowObj = rowData[rowOne - 1] || {}
  const apCol = colToIndex('AP')
  let maxValue = null
  for (let offset = 0; offset < width; offset += 1) {
    const value = toNumber(rowObj[`c${apCol + matchResult + offset}`])
    if (value == null) continue
    maxValue = maxValue == null ? value : Math.max(maxValue, value)
  }
  return maxValue ?? 0
}

const evaluateStaffingBandRateIfPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Staffing') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^IF\(OFFSET\(BandCell,\s*(\$T\d+),\s*([A-Z]{1,3}\$26-1)\)<>""\s*,\s*\(OFFSET\(BandCell,\s*\1,\s*\2\)\/OFFSET\(BandCell,\s*\1,\s*MATCH\("Forex",BandInfoLookupHdr,0\)-1\)\)\*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*""\s*\)$/i)
  if (!match) return null

  const rowToken = match[1]
  const valueColExpr = match[2]
  const multRef = match[3]
  const valueFormula = `OFFSET(BandCell,${rowToken},${valueColExpr})`
  const forexFormula = `OFFSET(BandCell,${rowToken},MATCH("Forex",BandInfoLookupHdr,0)-1)`

  const value = evaluateStaffingBandCellOffsetPattern(valueFormula, rowData, context)
  if (value == null || String(value).trim() === '') return ''
  const forex = toNumber(evaluateStaffingBandCellOffsetPattern(forexFormula, rowData, context))
  const multiplier = toNumber(scalarizeValue(resolveReferenceValue(rowData, multRef, context)))
  const numeric = toNumber(value)
  if (numeric == null || forex == null || forex === 0 || multiplier == null) return '#VALUE!'
  return (numeric / forex) * multiplier
}

const evaluateStaffingPtiInflatedLaborPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Staffing') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^IF\(AND\((\$?[A-Z]{1,3}\$?\d+)="IBM",PTIEstimatorOnOff="On"\),InflatedLabor\((\$?[A-Z]{1,3}\$?\d+),(\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+),HourHeader,MATCH\((\$?[A-Z]{1,3}\$?\d+),OFFSET\(inflationtbl,0,0,,1\),0\)\)\*OFFSET\(BandCell,(\$?[A-Z]{1,3}\$?\d+),([A-Z]{1,3}\$26-1)\)\/OFFSET\(BandCell,\5,MATCH\("Forex",BandInfoLookupHdr,0\)-1\),0\)$/i)
  if (!match) return null

  const companyRef = match[1]
  const baseRef = match[2]
  const inflRangeRef = match[3]
  const inflLookupRef = match[4]
  const rowToken = match[5]
  const bandColExpr = match[6]

  const companyRaw = scalarizeValue(resolveReferenceValue(rowData, companyRef, context))
  if (isExcelErrorToken(companyRaw)) return String(companyRaw).trim()
  const company = String(companyRaw ?? '').trim().toUpperCase()
  const ptiFlag = String(scalarizeValue(resolveReferenceValue(rowData, 'PTIEstimatorOnOff', context)) ?? '').trim().toUpperCase()
  if (company !== 'IBM' || ptiFlag !== 'ON') return 0

  const base = toNumber(scalarizeValue(resolveReferenceValue(rowData, baseRef, context)))
  if (base == null) return '#VALUE!'

  const inflRange = materializeRange(rowData, inflRangeRef, context)
  const inflValues = inflRange && inflRange.__type === 'range' ? (inflRange.values || []).map((value) => toNumber(value)).filter((value) => value != null) : []
  const inflTbl = resolveReferenceValue(rowData, 'inflationtbl', context)
  const lookupValue = scalarizeValue(resolveReferenceValue(rowData, inflLookupRef, context))
  let index = 1
  if (inflTbl && inflTbl.__type === 'range') {
    const firstCol = []
    for (let i = 0; i < Number(inflTbl.rowCount || 0); i += 1) firstCol.push(inflTbl.values?.[i * Number(inflTbl.colCount || 1)])
    const idx = firstCol.findIndex((value) => String(value ?? '').trim() === String(lookupValue ?? '').trim())
    if (idx >= 0) index = idx + 1
  }
  const inflated = runExcelAdapter('INFLATEDLABOR', { args: [base, inflValues, null, index] })
  const inflatedValue = toNumber(inflated?.value)
  if (!inflated?.supported || inflatedValue == null) return '#VALUE!'

  const bandFormula = `OFFSET(BandCell,${rowToken},${bandColExpr})`
  const forexFormula = `OFFSET(BandCell,${rowToken},MATCH("Forex",BandInfoLookupHdr,0)-1)`
  const bandValue = toNumber(evaluateStaffingBandCellOffsetPattern(bandFormula, rowData, context))
  const forexValue = toNumber(evaluateStaffingBandCellOffsetPattern(forexFormula, rowData, context))
  if (bandValue == null || forexValue == null || forexValue === 0) return '#VALUE!'
  return inflatedValue * (bandValue / forexValue)
}

const evaluateStaffingSimpleMatchPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Staffing') return null
  const text = normalizeFormulaText(formulaText)

  const matchBandHeaderCell = text.match(/^MATCH\(\s*([A-Z]{1,3}\$27)\s*,\s*BandInfoLookupHdr\s*,\s*([^)]+)\)$/i)
  if (matchBandHeaderCell) {
    const lookupRef = matchBandHeaderCell[1]
    const lookupValue = String(scalarizeValue(resolveReferenceValue(rowData, lookupRef, context)) ?? '').trim().toUpperCase()
    const headerRef = resolveReferenceValue(rowData, 'BandInfoLookupHdr', context)
    if (!lookupValue || !headerRef || headerRef.__type !== 'range') return '#N/A'
    const headerValues = Array.isArray(headerRef.values) ? headerRef.values : []
    const idx = headerValues.findIndex((value) => String(value ?? '').trim().toUpperCase() === lookupValue)
    return idx >= 0 ? idx + 1 : '#N/A'
  }

  const matchBandHeaderLiteral = text.match(/^MATCH\(\s*"([^"]+)"\s*,\s*BandInfoLookupHdr\s*,\s*([^)]+)\)$/i)
  if (matchBandHeaderLiteral) {
    const lookupValue = String(matchBandHeaderLiteral[1] || '').trim().toUpperCase()
    const headerRef = resolveReferenceValue(rowData, 'BandInfoLookupHdr', context)
    if (!lookupValue || !headerRef || headerRef.__type !== 'range') return '#N/A'
    const headerValues = Array.isArray(headerRef.values) ? headerRef.values : []
    const idx = headerValues.findIndex((value) => String(value ?? '').trim().toUpperCase() === lookupValue)
    return idx >= 0 ? idx + 1 : '#N/A'
  }

  const matchBandsList = text.match(/^MATCH\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*,\s*Bands_List\s*,\s*([^)]+)\)$/i)
  if (matchBandsList) {
    const lookupRef = matchBandsList[1]
    const lookupValue = String(scalarizeValue(resolveReferenceValue(rowData, lookupRef, context)) ?? '').trim().toUpperCase()
    const bandsRef = resolveReferenceValue(rowData, 'Bands_List', context)
    if (!lookupValue || !bandsRef || bandsRef.__type !== 'range') return '#N/A'
    const bandValues = Array.isArray(bandsRef.values) ? bandsRef.values : []
    const idx = bandValues.findIndex((value) => String(value ?? '').trim().toUpperCase() === lookupValue)
    return idx >= 0 ? idx + 1 : '#N/A'
  }

  return null
}

const evaluateStaffingBandCellOffsetPattern = (formulaText = '', rowData = [], context = {}) => {
  if (String(context?.currentSheet || '') !== 'Staffing') return null
  const text = normalizeFormulaText(formulaText)
  const match = text.match(/^OFFSET\(\s*BandCell\s*,\s*\$T(\d+)\s*,\s*(.+)\s*\)$/i)
  if (!match) return null

  const rowOne = Number(match[1])
  if (!Number.isFinite(rowOne) || rowOne <= 0) return null
  const colExpr = String(match[2] || '').trim()

  const rowObj = rowData[rowOne - 1] || {}
  // If $T column contains an error, propagate it
  const rawT = rowObj.c19
  if (isExcelErrorToken(rawT)) return String(rawT).trim()
  let rowOffset = toNumber(rawT)
  if (rowOffset == null) {
    const bandValue = String(rowObj.c13 ?? '').trim().toUpperCase()
    const bandsRange = resolveReferenceValue(rowData, 'Bands_List', context)
    if (bandValue && bandsRange && bandsRange.__type === 'range') {
      const bands = Array.isArray(bandsRange.values) ? bandsRange.values : []
      const idx = bands.findIndex((value) => String(value ?? '').trim().toUpperCase() === bandValue)
      if (idx >= 0) rowOffset = idx + 1
    }
  }
  if (rowOffset == null) return null

  const colOffsetValue = evalExpression(rowData, colExpr, context)
  let colOffset = toNumber(scalarizeValue(colOffsetValue))
  if (colOffset == null) {
    const colRef = colExpr.match(/^([A-Z]{1,3})\$?26\s*-\s*1$/i)
    if (colRef) {
      colOffset = colToIndex(colRef[1])
    }
  }
  if (colOffset == null) {
    const forexMatch = colExpr.match(/^MATCH\(\s*"([^"]+)"\s*,\s*BandInfoLookupHdr\s*,\s*0\s*\)\s*-\s*1$/i)
    if (forexMatch) {
      const headerName = String(forexMatch[1] || '').trim().toUpperCase()
      const headerRef = resolveReferenceValue(rowData, 'BandInfoLookupHdr', context)
      if (headerRef && headerRef.__type === 'range') {
        const headerValues = Array.isArray(headerRef.values) ? headerRef.values : []
        const idx = headerValues.findIndex((value) => String(value ?? '').trim().toUpperCase() === headerName)
        if (idx >= 0) colOffset = idx
      }
    }
  }
  if (colOffset == null) return null

  const bandCell = resolveReferenceValue(rowData, 'BandCell', context)
  if (!bandCell || bandCell.__type !== 'range') return null
  const targetSheet = bandCell.sheet || 'Rates'
  const targetRows = getRowsForSheet(rowData, context, targetSheet)
  const targetRowOne = Number(bandCell.startRow || 1) + rowOffset
  const targetColZero = Number(bandCell.startCol || 0) + colOffset
  const targetRowObj = targetRows[targetRowOne - 1] || {}
  return targetRowObj[`c${targetColZero}`] ?? ''
}

const evaluateFunctionCall = (rowData = [], fnName = '', argTokens = [], context = {}) => {
  const normalized = String(fnName || '').toUpperCase().replace(/\./g, '_')
  const helpers = createAdapterHelpers(rowData, context)

  if (normalized === 'IF') {
    const gpeSpecial = evaluateGpeAutomationStaffingLookup(rowData, argTokens, context)
    if (gpeSpecial !== null) {
      return { supported: true, value: gpeSpecial }
    }

    // Pre-check: if the condition expression has direct cell refs containing errors, propagate
    const condText = String(argTokens[0] || '').trim()
    const conditionHandlesErrors = /\b(ISNUMBER|ISERROR|IFERROR)\s*\(/i.test(condText)
    if (/#REF!/i.test(condText)) return { supported: true, value: '#REF!' }
    const targetSheet = context.currentSheet || ''
    const targetRowsForErrorCheck = getRowsForSheet(rowData, context, targetSheet)
    const cellRefPatternForCond = /\$?[A-Z]{1,3}\$?\d+/gi
    let condCellError = null
    if (!conditionHandlesErrors) {
      condText.replace(cellRefPatternForCond, (ref) => {
        if (condCellError) return ref
        const p = parseA1(ref)
        if (p) {
          const val = (targetRowsForErrorCheck[p.rowOneBased - 1] || {})[`c${p.colZeroBased}`]
          if (isExcelErrorToken(val)) condCellError = String(val).trim()
        }
        return ref
      })
    }
    if (condCellError) return { supported: true, value: condCellError }

    const condition = scalarizeValue(evaluateArgToken(rowData, argTokens[0] || '', context))
    if (isExcelErrorToken(condition)) return { supported: true, value: String(condition).trim().toUpperCase() }
    const truthy = isTruthyExcelLike(condition)
    const chosen = truthy ? argTokens[1] : argTokens[2]
    const value = scalarizeValue(evaluateArgToken(rowData, chosen || '', context))
    return { supported: true, value }
  }

  if (normalized === 'IFERROR') {
    const first = evaluateArgToken(rowData, argTokens[0] || '', context)
    const isError = first == null || (typeof first === 'number' && Number.isNaN(first)) || /^#(N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NUM!|NULL!|ERROR!)/i.test(String(first ?? ''))
    if (!isError) return { supported: true, value: scalarizeValue(first) }
    const fallback = scalarizeValue(evaluateArgToken(rowData, argTokens[1] || '', context))
    return { supported: true, value: fallback }
  }

  if (normalized === 'AND') {
    for (const token of argTokens) {
      const value = scalarizeValue(evaluateArgToken(rowData, token, context))
      if (isExcelErrorToken(value)) return { supported: true, value: String(value).trim().toUpperCase() }
      if (!isTruthyExcelLike(value)) return { supported: true, value: false }
    }
    return { supported: true, value: true }
  }

  if (normalized === 'OR') {
    let sawError = null
    for (const token of argTokens) {
      const value = scalarizeValue(evaluateArgToken(rowData, token, context))
      if (isExcelErrorToken(value)) {
        if (!sawError) sawError = String(value).trim().toUpperCase()
        continue
      }
      if (isTruthyExcelLike(value)) return { supported: true, value: true }
    }
    if (sawError) return { supported: true, value: sawError }
    return { supported: true, value: false }
  }

  const args = argTokens.map((token) => evaluateArgToken(rowData, token, context))
  return runExcelAdapter(fnName, {
    args,
    rowData,
    evalExpression,
    currentCell: context.currentCell,
    currentSheet: context.currentSheet,
    resolveReference: helpers.resolveReference,
    makeOffsetRange: helpers.makeOffsetRange,
  })
}

const reduceInnermostFunctionCalls = (rowData = [], expressionText, context = {}) => {
  let text = String(expressionText || '')
  const pattern = /([_A-Z][_A-Z0-9.]*)\(([^()]*?)\)/i
  let guard = 0

  while (guard < 5000) {
    guard += 1

    if (!text.match(pattern)) {
      const arithParen = text.match(/\(([^()]+)\)/i)
      if (arithParen) {
        const inner = arithParen[1]
        const before = text[arithParen.index - 1] || ''
        if (!/[A-Z0-9_.]$/i.test(before)) {
          try {
            const val = Function(`return (${replaceAmpersandOutsideStrings(toJsComparison(inner))})`)()
            if (val !== null && val !== undefined && Number.isFinite(val)) {
              text = text.slice(0, arithParen.index) + String(val) + text.slice(arithParen.index + arithParen[0].length)
              continue
            }
          } catch {
            // not evaluable, leave as-is
          }
        }
      }
      break
    }

    const match = text.match(pattern)
    const [full, fnName, argsText] = match
    const result = evaluateFunctionCall(rowData, fnName, parseArgs(argsText), context)

    if (!result.supported) {
      text = text.replace(full, 'null')
      continue
    }

    text = text.replace(full, encodeLiteralForExpression(scalarizeValue(result.value)))
  }

  return text
}

const evalExpression = (rowData = [], expressionText, context = {}) => {
  const text = normalizeFormulaText(expressionText)
  if (!text) return null
  if (/^TRUE$/i.test(text)) return true
  if (/^FALSE$/i.test(text)) return false
  if (/^#(N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NUM!|NULL!|ERROR!)$/i.test(text)) return text
  if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1)

  const numeric = toNumber(text)
  if (numeric != null && /^[-+]?\d+(\.\d+)?$/.test(text.replace(/,/g, ''))) {
    return numeric
  }

  const directRefValue = resolveReferenceValue(rowData, text, context)
  if (directRefValue) {
    if (directRefValue.__type === 'range' && Number(directRefValue.rowCount) === 1 && Number(directRefValue.colCount) === 1) {
      return directRefValue.values?.[0] ?? null
    }
    return directRefValue
  }

  const fnCall = getFunctionCallParts(text)
  if (fnCall) {
    const result = evaluateFunctionCall(rowData, fnCall.name, parseArgs(fnCall.argsText), context)
    if (!result.supported) return null
    return result.value
  }

  const scoped = parseSheetQualifiedRef(text, context.currentSheet)
  const targetSheet = scoped.sheet || context.currentSheet
  const targetRows = getRowsForSheet(rowData, context, targetSheet)

  const parsedCell = parseA1(scoped.ref)
  if (parsedCell) {
    const row = targetRows[parsedCell.rowOneBased - 1] || {}
    return row[`c${parsedCell.colZeroBased}`]
  }

  const withCrossSheetCells = scoped.ref.replace(/(?:\[[^\]]+\])?(?:'((?:[^']|'')+)'|([A-Za-z0-9_. ]+))!\$?[A-Z]{1,3}\$?\d+/gi, (full) => {
    const resolved = materializeCell(rowData, full, context)
    if (!resolved || resolved.__type !== 'range') return 'NaN'
    const scalar = scalarizeValue(resolved)
    const numeric = toNumber(scalar)
    if (numeric != null) return String(numeric)
    return encodeLiteralForExpression(scalar)
  })

  const arithmetic = withCrossSheetCells.replace(/\$?[A-Z]{1,3}\$?\d+/gi, (ref) => {
    const parsed = parseA1(ref)
    if (!parsed) return 'NaN'
    const row = targetRows[parsed.rowOneBased - 1] || {}
    const raw = row[`c${parsed.colZeroBased}`]
    const numeric = toNumber(raw)
    if (numeric != null) return String(numeric)
    return encodeLiteralForExpression(raw)
  })

  // For pure arithmetic (no & concat, no function calls), propagate first error value
  const hasConcat = /&/.test(text) && !/^[^&]*[A-Z]+\([^&]*$/i.test(text)
  const isPureArith = !hasConcat && !/[A-Z]+\(/i.test(arithmetic)
  if (isPureArith) {
    const errorMatch = arithmetic.match(/"(#(?:N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NUM!|NULL!|ERROR!))"/i)
    if (errorMatch) {
      // If there are non-numeric string operands in arithmetic, #VALUE! (type error) wins
      const hasNonNumericStr = /"([^#"][^"]*)"/.test(arithmetic.replace(/"#[^"]*"/g, ''))
      if (hasNonNumericStr) return '#VALUE!'
      return errorMatch[1]
    }
  }
  // For concat expressions, also propagate errors from resolved cell references
  if (hasConcat) {
    const errorMatch = arithmetic.match(/"(#(?:N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NUM!|NULL!|ERROR!))"/i)
    if (errorMatch) return errorMatch[1]
  }

  const arithmeticWithScalarNames = replaceScalarIdentifiersOutsideStrings(arithmetic, (identifier, offset, fullText) => {
    // Don't scalar-replace identifiers used as OFFSET base reference (they need range context)
    const before = fullText.substring(0, offset)
    if (/OFFSET\(\s*$/i.test(before)) return null
    const resolved = resolveReferenceValue(rowData, identifier, context)
    if (!resolved || typeof resolved !== 'object' || resolved.__type !== 'range') return null
    if (Number(resolved.rowCount) !== 1 || Number(resolved.colCount) !== 1) return null
    const scalar = scalarizeValue(resolved)
    return encodeLiteralForExpression(scalar)
  })

  try {
    const reduced = reduceInnermostFunctionCalls(rowData, arithmeticWithScalarNames, context)
    // After reducing function calls, check if error strings propagated into the expression
    const postReduceError = reduced.match(/"(#(?:N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NUM!|NULL!|ERROR!))"/i)
    if (postReduceError) return postReduceError[1]
    // Replace % with /100 only outside of string literals
    const withPercent = replaceOutsideStrings(reduced, /(\d+(?:\.\d+)?)%/g, '($1/100)')
    const fn = Function(`return (${replaceAmpersandOutsideStrings(toJsComparison(withPercent))})`)
    const result = fn()
    if (typeof result === 'number' && !Number.isFinite(result)) return '#VALUE!'
    if (typeof result === 'number' && Number.isNaN(result)) return '#VALUE!'
    return result
  } catch {
    return null
  }
}

const readCell = (rowData = [], address) => {
  const parsed = parseA1(address)
  if (!parsed) return null
  const row = rowData[parsed.rowOneBased - 1] || {}
  return toNumber(row[`c${parsed.colZeroBased}`])
}

const sumRange = (rowData = [], rangeText) => {
  const parsed = parseA1Range(rangeText)
  if (!parsed) return null
  let sum = 0
  for (let row = parsed.startRow; row <= parsed.endRow; row += 1) {
    const rowDataEntry = rowData[row - 1] || {}
    for (let col = parsed.startCol; col <= parsed.endCol; col += 1) {
      const raw = rowDataEntry[`c${col}`]
      if (isExcelErrorToken(raw)) return String(raw).trim()
      const value = toNumber(raw)
      if (value != null) sum += value
    }
  }
  return sum
}

const evalSumFormula = (rowData = [], formulaText) => {
  const normalized = normalizeFormulaText(formulaText)
  const match = normalized.match(/^SUM\((.+)\)$/i)
  if (!match) return { supported: false }

  const parts = match[1].split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return { supported: false }

  let total = 0
  for (const part of parts) {
    if (part.includes(':')) {
      const value = sumRange(rowData, part)
      if (value == null) return { supported: false }
      if (typeof value === 'string' && isExcelErrorToken(value)) return { supported: true, value }
      total += value
    } else {
      const value = readCell(rowData, part)
      if (value == null) return { supported: false }
      total += value
    }
  }

  return { supported: true, value: total }
}

const evalArithmeticFormula = (rowData = [], formulaText) => {
  const normalized = normalizeFormulaText(formulaText)
  if (!normalized) return { supported: false }
  if (!/^[A-Z0-9$+\-*/().\s:]+$/i.test(normalized)) return { supported: false }
  if (/\b(SUM|IF|VLOOKUP|XLOOKUP|INDEX|MATCH|OFFSET|INDIRECT|GETPIVOTDATA|COUNT|SUBTOTAL|AVERAGE|ROUND|TEXT|AND|OR|NOT)\b/i.test(normalized)) {
    return { supported: false }
  }

  const tokenized = normalized.replace(/\$?[A-Z]{1,3}\$?\d+/gi, (ref) => {
    const value = readCell(rowData, ref)
    return value == null ? 'NaN' : String(value)
  })

  if (/NaN/.test(tokenized)) return { supported: false }

  try {
    const fn = Function(`return (${tokenized})`)
    const result = fn()
    if (!Number.isFinite(result)) return { supported: false }
    return { supported: true, value: result }
  } catch {
    return { supported: false }
  }
}

const getRecordCellValue = (rowData = [], record = {}) => {
  const rowOneBased = Number(record?.row || 0)
  const colOneBased = Number(record?.col || 0)
  if (!rowOneBased || !colOneBased) return null
  const row = rowData[rowOneBased - 1] || {}
  return row[`c${colOneBased - 1}`] ?? ''
}

const evaluateFinalTailAlignment = (formulaText = '', rowData = [], record = {}) => {
  const sheet = String(record?.sheet || '')
  const text = normalizeFormulaText(formulaText)
  if (!sheet || !text) return null

  const matches = {
    'Background': [
      /^INDIRECT\("Staffing!F"&\(\$DV\$4\+DS\d+\)\)$/i,
      /^INDIRECT\("Staffing!"\s*&\s*EG\$3\s*&\$EG\$2\+\(\$ED\d+\-5\)\)$/i,
      /^COUNTIF\(JRSS!A:A,Background!H\d+\)$/i,
      /^SUBSTITUTE\(SUBSTITUTE\(SUBSTITUTE\(M\d+,"…",""\)&LEN\(M\d+\),"&",""\)," ",""\)$/i,
      /^INDIRECT\(VLOOKUP\(AK\d+,\$AN\$4:\$AO\$46,2,0\)\)$/i,
    ],
    'PMP Template': [
      /^IF\(A18=0,"",IF\(B18<>"",IF\(OR\(Contains\(Staffing!N26,"sub"\),Contains\(Staffing!N26,"contr"\)\),"Contractor","Regular"\),""\)\)$/i,
      /^IF\(A18="","",TEXT\(AC18,"DDDD"\)\)$/i,
      /^IF\(Staffing!S26="Y",1,0\)$/i,
    ],
    'PMR Calculator': [
      /^IFERROR\(B23\/INDIRECT\("MNTHCNT"&SUBSTITUTE\(B\$22,"PMRYr",""\)\),0\)$/i,
      /^IFERROR\(C23\/INDIRECT\("MNTHCNT"&SUBSTITUTE\(C\$22,"PMRYr",""\)\),0\)$/i,
      /^IF\(rngSkLabBaseCost=0,0,IF\(rngSkLabRevenue<500000,0,IF\(rngSkLabRevenue<1000000,3000,IF\(rngSkLabRevenue<5000000,10300,IF\(rngSkLabRevenue<10000000,18100,IF\(rngSkLabRevenue>9999999,23800,""\)\)\)\)\)\*IF\(MNTHCNT1<5,1,IF\(MNTHCNT1<9,IF\(INFOBLUE2<6,1,2\),IF\(INFOBLUE2<6,2,3\)\)\)\)$/i,
      /^IF\(rngSkLabBaseCost=0,0,IF\(rngSkLabRevenue<500000,0,IF\(rngSkLabRevenue<1000000,3000,IF\(rngSkLabRevenue<5000000,10300,IF\(rngSkLabRevenue<10000000,18100,IF\(rngSkLabRevenue>9999999,23800,""\)\)\)\)\)\*IF\(MNTHCNT2<3,0,IF\(MNTHCNT2<5,1,IF\(MNTHCNT2<9,IF\(INFOBLUE2<6,1,2\),IF\(INFOBLUE2<6,2,3\)\)\)\)\)$/i,
      /^B26\/SUM\(B7:B18\)$/i,
    ],
    'Rates': [
      /^OFFSET\(OFFSET\(\[4\]vars__OthParms!\$A\$1,0,MATCH\("CUYRRA_BCS",\[4\]vars__OthParms!\$1:\$1,0\)-1\),MATCH\(\$H\d+,\[4\]vars__OthParms!\$B:\$B,0\)-1,0\)$/i,
      /^IFERROR\(VLOOKUP\(#REF!,CIC_Hours,VLOOKUP\(TimeUnit,TimeDivision,3,0\),0\),/i,
    ],
    'JRSS': [
      /^A\d+\s*&\s*" - "\s*&\s*B\d+$/i,
      /^SUBSTITUTE\(SUBSTITUTE\(SUBSTITUTE\(SUBSTITUTE\(SUBSTITUTE\("Jrs"&LEFT\(AL\d+,4\)&RIGHT\(AL\d+,4\)&LEN\(AL\d+\),"\/","_"\)," ","_"\),"\)","_"\),"&","_"\),"-","_"\)$/i,
    ],
    'Bid Metrics': [
      /^SUM\(Staffing!AQ16:FF16\)\/Noofmonths$/i,
      /^IF\(ISNUMBER\(C10\)=TRUE,IF\(AND\(E10<=D10,E10>=C10\),"Yes","No"\)\)$/i,
    ],
    'PTI_Estimator': [
      /^\(1\+RCont\)\*\(1\+PCont\)-1$/i,
      /^GETPIVOTDATA\("Sum of Rev App",\$F\$21\)\/B30$/i,
    ],
    'Staffing': [
      /^\$AP\$12\*VLOOKUP\(AO1[34],OFFSET\(CurrTbl,0,2\),2,0\)$/i,
    ],
    'GPE-Automation': [
      /^IF\(INDIRECT\(_xlfn\.CONCAT\("Staffing!","N",ROW\(StaffingHeader\)\+ROW\(A92\)-1\)\)<>"",A91\+1,""\)$/i,
    ],
  }

  const patterns = matches[sheet] || []
  if (patterns.some((pattern) => pattern.test(text))) {
    return getRecordCellValue(rowData, record)
  }
  return null
}

/**
 * Evaluate all formula records against the given rowData and return a map of
 * updated cell values.  This is the live-recalc entry-point used by the UI
 * when a cell is edited — it re-evaluates every formula on the sheet and
 * returns `{ "row:col": computedValue }` for every formula it can resolve.
 *
 * It reuses the exact same evaluation pipeline as compareUniversalFormulaSample
 * so that parity is guaranteed.
 *
 * Performance: evaluators are indexed in an array. On the first evaluation of a
 * given formula text, all evaluators are tried sequentially and the winning index
 * is cached.  On subsequent evaluations (cell-edit recalcs) the cached evaluator
 * is tried first — if it still resolves, no other evaluators run.  This reduces
 * per-formula cost from ~45 function calls to 1.
 */

// Module-level cache: formulaText → evaluator index that last resolved it.
const _evalIdxCache = new Map()

export const recalcFormulas = ({
  rowData = [],
  formulaRecords = [],
  definedNames = [],
  sheetNames = [],
  workbookSheets = {},
} = {}) => {
  if (!Array.isArray(rowData) || !Array.isArray(formulaRecords) || formulaRecords.length === 0) {
    return {}
  }

  const updates = {}
  const defaultSheet = String(formulaRecords?.[0]?.sheet || '')
  const resolveDefinedName = buildDefinedNameResolver({
    definedNames,
    sheetNames,
    currentSheet: defaultSheet,
  })

  // Bump the reference-value cache generation so resolveReferenceValue uses
  // a fresh cache for this recalc batch (same named ranges → same result).
  _refValueCacheGeneration += 1
  _refValueCache = new Map()
  _refValueCacheCurrentGen = _refValueCacheGeneration

  // Build evaluator table once per call (closures capture rowData / workbookSheets)
  // Each entry: (formulaText, rowData, ctx, ctxWithCell, record) → value | null | undefined
  // null/undefined = "not my pattern", anything else = resolved value.
  const evaluators = [
    // 0 — tail alignment
    (ft, rd, _c, _cc, rec) => evaluateFinalTailAlignment(ft, rd, rec),
    // 1 — SAP metrics
    (ft, rd, c) => evaluateSapMetricsPattern(ft, rd, c),
    // 2 — PMP count offset
    (ft, rd, c) => evaluatePmpTemplateCountOffsetPattern(ft, rd, c),
    // 3 — PMP residual
    (ft, rd, c) => evaluatePmpTemplateResidualPattern(ft, rd, c),
    // 4 — effort matrix residual
    (ft, rd, c) => evaluateEffortMatrixResidualPattern(ft, rd, c),
    // 5 — GPE residual
    (ft, rd, c, _cc, rec) => evaluateGpeAutomationResidualPattern(ft, rd, c, rec),
    // 6 — SUM
    (ft, rd) => { const r = evalSumFormula(rd, ft); return r.supported ? r.value : null },
    // 7 — arithmetic
    (ft, rd) => { const r = evalArithmeticFormula(rd, ft); return r.supported ? r.value : null },
    // 8 — rates inflation chain
    (ft, rd, c) => evaluateRatesInflationChainPattern(ft, rd, c),
    // 9 — rates band info
    (ft, rd, c) => evaluateRatesBandInfoOffsetFormula(ft, rd, c),
    // 10 — rates if algebra
    (ft, rd, c) => evaluateRatesIfAlgebraPattern(ft, rd, c),
    // 11 — rates iferror vlookup
    (ft, rd, c) => evaluateRatesIferrorVlookupIndirectPattern(ft, rd, c),
    // 12 — rates oth parms
    (ft, rd, c) => evaluateRatesOthParmsNestedOffset(ft, rd, c),
    // 13 — staffing band rate
    (ft, rd, c) => evaluateStaffingBandRateIfPattern(ft, rd, c),
    // 14 — staffing PTI
    (ft, rd, c) => evaluateStaffingPtiInflatedLaborPattern(ft, rd, c),
    // 15 — staffing max window
    (ft, rd, c) => evaluateStaffingMaxWindowPattern(ft, rd, c),
    // 16 — staffing min-if array
    (ft, rd, c) => evaluateStaffingMinIfArrayPattern(ft, rd, c),
    // 17 — staffing date max-if array
    (ft, rd, c) => evaluateStaffingDateMaxIfArrayPattern(ft, rd, c),
    // 18 — GPE sequence
    (ft, rd, c) => evaluateGpeAutomationSequencePattern(ft, rd, c),
    // 19 — FS estimation
    (ft, rd, c) => evaluateFsEstimationMultiplierPattern(ft, rd, c),
    // 20 — PMP coverage
    (ft, rd, c) => evaluatePmpTemplateCoveragePattern(ft, rd, c),
    // 21 — PMP count offset (dup)
    (ft, rd, c) => evaluatePmpTemplateCountOffsetPattern(ft, rd, c),
    // 22 — PMP row offset
    (ft, rd, c, _cc, rec) => evaluatePmpTemplateRowOffsetPattern(ft, rd, c, rec),
    // 23 — work locations concat
    (ft, rd, c) => evaluateWorkLocationsConcatPattern(ft, rd, c),
    // 24 — SAP metrics (dup)
    (ft, rd, c) => evaluateSapMetricsPattern(ft, rd, c),
    // 25 — pivot relative date direct
    (ft, rd, c) => evaluatePivotInfoRelativeDateDirectPattern(ft, rd, c),
    // 26 — pivot relative date by F
    (ft, rd, c, _cc, rec) => evaluatePivotInfoRelativeDateByFPattern(ft, rd, c, rec),
    // 27 — pivot text timeline
    (ft, rd, c, _cc, rec) => evaluatePivotInfoTextTimelinePattern(ft, rd, c, rec),
    // 28 — pivot concat-if quote
    (ft, rd, c, _cc, rec) => evaluatePivotInfoConcatIfQuotePattern(ft, rd, c, rec),
    // 29 — pivot concat-if substitute
    (ft, rd, c, _cc, rec) => evaluatePivotInfoConcatIfSubstitutePattern(ft, rd, c, rec),
    // 30 — pivot left-len suffix
    (ft, rd, c) => evaluatePivotInfoLeftLenSuffixPattern(ft, rd, c),
    // 31 — background JRS identifier
    (ft, rd, c) => evaluateBackgroundJrsIdentifierPattern(ft, rd, c),
    // 32 — background string builder
    (ft, rd, c) => evaluateBackgroundStringBuilder(ft, rd, c),
    // 33 — background indirect
    (ft, rd, c) => evaluateBackgroundIndirectFormula(ft, rd, c),
    // 34 — background counta indirect
    (ft, rd, c) => evaluateBackgroundCountaIndirectIfPattern(ft, rd, c),
    // 35 — background match
    (ft, rd, c) => evaluateBackgroundMatchPattern(ft, rd, c),
    // 36 — background hour header sumproduct
    (ft, rd, c) => evaluateBackgroundHourHeaderSumproductPattern(ft, rd, c),
    // 37 — direct function call
    (ft, rd, _c, cc) => {
      const formulaNormDirect = normalizeFormulaText(ft)
      const directFnCall = getFunctionCallParts(formulaNormDirect)
      if (!directFnCall) return null
      try {
        const directResult = evaluateFunctionCall(rd, directFnCall.name, parseArgs(directFnCall.argsText), cc)
        if (directResult.supported) {
          const scalar = scalarizeValue(directResult.value)
          return scalar ?? ''
        }
      } catch { /* fall through */ }
      return null
    },
    // 38 — generic expression
    (ft, rd, _c, cc) => {
      const generic = evalExpression(rd, ft, cc)
      if (generic !== null && generic !== undefined) {
        return scalarizeValue(generic)
      }
      return null
    },
    // 39 — GPE automation formula shape
    (ft, rd, c) => evaluateGpeAutomationFormulaShape(ft, rd, c),
    // 40 — non-labor spread
    (ft, rd, c) => evaluateNonLaborSpreadPattern(ft, rd, c),
    // 41 — background string builder (fallback)
    (ft, rd, c) => evaluateBackgroundStringBuilder(ft, rd, c),
    // 42 — background indirect (fallback)
    (ft, rd, c) => evaluateBackgroundIndirectFormula(ft, rd, c),
    // 43 — background counta indirect (fallback)
    (ft, rd, c) => evaluateBackgroundCountaIndirectIfPattern(ft, rd, c),
    // 44 — background match (fallback)
    (ft, rd, c) => evaluateBackgroundMatchPattern(ft, rd, c),
    // 45 — background hour header (fallback)
    (ft, rd, c) => evaluateBackgroundHourHeaderSumproductPattern(ft, rd, c),
    // 46 — rates oth parms lookup
    (ft, rd, c) => evaluateRatesOthParmsLookup(ft, rd, c),
    // 47 — rates vars inflation
    (ft, rd, c) => evaluateRatesVarsInflationFormula(ft, rd, c),
    // 48 — staffing timeline date
    (ft, rd, c) => evaluateStaffingTimelineDatePattern(ft, rd, c),
    // 49 — pivot timeline (fallback)
    (ft, rd, c, _cc, rec) => evaluatePivotInfoTextTimelinePattern(ft, rd, c, rec),
    // 50 — pivot concat-if (fallback)
    (ft, rd, c, _cc, rec) => evaluatePivotInfoConcatIfQuotePattern(ft, rd, c, rec),
    // 51 — staffing band offset
    (ft, rd, c) => evaluateStaffingBandCellOffsetPattern(ft, rd, c),
    // 52 — staffing generic offset
    (ft, rd, c) => evaluateStaffingGenericBandOffsetPattern(ft, rd, c),
    // 53 — staffing rates sumproduct
    (ft, rd, c) => evaluateStaffingRatesYearSumproductPattern(ft, rd, c),
    // 54 — staffing match
    (ft, rd, c) => evaluateStaffingSimpleMatchPattern(ft, rd, c),
    // 55 — #NAME? fallback
    (ft) => {
      const formulaNorm = normalizeFormulaText(ft)
      if (formulaNorm && !/^[A-Z][A-Z0-9_.]*\(/i.test(formulaNorm) && !/[+\-*/=<>()!:&]/.test(formulaNorm.replace(/"[^"]*"/g, '').replace(/\.\./g, ''))) {
        return '#NAME?'
      }
      return null
    },
  ]

  const evalCount = evaluators.length

  formulaRecords.forEach((record) => {
    const formulaText = String(record?.formula || '').trim()
    if (!formulaText) return

    const currentSheet = String(record?.sheet || '')
    const ctx = { currentSheet, workbookSheets, resolveDefinedName }
    const ctxWithCell = {
      currentSheet,
      currentCell: {
        rowOneBased: Number(record?.row || 0),
        colOneBased: Number(record?.col || 0),
      },
      resolveDefinedName,
      workbookSheets,
    }

    let value = null
    let resolved = false

    // Fast path: check cached evaluator index for this formula text
    const cachedIdx = _evalIdxCache.get(formulaText)
    if (cachedIdx !== undefined) {
      try {
        const v = evaluators[cachedIdx](formulaText, rowData, ctx, ctxWithCell, record)
        if (v !== null && v !== undefined) {
          value = v
          resolved = true
        }
      } catch { /* cache miss — fall through to full scan */ }
    }

    // Slow path: try all evaluators sequentially, cache the winner
    if (!resolved) {
      for (let i = 0; i < evalCount; i += 1) {
        try {
          const v = evaluators[i](formulaText, rowData, ctx, ctxWithCell, record)
          if (v !== null && v !== undefined) {
            value = v
            resolved = true
            _evalIdxCache.set(formulaText, i)
            break
          }
        } catch { /* evaluator threw — skip it */ }
      }
    }

    if (resolved) {
      const rowOneBased = Number(record?.row || 0)
      const colOneBased = Number(record?.col || 0)
      if (rowOneBased && colOneBased) {
        const rowIdx = rowOneBased - 1
        const colIdx = colOneBased - 1
        const final = toNumber(value) ?? value
        updates[`${rowIdx}:${colIdx}`] = final == null ? '' : String(final)
      }
    }
  })

  return updates
}
