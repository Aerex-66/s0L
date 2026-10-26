/**
 * Pure cell-reference utilities — zero React dependencies.
 */

/**
 * Find the Staffing header row (0-based) by locating the row with "Rollout"
 * in c0 AND "Fees" elsewhere. Returns { headerRow, dataStartRow }.
 * Falls back to { headerRow: 26, dataStartRow: 27 } if not found.
 */
export const findStaffingLayout = (staffingRows) => {
  if (!Array.isArray(staffingRows)) return { headerRow: 26, dataStartRow: 27 }
  const limit = Math.min(staffingRows.length, 60)
  for (let r = 0; r < limit; r++) {
    const row = staffingRows[r]
    if (!row) continue
    if (String(row.c0 || '').trim() !== 'Rollout') continue
    // Confirm with a second header to avoid false positives on data rows
    for (let c = 1; c < 80; c++) {
      if (String(row[`c${c}`] || '').trim() === 'Fees') {
        return { headerRow: r, dataStartRow: r + 1 }
      }
    }
  }
  return { headerRow: 26, dataStartRow: 27 }
}

export const colToLabel = (colIndex) => {
  let col = colIndex + 1
  let label = ''
  while (col > 0) {
    const mod = (col - 1) % 26
    label = String.fromCharCode(65 + mod) + label
    col = Math.floor((col - 1) / 26)
  }
  return label
}

export const toA1 = (rowIndex, colIndex) => `${colToLabel(colIndex)}${rowIndex + 1}`

export const formatCellValue = (value) => {
  if (value && typeof value === 'object' && value.type) {
    return `#${value.type}`
  }
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toLocaleDateString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
