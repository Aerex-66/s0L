/**
 * parsePivotInfo.js — Parse the PivotInfo sheet into structured pivot definitions.
 *
 * The PivotInfo sheet (hidden in Excel) stores pivot table recipes:
 *   Col A = Grouping name   (e.g. "STANDARD", "WWGPE", "Deal Financials")
 *   Col B = Pivot table name (e.g. "WWGPE by Month", "Band Mix")
 *   Col C = Field name (source column in Staffing)
 *   Col D = Caption (display label in the pivot output)
 *   Col E = Orientation: "Row" | "Column" | "Page" | "Data"
 *   Col F = Position (sort order within orientation)
 *   Col G = Aggregation function: "Sum" | "Average" | "Count" | "Max" | "Min"
 *   Col H = Calculated field formula (e.g. "=Fees/Hours")
 *   Col I = Exclude-only items (comma-separated)
 *   Col J = Include-only items (comma-separated)
 *   Col K = Hide row subtotals (1 = yes)
 *   Col L = Data field orientation: "Column" | "Row"
 *   Col M = Data field calculation (e.g. "xlPercentOfColumn", "xlNoAdditionalCalculation")
 *   Col N = Data field position
 *   Col O = Pivot item ordering (comma-separated)
 *
 * Row 1 is the header row (Group Name / Pivot Name / Field Name / ...).
 * Data rows start from row 2.
 *
 * Returns: Map<groupingName, Array<{ pivotName, fields: Array<fieldDef> }>>
 */

const toText = (v) => (v == null ? '' : String(v).trim())

/**
 * Parse PivotInfo sheet rowData into structured groupings.
 * @param {Array} pivotInfoRows - sparse row array from workbookDataRef.rowDataBySheet['PivotInfo']
 * @returns {{ groupings: Object, pivots: Array }}
 *   groupings: { [groupName]: [{ pivotName, fields }] }
 *   pivots: flat array of all pivot defs with their grouping
 */
export function parsePivotInfo(pivotInfoRows) {
  if (!pivotInfoRows || pivotInfoRows.length < 2) return { groupings: {}, pivots: [] }

  const groupings = {}  // groupName → [{ pivotName, fields: [...] }]
  const pivotMap = {}    // "groupName\0pivotName" → { pivotName, grouping, fields: [...] }

  for (let r = 1; r < pivotInfoRows.length; r++) {
    const row = pivotInfoRows[r]
    if (!row) continue

    const grouping = toText(row.c0)
    const pivotName = toText(row.c1)
    if (!grouping || !pivotName) continue

    // Skip the header row definition itself
    if (grouping === 'Group Name' && pivotName === 'Pivot Name') continue

    const fieldName = toText(row.c2)
    const caption = toText(row.c3)
    const orientation = toText(row.c4).toLowerCase()
    const position = parseInt(toText(row.c5), 10) || 0
    const aggFunction = toText(row.c6).toLowerCase()
    const formula = toText(row.c7)
    const excludeItems = toText(row.c8)
    const includeItems = toText(row.c9)
    const hideSubtotals = toText(row.c10) === '1'
    const dataOrientation = toText(row.c11).toLowerCase()
    const dataCalculation = toText(row.c12)
    const dataPosition = parseInt(toText(row.c13), 10) || 0
    const itemOrdering = toText(row.c14)

    const fieldDef = {
      fieldName,
      caption: caption || fieldName,
      orientation,  // 'row' | 'column' | 'page' | 'data'
      position,
      aggFunction: aggFunction || 'sum',
      formula,
      excludeItems: excludeItems ? excludeItems.split(',').map((s) => s.trim()).filter(Boolean) : [],
      includeItems: includeItems ? includeItems.split(',').map((s) => s.trim()).filter(Boolean) : [],
      hideSubtotals,
      dataOrientation,
      dataCalculation,
      dataPosition,
      itemOrdering: itemOrdering ? itemOrdering.split(',').map((s) => s.trim()).filter(Boolean) : [],
    }

    const key = `${grouping}\x00${pivotName}`
    if (!pivotMap[key]) {
      pivotMap[key] = {
        pivotName,
        grouping,
        fields: [],
      }
    }
    pivotMap[key].fields.push(fieldDef)
  }

  // Organize into groupings
  const pivots = []
  for (const def of Object.values(pivotMap)) {
    // Sort fields by orientation then position
    def.fields.sort((a, b) => {
      const orientOrder = { page: 0, row: 1, column: 2, data: 3 }
      const oa = orientOrder[a.orientation] ?? 4
      const ob = orientOrder[b.orientation] ?? 4
      if (oa !== ob) return oa - ob
      return a.position - b.position
    })

    if (!groupings[def.grouping]) {
      groupings[def.grouping] = []
    }
    groupings[def.grouping].push(def)
    pivots.push(def)
  }

  // Sort pivots within each grouping alphabetically
  for (const group of Object.values(groupings)) {
    group.sort((a, b) => a.pivotName.localeCompare(b.pivotName))
  }

  return { groupings, pivots }
}

