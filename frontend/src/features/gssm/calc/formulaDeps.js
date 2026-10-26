/**
 * Incremental formula dependency resolver.
 *
 * Given an array of formulaRecords for a sheet, builds an index that maps
 * every referenced cell (row:col) to the set of formula records that depend
 * on it.  When a cell is edited, only the formulas that reference the edited
 * cell (directly or transitively through other formula cells) are recalculated.
 */

/* ── A1 helpers (duplicated from universalFormulaCalc to keep this module self-contained) ── */

const colToIndex = (letters) => {
  let value = 0
  const text = String(letters || '').toUpperCase()
  for (let i = 0; i < text.length; i += 1) {
    value = (value * 26) + (text.charCodeAt(i) - 64)
  }
  return value - 1 // 0-based
}

/**
 * Extract every cell and range A1-reference from a formula string.
 * Returns an array of { row, col } (0-based) for each referenced cell.
 * Ranges are expanded into every cell they cover (capped for sanity).
 */
const MAX_RANGE_CELLS = 5_000

const extractReferencedCells = (formulaText, sheetName, definedNameMap) => {
  let text = String(formulaText || '')
  const cells = []

  // Expand defined names into their range references before parsing A1 refs.
  // This ensures formulas like SUBTOTAL(9,TotalHoursRange) get proper deps.
  if (definedNameMap) {
    // Match word-boundary tokens that could be defined names (not preceded by ! or ')
    text = text.replace(/\b([A-Za-z_][A-Za-z0-9_.]*)\b/g, (match, token, offset) => {
      // Skip if preceded by sheet qualifier (! or ')
      if (offset > 0 && (text[offset - 1] === '!' || text[offset - 1] === "'")) return match
      const range = definedNameMap.get(token.toUpperCase())
      if (range) return range
      return match
    })
  }

  // Match optional sheet prefix, then cell or range reference
  // e.g. Staffing!B28, 'Imp TL'!$C$5, B28, $B$28, B28:D30
  const refRegex = /(?:(?:'(?:[^']|'')+'\s*!|[A-Za-z0-9_.]+\s*!)\s*)?\$?([A-Z]{1,3})\$?(\d{1,7})(?:\s*:\s*\$?([A-Z]{1,3})\$?(\d{1,7}))?/gi

  let match
  while ((match = refRegex.exec(text)) !== null) {
    // Extract optional sheet prefix to decide if this is same-sheet
    const fullMatch = match[0]
    const sheetPrefixMatch = fullMatch.match(/^(?:'((?:[^']|'')+)'\s*!|([A-Za-z0-9_.]+)\s*!)/i)
    if (sheetPrefixMatch) {
      const refSheet = (sheetPrefixMatch[1] || sheetPrefixMatch[2] || '').replace(/''/g, "'")
      if (refSheet.toUpperCase() !== sheetName.toUpperCase()) {
        // Cross-sheet reference — still track it but with a sheet qualifier
        // For now, skip cross-sheet deps (only track same-sheet for perf)
        continue
      }
    }

    const startCol = colToIndex(match[1])
    const startRow = Number(match[2]) - 1 // convert to 0-based
    const endCol = match[3] ? colToIndex(match[3]) : startCol
    const endRow = match[4] ? Number(match[4]) - 1 : startRow

    const rowSpan = Math.abs(endRow - startRow) + 1
    const colSpan = Math.abs(endCol - startCol) + 1
    if (rowSpan * colSpan > MAX_RANGE_CELLS) continue // skip enormous ranges

    const rMin = Math.min(startRow, endRow)
    const rMax = Math.max(startRow, endRow)
    const cMin = Math.min(startCol, endCol)
    const cMax = Math.max(startCol, endCol)

    for (let r = rMin; r <= rMax; r += 1) {
      for (let c = cMin; c <= cMax; c += 1) {
        cells.push({ row: r, col: c })
      }
    }
  }

  return cells
}

/**
 * Build a dependency index for one sheet's formula records.
 *
 * Returns:
 *   depIndex  – Map<"row:col", Set<formulaRecordIndex>>
 *               Maps each referenced cell to the indices of formulas that reference it.
 *   formulaPositions – Map<"row:col", formulaRecordIndex>
 *               Maps each formula cell to its record index (for transitive deps).
 */
export const buildDependencyIndex = (formulaRecords, sheetName, definedNames) => {
  const depIndex = new Map()       // "row:col" → Set<recordIdx>
  const formulaPositions = new Map() // "row:col" → recordIdx

  // Build a simple Map<UPPER_NAME, rangeString> for expanding defined names in formulas
  let definedNameMap = null
  if (Array.isArray(definedNames) && definedNames.length > 0) {
    definedNameMap = new Map()
    for (const entry of definedNames) {
      const name = String(entry?.name || '').trim().toUpperCase()
      if (!name) continue
      const ranges = Array.isArray(entry.ranges) ? entry.ranges : []
      if (ranges.length > 0) definedNameMap.set(name, ranges.join(','))
    }
  }

  formulaRecords.forEach((record, idx) => {
    const row1 = Number(record?.row || 0)
    const col1 = Number(record?.col || 0)
    if (!row1 || !col1) return

    const formulaKey = `${row1 - 1}:${col1 - 1}`
    formulaPositions.set(formulaKey, idx)

    const refs = extractReferencedCells(record.formula, sheetName, definedNameMap)
    for (const { row, col } of refs) {
      const key = `${row}:${col}`
      if (!depIndex.has(key)) depIndex.set(key, new Set())
      depIndex.get(key).add(idx)
    }
  })

  return { depIndex, formulaPositions }
}

/**
 * Given a set of edited cells (array of {row, col} 0-based), return the
 * subset of formulaRecords that need recalculation (direct + transitive).
 */
export const getAffectedFormulas = (editedCells, depIndex, formulaPositions, formulaRecords) => {
  const affected = new Set()   // record indices
  const visited = new Set()    // "row:col" keys already traversed

  const queue = editedCells.map(({ row, col }) => `${row}:${col}`)

  while (queue.length > 0) {
    const key = queue.pop()
    if (visited.has(key)) continue
    visited.add(key)

    const deps = depIndex.get(key)
    if (!deps) continue

    for (const idx of deps) {
      if (affected.has(idx)) continue
      affected.add(idx)

      // If this formula cell is itself referenced by other formulas, enqueue it
      const record = formulaRecords[idx]
      const row1 = Number(record?.row || 0)
      const col1 = Number(record?.col || 0)
      if (row1 && col1) {
        const formulaKey = `${row1 - 1}:${col1 - 1}`
        if (!visited.has(formulaKey)) {
          queue.push(formulaKey)
        }
      }
    }
  }

  return Array.from(affected).map((idx) => formulaRecords[idx])
}
