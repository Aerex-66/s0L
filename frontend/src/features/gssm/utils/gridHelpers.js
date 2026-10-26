/**
 * AG Grid column + sheet-view factory helpers — zero React dependencies.
 */

import { colToLabel, formatCellValue } from './cellUtils.js'

const buildColumns = (maxCol, getValidationOptions, onCellEdited) => {
  const columns = [
    {
      headerName: '',
      field: '__rowNumber',
      colId: '__rowNumber',
      editable: false,
      width: 72,
      minWidth: 72,
      maxWidth: 72,
      pinned: 'left',
      lockPosition: true,
      sortable: false,
      resizable: false,
      suppressMovable: true,
      cellClass: 'grid-row-number',
    },
  ]
  for (let colIndex = 0; colIndex <= maxCol; colIndex += 1) {
    const field = `c${colIndex}`
    columns.push({
      headerName: colToLabel(colIndex),
      field,
      colId: String(colIndex),
      editable: true,
      cellEditorSelector: (params) => {
        const rowIndex = params?.node?.rowIndex
        const options = getValidationOptions(rowIndex, colIndex)
        if (options && options.length) {
          return {
            component: 'agSelectCellEditor',
            params: { values: options },
          }
        }
        return undefined
      },
      valueSetter: (params) => {
        const nextValue = params.newValue
        if (params.data[field] === nextValue) return false
        params.data[field] = nextValue
        onCellEdited({ rowIndex: params.node.rowIndex, colIndex, value: nextValue })
        return true
      },
      cellClass: 'grid-cell',
    })
  }
  return columns
}

export const buildSheetView = ({ results = {}, dimensions, validations = [] }, applyCellEdit) => {
  const maxRow = Math.max(0, dimensions.endRow)
  const maxCol = Math.max(0, dimensions.endCol)
  const nextValidationMap = {}

  if (Array.isArray(validations)) {
    validations.forEach((range) => {
      for (let row = range.startRow; row <= range.endRow; row += 1) {
        for (let col = range.startCol; col <= range.endCol; col += 1) {
          nextValidationMap[`${row}:${col}`] = range.options
        }
      }
    })
  }

  // Use the freshly-built validation map — not a stale closure
  const getOptions = (rowIndex, colIndex) => {
    const key = `${rowIndex}:${colIndex}`
    return nextValidationMap[key] || null
  }

  // Build sparse rows — only set properties for cells that have values
  const rowMap = new Map()
  for (const key of Object.keys(results)) {
    const sep = key.indexOf(':')
    const r = Number(key.slice(0, sep))
    const c = Number(key.slice(sep + 1))
    if (!rowMap.has(r)) {
      rowMap.set(r, { __rowNumber: r + 1 })
    }
    rowMap.get(r)[`c${c}`] = formatCellValue(results[key])
  }

  // Build dense array but reuse pre-built row objects from the map
  const rows = new Array(maxRow + 1)
  for (let rowIndex = 0; rowIndex <= maxRow; rowIndex += 1) {
    rows[rowIndex] = rowMap.get(rowIndex) || { __rowNumber: rowIndex + 1 }
  }

  return {
    validationMap: nextValidationMap,
    columnDefs: buildColumns(maxCol, getOptions, applyCellEdit),
    rowData: rows,
  }
}
