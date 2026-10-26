const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(numeric) ? numeric : null
}

const formatNumericByPattern = (value, patternRaw) => {
  const numeric = toNumber(value)
  if (numeric == null) return null

  const pattern = String(patternRaw || '').trim()
  if (!pattern) return null

  const plainIntegerPad = pattern.match(/^0+$/)
  if (plainIntegerPad) {
    const width = plainIntegerPad[0].length
    const rounded = Math.round(Math.abs(numeric))
    const sign = numeric < 0 ? '-' : ''
    return `${sign}${String(rounded).padStart(width, '0')}`
  }

  const decimalPad = pattern.match(/^(0+)\.(0+)$/)
  if (decimalPad) {
    const integerWidth = decimalPad[1].length
    const decimals = decimalPad[2].length
    const sign = numeric < 0 ? '-' : ''
    const abs = Math.abs(numeric)
    const fixed = abs.toFixed(decimals)
    const [intPart, fracPart] = fixed.split('.')
    return `${sign}${intPart.padStart(integerWidth, '0')}.${fracPart}`
  }

  const percentPad = pattern.match(/^(0+)(?:\.(0+))?%$/)
  if (percentPad) {
    const integerWidth = percentPad[1].length
    const decimals = percentPad[2] ? percentPad[2].length : 0
    const scaled = numeric * 100
    const sign = scaled < 0 ? '-' : ''
    const abs = Math.abs(scaled)
    const fixed = abs.toFixed(decimals)
    const [intPart, fracPart] = fixed.split('.')
    const paddedInt = intPart.padStart(integerWidth, '0')
    if (decimals > 0) return `${sign}${paddedInt}.${fracPart}%`
    return `${sign}${paddedInt}%`
  }

  return null
}

const asText = (value) => {
  if (value === null || value === undefined) return ''
  return String(value)
}

const isExcelError = (value) => /^#(N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NUM!|NULL!|ERROR!)/i.test(asText(value).trim())

const normalizedComparable = (value) => {
  const numeric = toNumber(value)
  if (numeric != null) return { kind: 'number', value: numeric }
  return { kind: 'text', value: asText(value).trim() }
}

const equalsExcel = (left, right) => {
  const a = normalizedComparable(left)
  const b = normalizedComparable(right)
  if (a.kind === 'number' && b.kind === 'number') return a.value === b.value
  return String(a.value).trim().toUpperCase() === String(b.value).trim().toUpperCase()
}

const flatten = (items) => {
  const out = []
  const stack = Array.isArray(items) ? [...items] : [items]
  while (stack.length) {
    const item = stack.shift()
    if (item && typeof item === 'object' && item.__type === 'range' && Array.isArray(item.values)) {
      stack.unshift(...item.values)
      continue
    }
    if (Array.isArray(item)) stack.unshift(...item)
    else out.push(item)
  }
  return out
}

const scalarArg = (value) => {
  if (value && typeof value === 'object' && value.__type === 'range') {
    if (Number(value.rowCount || 0) >= 1 && Number(value.colCount || 0) >= 1) {
      return value.values?.[0] ?? null
    }
    return null
  }
  return value
}

const rangeToMatrix = (rangeArg) => {
  if (!rangeArg || typeof rangeArg !== 'object' || rangeArg.__type !== 'range') return null
  const rowCount = Number(rangeArg.rowCount || 0)
  const colCount = Number(rangeArg.colCount || 0)
  if (rowCount <= 0 || colCount <= 0 || !Array.isArray(rangeArg.values)) return null
  const matrix = []
  for (let row = 0; row < rowCount; row += 1) {
    const start = row * colCount
    matrix.push(rangeArg.values.slice(start, start + colCount))
  }
  return matrix
}