/**
 * Execute a PivotInfo-defined pivot against extracted Staffing data rows.
 *
 * @param {Array} dataRows - array of row objects from extractStaffingRows
 * @param {Object} pivotDef - parsed pivot definition from parsePivotInfo
 * @returns {{ headers, rows, totals, meta }}
 */
export function executePivotInfoPivot(dataRows, pivotDef) {
  const { fields } = pivotDef

  // Classify fields
  const rowFields = fields.filter((f) => f.orientation === 'row').sort((a, b) => a.position - b.position)
  const colFields = fields.filter((f) => f.orientation === 'column').sort((a, b) => a.position - b.position)
  const pageFields = fields.filter((f) => f.orientation === 'page').sort((a, b) => a.position - b.position)
  const dataFields = fields.filter((f) => f.orientation === 'data').sort((a, b) => a.position - b.position)

  // Apply page filters (include-only filters)
  let filtered = dataRows
  for (const pf of pageFields) {
    if (pf.includeItems.length > 0) {
      const allowed = new Set(pf.includeItems.map((s) => s.toLowerCase()))
      filtered = filtered.filter((row) => {
        const val = String(row[pf.fieldName] ?? '').trim().toLowerCase()
        return allowed.has(val)
      })
    }
    if (pf.excludeItems.length > 0) {
      const excluded = new Set(pf.excludeItems.map((s) => s.toLowerCase()))
      filtered = filtered.filter((row) => {
        const val = String(row[pf.fieldName] ?? '').trim().toLowerCase()
        return !excluded.has(val)
      })
    }
  }

  // Also apply row/col field include/exclude filters
  for (const rf of [...rowFields, ...colFields]) {
    if (rf.includeItems.length > 0) {
      const allowed = new Set(rf.includeItems.map((s) => s.toLowerCase()))
      filtered = filtered.filter((row) => {
        const val = String(row[rf.fieldName] ?? '').trim().toLowerCase()
        return allowed.has(val)
      })
    }
    if (rf.excludeItems.length > 0) {
      const excluded = new Set(rf.excludeItems.map((s) => s.toLowerCase()))
      filtered = filtered.filter((row) => {
        const val = String(row[rf.fieldName] ?? '').trim().toLowerCase()
        return !excluded.has(val)
      })
    }
  }

  // Build row group keys
  const groupKeyFields = rowFields.map((f) => f.fieldName)

  // Aggregate
  const groups = new Map()
  for (const row of filtered) {
    const keyParts = groupKeyFields.map((f) => String(row[f] ?? '').trim() || '(blank)')
    const keyStr = keyParts.join('\x00')

    let group = groups.get(keyStr)
    if (!group) {
      const key = {}
      groupKeyFields.forEach((f, i) => { key[f] = keyParts[i] })
      group = { key, agg: {}, _count: 0 }
      for (const df of dataFields) {
        group.agg[df.caption] = 0
      }
      groups.set(keyStr, group)
    }
    group._count += 1

    for (const df of dataFields) {
      const raw = toNum(row[df.fieldName])
      const fn = df.aggFunction
      if (fn === 'sum' || fn === 'average') {
        group.agg[df.caption] = (group.agg[df.caption] || 0) + raw
      } else if (fn === 'max') {
        group.agg[df.caption] = Math.max(group.agg[df.caption] || -Infinity, raw)
      } else if (fn === 'min') {
        if (group._count === 1) group.agg[df.caption] = raw
        else group.agg[df.caption] = Math.min(group.agg[df.caption], raw)
      } else if (fn === 'count') {
        group.agg[df.caption] = group._count
      } else {
        // Default sum
        group.agg[df.caption] = (group.agg[df.caption] || 0) + raw
      }
    }
  }

  // Post-process averages
  for (const g of groups.values()) {
    for (const df of dataFields) {
      if (df.aggFunction === 'average' && g._count > 0) {
        g.agg[df.caption] /= g._count
      }
    }
  }

  // Handle calculated fields (formulas like =Fees/Hours)
  for (const g of groups.values()) {
    for (const df of dataFields) {
      if (df.formula) {
        try {
          const expr = df.formula.replace(/^=/, '')
          // Simple formula evaluation: replace field references with values
          let evalExpr = expr
          for (const dfo of dataFields) {
            const re = new RegExp(`'?${escapeRegExp(dfo.fieldName)}'?`, 'gi')
            evalExpr = evalExpr.replace(re, String(g.agg[dfo.caption] || 0))
          }
          // Also try caption-based references
          for (const dfo of dataFields) {
            const re = new RegExp(`'?${escapeRegExp(dfo.caption)}'?`, 'gi')
            evalExpr = evalExpr.replace(re, String(g.agg[dfo.caption] || 0))
          }
          // eslint-disable-next-line no-eval
          const calcResult = Function(`"use strict"; return (${evalExpr})`)()
          if (Number.isFinite(calcResult)) {
            g.agg[df.caption] = calcResult
          }
        } catch {
          // Formula eval failed — keep aggregated value
        }
      }
    }
  }

  // Handle percent-of-column calculations
  const colTotals = {}
  for (const df of dataFields) {
    colTotals[df.caption] = 0
    for (const g of groups.values()) {
      colTotals[df.caption] += g.agg[df.caption] || 0
    }
  }

  for (const df of dataFields) {
    if (df.dataCalculation === 'xlPercentOfColumn') {
      for (const g of groups.values()) {
        const total = colTotals[df.caption]
        g.agg[df.caption] = total !== 0 ? (g.agg[df.caption] / total) : 0
      }
    }
  }

  // Sort by item ordering if specified, otherwise alphabetical
  const sortedGroups = Array.from(groups.values())
  if (rowFields.length > 0 && rowFields[0].itemOrdering.length > 0) {
    const order = rowFields[0].itemOrdering
    const orderMap = new Map(order.map((item, idx) => [item.toLowerCase(), idx]))
    sortedGroups.sort((a, b) => {
      const ak = (a.key[rowFields[0].fieldName] || '').toLowerCase()
      const bk = (b.key[rowFields[0].fieldName] || '').toLowerCase()
      const ai = orderMap.has(ak) ? orderMap.get(ak) : 999
      const bi = orderMap.has(bk) ? orderMap.get(bk) : 999
      return ai - bi
    })
  } else {
    sortedGroups.sort((a, b) => {
      for (const f of groupKeyFields) {
        const cmp = String(a.key[f]).localeCompare(String(b.key[f]))
        if (cmp !== 0) return cmp
      }
      return 0
    })
  }

  // Grand totals
  const totals = {}
  for (const df of dataFields) {
    if (df.dataCalculation === 'xlPercentOfColumn') {
      totals[df.caption] = 1 // 100%
    } else if (df.formula) {
      // Recalculate formula on totals
      let total = 0
      for (const g of sortedGroups) total += g.agg[df.caption] || 0
      totals[df.caption] = total
    } else {
      let total = 0
      for (const g of sortedGroups) total += g.agg[df.caption] || 0
      totals[df.caption] = total
    }
  }

  return {
    pivotName: pivotDef.pivotName,
    grouping: pivotDef.grouping,
    rowFields: rowFields.map((f) => ({ fieldName: f.fieldName, caption: f.caption })),
    colFields: colFields.map((f) => ({ fieldName: f.fieldName, caption: f.caption })),
    pageFields: pageFields.map((f) => ({
      fieldName: f.fieldName,
      caption: f.caption,
      includeItems: f.includeItems,
    })),
    dataFields: dataFields.map((f) => ({
      caption: f.caption,
      aggFunction: f.aggFunction,
      isPercent: f.dataCalculation === 'xlPercentOfColumn',
      formula: f.formula,
    })),
    groups: sortedGroups,
    totals,
    sourceRowCount: filtered.length,
    totalRowCount: dataRows.length,
  }
}

