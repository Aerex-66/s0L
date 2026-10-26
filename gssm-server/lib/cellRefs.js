/**
 * Cell / range reference helpers — A1 notation, range parsing.
 */

export const colToLabel = (colIndex) => {
  let col = Number(colIndex || 0)
  let label = ''
  while (col > 0) {
    const mod = (col - 1) % 26
    label = String.fromCharCode(65 + mod) + label
    col = Math.floor((col - 1) / 26)
  }
  return label || 'A'
}

export const toA1 = (rowIndexZeroBased, colIndexZeroBased) =>
  `${colToLabel(Number(colIndexZeroBased || 0) + 1)}${Number(rowIndexZeroBased || 0) + 1}`

export const parseRangeRef = (ref) => {
  const match = String(ref || '').match(/([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?/i)
  if (!match) return null
  const toNumber = (col) => col.toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0)
  const startCol = toNumber(match[1])
  const startRow = Number(match[2])
  const endCol = match[3] ? toNumber(match[3]) : startCol
  const endRow = match[4] ? Number(match[4]) : startRow
  return { startCol, startRow, endCol, endRow }
}

export const parseSheetRef = (formula, fallbackSheet) => {
  const raw = String(formula || '').trim().replace(/^=/, '')
  const match = raw.match(/^(?:'([^']+)'|([^'!]+))?!?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i)
  if (!match) return null
  const sheetName = match[1] || match[2] || fallbackSheet
  const endCol = match[5] || match[3]
  const endRow = match[6] || match[4]
  const range = parseRangeRef(`${match[3]}${match[4]}:${endCol}${endRow}`)
  if (!sheetName || !range) return null
  return { sheetName, range }
}