const getRangeCell = (rangeArg, rowOffset, colOffset) => {
  if (!rangeArg || rangeArg.__type !== 'range') return null
  const rowCount = Number(rangeArg.rowCount || 0)
  const colCount = Number(rangeArg.colCount || 0)
  if (rowCount <= 0 || colCount <= 0) return null
  if (rowOffset < 0 || colOffset < 0 || rowOffset >= rowCount || colOffset >= colCount) return null
  const index = rowOffset * colCount + colOffset
  return rangeArg.values?.[index]
}

const materializePivotArea = (anchorRange, makeOffsetRange) => {
  if (!anchorRange || anchorRange.__type !== 'range' || typeof makeOffsetRange !== 'function') return null
  const area = makeOffsetRange(anchorRange, 1, 0, 1000, 80)
  if (!area || area.__type !== 'range') return null
  return area
}

const normalizeHeader = (value) => asText(value).trim().toLowerCase()

const findHeaderColumn = (pivotArea, targetHeader) => {
  const wanted = normalizeHeader(targetHeader).replace(/^sum of\s+/i, '')
  for (let col = 0; col < Number(pivotArea.colCount || 0); col += 1) {
    const header = normalizeHeader(getRangeCell(pivotArea, 0, col))
    const normalized = header.replace(/^sum of\s+/i, '')
    if (normalized && normalized === wanted) return col
  }
  return -1
}

const getPivotRows = (pivotArea) => {
  const rows = []
  const rowCount = Number(pivotArea.rowCount || 0)
  const colCount = Number(pivotArea.colCount || 0)
  for (let row = 1; row < rowCount; row += 1) {
    const values = []
    let nonEmpty = 0
    for (let col = 0; col < colCount; col += 1) {
      const value = getRangeCell(pivotArea, row, col)
      values.push(value)
      if (asText(value).trim() !== '') nonEmpty += 1
    }
    if (nonEmpty === 0) break
    rows.push(values)
  }
  return rows
}

const isTruthyExcel = (value) => {
  if (typeof value === 'boolean') return value
  const numeric = toNumber(value)
  if (numeric != null) return numeric !== 0
  const text = asText(value).trim().toUpperCase()
  if (text === 'TRUE') return true
  if (text === 'FALSE' || text === '') return false
  return Boolean(value)
}

const countIfMatches = (value, criteriaRaw) => {
  const criteria = String(criteriaRaw ?? '')
  const numeric = toNumber(value)

  if (/[*?]/.test(criteria)) {
    const escaped = criteria.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
    const regex = new RegExp(`^${escaped}$`, 'i')
    return regex.test(asText(value))
  }

  const match = criteria.match(/^(<=|>=|<>|=|<|>)(.*)$/)
  if (match) {
    const op = match[1]
    const rhsRaw = match[2]
    const rhsNum = toNumber(rhsRaw)
    const lhs = numeric
    const rhs = rhsNum
    if (lhs == null || rhs == null) return false
    if (op === '<=') return lhs <= rhs
    if (op === '>=') return lhs >= rhs
    if (op === '<>') return lhs !== rhs
    if (op === '=') return lhs === rhs
    if (op === '<') return lhs < rhs
    if (op === '>') return lhs > rhs
    return false
  }

  return equalsExcel(value, criteria)
}

const dateFromYmd = (year, month, day) => {
  const y = toNumber(scalarArg(year))
  const m = toNumber(scalarArg(month))
  const d = toNumber(scalarArg(day))
  if (y == null || m == null || d == null) return null
  const utc = Date.UTC(y, m - 1, d)
  const excelEpoch = Date.UTC(1899, 11, 30)
  return (utc - excelEpoch) / 86400000
}

const excelDateToDate = (serial) => {
  const num = toNumber(scalarArg(serial))
  if (num != null) {
    const whole = Math.floor(num)
    const excelEpoch = Date.UTC(1899, 11, 30)
    return new Date(excelEpoch + Math.round(whole * 86400000))
  }

  const text = String(serial ?? '').trim()
  if (!text) return null
  const parsed = Date.parse(text)
  if (Number.isFinite(parsed)) return new Date(parsed)
  return null
}