function toNum(v) {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ──────────────────────────────────────────────────────────────
   flattenPivotToGrid — convert pivot result into a 2D cell grid
   that matches exactly how Excel renders a PivotTable.

   Layout (same as VBA PivotMaker output):
     Row 0: empty
     Row 1: empty
     Row 2: "Data" label above first data column (column group header)
     Row 3: row-field captions + data-field captions
     Rows 4+: hierarchical data rows with subtotals
     Last row: Grand Total
   ────────────────────────────────────────────────────────────── */

/**
 * @param {Object} result — from executePivotInfoPivot()
 * @returns {{ grid: Array<Array<any>>, colCount: number, rowCount: number,
 *             headerRowEnd: number, dataColStart: number }}
 *   grid[r][c] = cell value (string/number/null)
 */
export function flattenPivotToGrid(result) {
  const { rowFields, colFields, dataFields, groups, totals } = result

  // Determine if there's a column orientation (multi-company pivots)
  const hasColField = colFields.length > 0

  // Collect unique column-field values
  let colFieldValues = []
  if (hasColField) {
    const seen = new Set()
    for (const g of groups) {
      const cv = g.key[colFields[0].fieldName] || '(blank)'
      if (!seen.has(cv)) { seen.add(cv); colFieldValues.push(cv) }
    }
  }

  // Column layout:
  //   [rowField1, rowField2, ..., dataField1, dataField2, ...]
  // With column orientation:
  //   [rowField1, ..., ColVal1_DF1, ColVal1_DF2, ..., ColVal2_DF1, ..., Total_DF1, Total_DF2, ...]
  const rowFieldCount = rowFields.length
  let dataColumns = []  // each: { label, colValue (or null for total), dataCaption }
  if (hasColField && colFieldValues.length > 0) {
    for (const cv of colFieldValues) {
      for (const df of dataFields) {
        dataColumns.push({ label: df.caption, colValue: cv, dataCaption: df.caption })
      }
    }
    // Total columns
    for (const df of dataFields) {
      dataColumns.push({ label: `Total ${df.caption}`, colValue: null, dataCaption: df.caption })
    }
  } else {
    for (const df of dataFields) {
      dataColumns.push({ label: df.caption, colValue: null, dataCaption: df.caption })
    }
  }

  const colCount = rowFieldCount + dataColumns.length
  const grid = []

  // Row 0 & 1: empty
  grid.push(new Array(colCount).fill(null))
  grid.push(new Array(colCount).fill(null))

  // Row 2: column group header — "Data" or company names above their groups
  const row2 = new Array(colCount).fill(null)
  if (hasColField && colFieldValues.length > 0) {
    // Company name above each group
    let colIdx = rowFieldCount
    for (const cv of colFieldValues) {
      row2[colIdx] = cv
      colIdx += dataFields.length
    }
    // "Total" above total group
    row2[colIdx] = 'Total'
  } else {
    // Just "Data" above the first data column
    if (dataColumns.length > 0) row2[rowFieldCount] = 'Data'
  }
  grid.push(row2)

  // Row 3: field caption headers
  const row3 = new Array(colCount).fill(null)
  for (let i = 0; i < rowFields.length; i++) {
    row3[i] = rowFields[i].caption
  }
  for (let i = 0; i < dataColumns.length; i++) {
    row3[rowFieldCount + i] = dataColumns[i].label
  }
  grid.push(row3)

  // Build hierarchical rows with subtotals
  // First, group the data by the row field hierarchy
  if (hasColField) {
    // For column-oriented pivots: re-group by row fields only, 
    // with data split across column-value groups
    const rowOnlyFields = rowFields.map((f) => f.fieldName)
    const rowGroups = new Map()
    for (const g of groups) {
      const rowKey = rowOnlyFields.map((f) => g.key[f] || '(blank)').join('\x00')
      const colValue = g.key[colFields[0].fieldName] || '(blank)'

      if (!rowGroups.has(rowKey)) {
        const key = {}
        rowOnlyFields.forEach((f) => { key[f] = g.key[f] || '(blank)' })
        rowGroups.set(rowKey, { key, byCol: {} })
      }
      rowGroups.get(rowKey).byCol[colValue] = g.agg
    }

    // Emit data rows
    for (const rg of rowGroups.values()) {
      const dataRow = new Array(colCount).fill(null)
      for (let i = 0; i < rowFieldCount; i++) {
        dataRow[i] = rg.key[rowFields[i].fieldName]
      }
      // Fill data columns
      let colIdx = rowFieldCount
      for (const cv of colFieldValues) {
        const colAgg = rg.byCol[cv] || {}
        for (const df of dataFields) {
          dataRow[colIdx] = colAgg[df.caption] ?? null
          colIdx++
        }
      }
      // Totals across columns
      for (const df of dataFields) {
        let total = 0
        for (const cv of colFieldValues) {
          total += toNum((rg.byCol[cv] || {})[df.caption])
        }
        dataRow[colIdx] = total
        colIdx++
      }
      grid.push(dataRow)
    }
  } else {
    // Simple row-only pivots with hierarchical subtotals
    emitHierarchicalRows(grid, groups, rowFields, dataFields, dataColumns, rowFieldCount, colCount)
  }

  // Grand Total row
  const grandTotalRow = new Array(colCount).fill(null)
  grandTotalRow[0] = 'Grand Total'
  if (hasColField) {
    // Sum totals across all column values
    let colIdx = rowFieldCount
    for (const cv of colFieldValues) {
      for (const df of dataFields) {
        let sum = 0
        for (const g of groups) {
          if ((g.key[colFields[0].fieldName] || '(blank)') === cv) {
            sum += toNum(g.agg[df.caption])
          }
        }
        grandTotalRow[colIdx] = sum
        colIdx++
      }
    }
    for (const df of dataFields) {
      grandTotalRow[colIdx] = totals[df.caption] ?? 0
      colIdx++
    }
  } else {
    for (let i = 0; i < dataColumns.length; i++) {
      grandTotalRow[rowFieldCount + i] = totals[dataColumns[i].dataCaption] ?? 0
    }
  }
  grid.push(grandTotalRow)

  return {
    grid,
    colCount,
    rowCount: grid.length,
    headerRowEnd: 4,           // data starts at row index 4
    dataColStart: rowFieldCount,
  }
}

/**
 * Emit rows with hierarchical grouping and subtotals.
 * Excel indents sub-groups and adds "Team Total", "Company Total" etc.
 */
function emitHierarchicalRows(grid, groups, rowFields, dataFields, dataColumns, rowFieldCount, colCount) {
  if (rowFields.length <= 1) {
    // Flat — no subtotals needed
    for (const g of groups) {
      const row = new Array(colCount).fill(null)
      for (let i = 0; i < rowFields.length; i++) {
        row[i] = g.key[rowFields[i].fieldName] || '(blank)'
      }
      for (let i = 0; i < dataColumns.length; i++) {
        row[rowFieldCount + i] = g.agg[dataColumns[i].dataCaption] ?? null
      }
      grid.push(row)
    }
    return
  }

  // Multi-level: group by first field, emit subtotals
  const topField = rowFields[0].fieldName
  const topCaption = rowFields[0].caption
  let currentTop = null
  let subtotals = {}

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]
    const topVal = g.key[topField] || '(blank)'

    // Check if top-level changed — emit subtotal for previous group
    if (currentTop !== null && currentTop !== topVal) {
      const subRow = new Array(colCount).fill(null)
      subRow[0] = `${currentTop} Total`
      for (let i = 0; i < dataColumns.length; i++) {
        subRow[rowFieldCount + i] = subtotals[dataColumns[i].dataCaption] ?? 0
      }
      grid.push(subRow)
      subtotals = {}
    }
    currentTop = topVal

    // Emit data row
    const row = new Array(colCount).fill(null)
    for (let i = 0; i < rowFields.length; i++) {
      row[i] = g.key[rowFields[i].fieldName] || '(blank)'
    }
    for (let i = 0; i < dataColumns.length; i++) {
      const v = g.agg[dataColumns[i].dataCaption] ?? 0
      row[rowFieldCount + i] = v
      subtotals[dataColumns[i].dataCaption] = (subtotals[dataColumns[i].dataCaption] || 0) + toNum(v)
    }
    grid.push(row)
  }

  // Emit final subtotal
  if (currentTop !== null) {
    const subRow = new Array(colCount).fill(null)
    subRow[0] = `${currentTop} Total`
    for (let i = 0; i < dataColumns.length; i++) {
      subRow[rowFieldCount + i] = subtotals[dataColumns[i].dataCaption] ?? 0
    }
    grid.push(subRow)
  }
}