const adapters = {
  IF: ({ args }) => {
    const cond = scalarArg(args[0])
    if (isExcelError(cond)) return String(cond).trim()
    return isTruthyExcel(cond) ? args[1] : args[2]
  },
  AND: ({ args }) => args.every((value) => isTruthyExcel(value)),
  OR: ({ args }) => args.some((value) => isTruthyExcel(value)),
  NOT: ({ args }) => !isTruthyExcel(args[0]),
  ISNUMBER: ({ args }) => toNumber(args[0]) != null,
  ISERROR: ({ args }) => args[0] == null || (typeof args[0] === 'number' && Number.isNaN(args[0])) || isExcelError(args[0]),
  IFERROR: ({ args }) => {
    const first = args[0]
    const errored = first == null || (typeof first === 'number' && Number.isNaN(first)) || isExcelError(first)
    return errored ? args[1] : first
  },
  SUM: ({ args }) => {
    const flat = flatten(args)
    for (const v of flat) { if (isExcelError(v)) return asText(v).trim() }
    return flat.reduce((acc, value) => acc + (toNumber(value) ?? 0), 0)
  },
  MAX: ({ args }) => {
    const nums = flatten(args).map(toNumber).filter((value) => value != null)
    return nums.length ? Math.max(...nums) : 0
  },
  MIN: ({ args }) => {
    const nums = flatten(args).map(toNumber).filter((value) => value != null)
    return nums.length ? Math.min(...nums) : null
  },
  COUNTA: ({ args }) => flatten(args).filter((value) => asText(value).trim() !== '').length,
  COUNT: ({ args }) => flatten(args).map(toNumber).filter((value) => value != null).length,
  COUNTIF: ({ args }) => {
    const range = flatten(args[0])
    const criteria = scalarArg(args[1])
    return range.filter((value) => countIfMatches(value, criteria)).length
  },
  COUNTIFS: ({ args }) => {
    if (args.length < 2 || args.length % 2 !== 0) return null
    const ranges = []
    for (let i = 0; i < args.length; i += 2) {
      ranges.push({ values: flatten(args[i]), criteria: scalarArg(args[i + 1]) })
    }
    const length = ranges[0]?.values?.length || 0
    let count = 0
    for (let idx = 0; idx < length; idx += 1) {
      const ok = ranges.every((entry) => countIfMatches(entry.values[idx], entry.criteria))
      if (ok) count += 1
    }
    return count
  },
  SUMIF: ({ args }) => {
    const criteriaRange = flatten(args[0])
    const criteria = scalarArg(args[1])
    const sumRange = flatten(args[2] ?? args[0])
    let sum = 0
    for (let idx = 0; idx < criteriaRange.length; idx += 1) {
      if (countIfMatches(criteriaRange[idx], criteria)) {
        sum += toNumber(sumRange[idx]) ?? 0
      }
    }
    return sum
  },
  SUMPRODUCT: ({ args }) => {
    if (args.length === 0) return 0
    const arrays = args.map((item) => flatten(item).map((value) => toNumber(value) ?? 0))
    const length = arrays[0].length
    let total = 0
    for (let idx = 0; idx < length; idx += 1) {
      let product = 1
      for (const arr of arrays) {
        product *= arr[idx] ?? 0
      }
      total += product
    }
    return total
  },
  ROUND: ({ args }) => {
    const value = toNumber(args[0])
    const digits = toNumber(args[1]) ?? 0
    if (value == null) return null
    const factor = 10 ** digits
    return Math.round(value * factor) / factor
  },
  ROUNDUP: ({ args }) => {
    const value = toNumber(args[0])
    const digits = toNumber(args[1]) ?? 0
    if (value == null) return null
    const factor = 10 ** digits
    return Math.ceil(value * factor) / factor
  },
  CEILING: ({ args }) => {
    const value = toNumber(args[0])
    const significance = toNumber(args[1]) ?? 1
    if (value == null || significance === 0) return null
    return Math.ceil(value / significance) * significance
  },
  MOD: ({ args }) => {
    const a = toNumber(args[0])
    const b = toNumber(args[1])
    if (a == null || b == null || b === 0) return null
    return ((a % b) + b) % b
  },
  LEN: ({ args }) => asText(scalarArg(args[0])).length,
  LEFT: ({ args }) => asText(scalarArg(args[0])).slice(0, toNumber(scalarArg(args[1])) ?? 1),
  RIGHT: ({ args }) => {
    const text = asText(scalarArg(args[0]))
    const n = toNumber(scalarArg(args[1])) ?? 1
    return text.slice(Math.max(0, text.length - n))
  },
  MID: ({ args }) => {
    const text = asText(scalarArg(args[0]))
    const start = Math.max(1, toNumber(scalarArg(args[1])) ?? 1)
    const len = Math.max(0, toNumber(scalarArg(args[2])) ?? 0)
    return text.substr(start - 1, len)
  },
  TRIM: ({ args }) => asText(scalarArg(args[0])).trim().replace(/\s+/g, ' '),
  UPPER: ({ args }) => asText(scalarArg(args[0])).toUpperCase(),
  SEARCH: ({ args }) => {
    const needle = asText(scalarArg(args[0])).toLowerCase()
    const haystack = asText(scalarArg(args[1])).toLowerCase()
    const start = Math.max(1, toNumber(scalarArg(args[2])) ?? 1)
    const idx = haystack.indexOf(needle, start - 1)
    return idx >= 0 ? idx + 1 : null
  },
  SUBSTITUTE: ({ args }) => {
    const text = asText(scalarArg(args[0]))
    const oldText = asText(scalarArg(args[1]))
    const newText = asText(scalarArg(args[2]))
    const instance = toNumber(scalarArg(args[3]))
    if (instance == null) return text.split(oldText).join(newText)
    let found = 0
    return text.replace(new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (match) => {
      found += 1
      return found === instance ? newText : match
    })
  },
  CHAR: ({ args }) => String.fromCharCode(toNumber(scalarArg(args[0])) ?? 0),
  DATE: ({ args }) => dateFromYmd(args[0], args[1], args[2]),
  YEAR: ({ args }) => excelDateToDate(args[0])?.getUTCFullYear() ?? null,
  MONTH: ({ args }) => (excelDateToDate(args[0])?.getUTCMonth() ?? -1) + 1,
  DAY: ({ args }) => excelDateToDate(args[0])?.getUTCDate() ?? null,
  EDATE: ({ args }) => {
    const base = excelDateToDate(args[0])
    const months = toNumber(args[1])
    if (!base || months == null) return null
    const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate()))
    const excelEpoch = Date.UTC(1899, 11, 30)
    return (next.getTime() - excelEpoch) / 86400000
  },
  DATEDIF: ({ args }) => {
    const start = excelDateToDate(args[0])
    const end = excelDateToDate(args[1])
    const unit = asText(args[2]).toUpperCase()
    if (!start || !end) return null
    const ms = end.getTime() - start.getTime()
    if (unit === 'D') return Math.floor(ms / 86400000)
    if (unit === 'M') return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())
    if (unit === 'Y') return end.getUTCFullYear() - start.getUTCFullYear()
    return null
  },
  TEXT: ({ args }) => {
    const value = scalarArg(args[0])
    const formatRaw = asText(scalarArg(args[1])).trim()
    const format = formatRaw.toLowerCase()
    if (!format) return asText(value)
    const serial = toNumber(value)
    if (serial == null) return asText(value)
    // Date format patterns
    const date = excelDateToDate(serial)
    if (date) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      const day = date.getUTCDate()
      const month0 = date.getUTCMonth()
      const year = date.getUTCFullYear()
      const year2 = String(year).slice(-2)
      if (format === 'd-mmm-yy') return `${day}-${months[month0]}-${year2}`
      if (format === 'dd-mmm-yy') return `${String(day).padStart(2, '0')}-${months[month0]}-${year2}`
      if (format === 'mmm-yy') return `${months[month0]}-${year2}`
      if (format === 'mmm-yyyy' || format === 'mmm yyyy') return `${months[month0]}-${year}`
      if (format === 'dd/mm/yyyy') return `${String(day).padStart(2, '0')}/${String(month0 + 1).padStart(2, '0')}/${year}`
      if (format === 'mm/dd/yyyy') return `${String(month0 + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`
      if (format === 'dd-mmm-yyyy') return `${String(day).padStart(2, '0')}-${months[month0]}-${year}`
      if (format === 'd-mmm-yyyy') return `${day}-${months[month0]}-${year}`
      if (format === 'yyyy-mm-dd') return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (format === 'mmmm yyyy') return `${fullMonths[month0]} ${year}`
      if (format === 'mmm') return months[month0]
      if (format === 'mmmm') return fullMonths[month0]
      if (format === 'yy') return year2
      if (format === 'yyyy') return String(year)
      if (format === 'dd') return String(day).padStart(2, '0')
      if (format === 'd') return String(day)
      if (format === 'mm') return String(month0 + 1).padStart(2, '0')
      if (format === 'm') return String(month0 + 1)
      // Generic date format: replace tokens
      let result = asText(scalarArg(args[1])).trim()
      result = result.replace(/yyyy/gi, String(year))
      result = result.replace(/yy/gi, year2)
      result = result.replace(/mmmm/gi, fullMonths[month0])
      result = result.replace(/mmm/gi, months[month0])
      result = result.replace(/mm/gi, String(month0 + 1).padStart(2, '0'))
      result = result.replace(/m/gi, String(month0 + 1))
      result = result.replace(/dd/gi, String(day).padStart(2, '0'))
      result = result.replace(/d/gi, String(day))
      return result
    }
    // Number format patterns
    if (format === '0' || format === '#') return String(Math.round(serial))
    if (format === '0.0') return serial.toFixed(1)
    if (format === '0.00') return serial.toFixed(2)
    if (format === '0.000') return serial.toFixed(3)
    if (format === '0%' || format === '0.0%') {
      const pct = serial * 100
      const decimals = format === '0%' ? 0 : 1
      return pct.toFixed(decimals) + '%'
    }
    if (format === '#,##0') return Math.round(serial).toLocaleString('en-US')
    if (format === '#,##0.00') return serial.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const patterned = formatNumericByPattern(serial, formatRaw)
    if (patterned != null) return patterned

    return asText(value)
  },
  SUBTOTAL: ({ args }) => {
    const fnCode = toNumber(args[0])
    const data = flatten(args.slice(1))
    if (fnCode === 9 || fnCode === 109) {
      return data.reduce((acc, value) => acc + (toNumber(value) ?? 0), 0)
    }
    if (fnCode === 1 || fnCode === 101) {
      const nums = data.map(toNumber).filter((value) => value != null)
      if (!nums.length) return null
      return nums.reduce((acc, value) => acc + value, 0) / nums.length
    }
    if (fnCode === 2 || fnCode === 102) {
      return data.map(toNumber).filter((value) => value != null).length
    }
    return null
  },
  ROW: ({ args, currentCell }) => {
    if (!args.length || args[0] == null) return Number(currentCell?.rowOneBased || 0) || null
    if (args[0] && typeof args[0] === 'object' && args[0].__type === 'range') {
      return Number(args[0].startRow || 0) || null
    }
    return null
  },
  COLUMN: ({ args, currentCell }) => {
    if (!args.length || args[0] == null) return Number(currentCell?.colOneBased || 0) || null
    if (args[0] && typeof args[0] === 'object' && args[0].__type === 'range') {
      return Number(args[0].startCol + 1 || 0) || null
    }
    return null
  },
  ROWS: ({ args }) => {
    const target = args[0]
    if (target && typeof target === 'object' && target.__type === 'range') {
      return Number(target.rowCount || 0)
    }
    if (Array.isArray(target)) return target.length
    return 1
  },
  MATCH: ({ args }) => {
    const lookupValue = scalarArg(args[0])
    const arrayArg = args[1]
    const matchType = toNumber(scalarArg(args[2])) ?? 0
    const values = flatten(arrayArg)
    if (!values.length) return '#N/A'

    if (matchType === 0) {
      const index = values.findIndex((value) => equalsExcel(value, lookupValue))
      return index >= 0 ? index + 1 : '#N/A'
    }

    const target = toNumber(lookupValue)
    const nums = values.map(toNumber)
    if (target == null || nums.some((value) => value == null)) return '#N/A'
    let best = null
    nums.forEach((value, idx) => {
      if (matchType > 0 && value <= target) {
        if (best == null || value > nums[best]) best = idx
      }
      if (matchType < 0 && value >= target) {
        if (best == null || value < nums[best]) best = idx
      }
    })
    return best == null ? '#N/A' : best + 1
  },
  INDEX: ({ args }) => {
    const matrix = rangeToMatrix(args[0])
    if (!matrix) return null
    const rowNum = Math.max(1, toNumber(args[1]) ?? 1)
    const colNum = Math.max(1, toNumber(args[2]) ?? 1)
    return matrix[rowNum - 1]?.[colNum - 1] ?? null
  },
  VLOOKUP: ({ args }) => {
    const lookupValue = scalarArg(args[0])
    const matrix = rangeToMatrix(args[1])
    const colIndex = Math.max(1, toNumber(scalarArg(args[2])) ?? 1)
    const rangeLookup = args.length >= 4 ? isTruthyExcel(scalarArg(args[3])) : true
    if (!matrix || !matrix.length) return '#N/A'

    if (!rangeLookup) {
      const row = matrix.find((entry) => equalsExcel(entry?.[0], lookupValue))
      return row ? row[colIndex - 1] : '#N/A'
    }

    const lookupNum = toNumber(lookupValue)
    if (lookupNum == null) return '#N/A'
    let bestRow = null
    let bestValue = null
    matrix.forEach((entry) => {
      const first = toNumber(entry?.[0])
      if (first == null || first > lookupNum) return
      if (bestValue == null || first > bestValue) {
        bestValue = first
        bestRow = entry
      }
    })
    return bestRow ? bestRow[colIndex - 1] : '#N/A'
  },
  HLOOKUP: ({ args }) => {
    const lookupValue = scalarArg(args[0])
    const matrix = rangeToMatrix(args[1])
    const rowIndex = Math.max(1, toNumber(scalarArg(args[2])) ?? 1)
    const rangeLookup = args.length >= 4 ? isTruthyExcel(scalarArg(args[3])) : true
    if (!matrix || !matrix.length) return '#N/A'

    const firstRow = matrix[0] || []
    let column = -1
    if (!rangeLookup) {
      column = firstRow.findIndex((value) => equalsExcel(value, lookupValue))
    } else {
      const lookupNum = toNumber(lookupValue)
      if (lookupNum == null) return '#N/A'
      let bestValue = null
      firstRow.forEach((value, idx) => {
        const num = toNumber(value)
        if (num == null || num > lookupNum) return
        if (bestValue == null || num > bestValue) {
          bestValue = num
          column = idx
        }
      })
    }
    if (column < 0) return '#N/A'
    return matrix[rowIndex - 1]?.[column] ?? '#N/A'
  },
  GETPIVOTDATA: ({ args, makeOffsetRange }) => {
    const measure = asText(args[0]).trim()
    const anchor = args[1]
    const pivotArea = materializePivotArea(anchor, makeOffsetRange)
    if (!pivotArea) return null

    const measureCol = findHeaderColumn(pivotArea, measure)
    if (measureCol < 0) return null

    const rows = getPivotRows(pivotArea)
    if (!rows.length) return null

    const filters = []
    for (let index = 2; index < args.length; index += 2) {
      const field = asText(args[index]).trim()
      const value = args[index + 1]
      if (!field) continue
      const fieldCol = findHeaderColumn(pivotArea, field)
      if (fieldCol < 0) continue
      filters.push({ fieldCol, value })
    }

    let candidates = rows
    if (filters.length > 0) {
      candidates = rows.filter((row) => filters.every((f) => asText(row[f.fieldCol]) === asText(f.value)))
    }

    const grandTotal = candidates.find((row) => row.some((value) => /grand\s*total/i.test(asText(value))))
    const targetRow = grandTotal || candidates[0] || rows.find((row) => row.some((value) => /grand\s*total/i.test(asText(value)))) || rows[0]
    return targetRow?.[measureCol] ?? null
  },
  CONCATIF: ({ args }) => {
    const source = flatten(args[0])
    const criteria = asText(scalarArg(args[1]))
    const delimiter = args.length >= 4 ? asText(args[3]) : ''
    const filtered = source
      .map((value) => asText(value).trim())
      .filter((value) => value && (!criteria || value.toUpperCase().includes(criteria.toUpperCase())))
    return filtered.join(delimiter)
  },
  INFLATEDLABOR: ({ args }) => {
    const base = toNumber(args[0]) ?? 0
    const inflationSeries = flatten(args[1]).map((value) => toNumber(value)).filter((value) => value != null)
    const indexRaw = toNumber(args[3])
    if (!inflationSeries.length) return base
    if (indexRaw != null && indexRaw > 0 && indexRaw <= inflationSeries.length) {
      const factor = 1 + inflationSeries[indexRaw - 1]
      return base * factor
    }
    const avgInflation = inflationSeries.reduce((acc, value) => acc + value, 0) / inflationSeries.length
    return base * (1 + avgInflation)
  },
  INDIRECT: ({ args, resolveReference }) => {
    const target = asText(args[0]).trim()
    if (!target || typeof resolveReference !== 'function') return null
    const resolved = resolveReference(target)
    if (!resolved) return null
    return resolved
  },
  OFFSET: ({ args, makeOffsetRange }) => {
    if (typeof makeOffsetRange !== 'function') return null
    const baseRef = args[0]
    // If row or col offset is an Excel error, propagate it
    const rawRow = scalarArg(args[1])
    const rawCol = scalarArg(args[2])
    if (isExcelError(rawRow)) return asText(rawRow).trim()
    if (isExcelError(rawCol)) return asText(rawCol).trim()
    const rowOffset = toNumber(rawRow) ?? 0
    const colOffset = toNumber(rawCol) ?? 0
    const height = args.length >= 4 ? (toNumber(scalarArg(args[3])) ?? null) : null
    const width = args.length >= 5 ? (toNumber(scalarArg(args[4])) ?? null) : null
    return makeOffsetRange(baseRef, rowOffset, colOffset, height, width)
  },
  NA: () => null,
  XLFN_CONCAT: ({ args }) => args.map(asText).join(''),
  _XLFN_CONCAT: ({ args }) => args.map(asText).join(''),
  XLFN_NUMBERVALUE: ({ args }) => toNumber(args[0]),
  _XLFN_NUMBERVALUE: ({ args }) => toNumber(args[0]),
  CONTAINS: ({ args }) => asText(scalarArg(args[0])).toLowerCase().includes(asText(scalarArg(args[1])).toLowerCase()),
}

const unsupportedAdapters = {
}

export const excelFunctionCatalog = {
  implemented: Object.keys(adapters),
  unsupported: Object.keys(unsupportedAdapters),
  intent: unsupportedAdapters,
}

export const runExcelAdapter = (name, payload) => {
  const normalized = String(name || '').toUpperCase().replace(/\./g, '_')
  const adapter = adapters[normalized]
  if (!adapter) {
    return { supported: false, value: null, reason: unsupportedAdapters[normalized]?.intent || 'unsupported_function' }
  }

  try {
    const value = adapter(payload || {})
    return { supported: true, value }
  } catch {
    return { supported: false, value: null, reason: 'adapter_error' }
  }
}
