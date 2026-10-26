/** Parse "Label: Value" from a single cell string; the reference deck's "—" means empty. */
export function splitLabelValue(cell) {
  if (!cell) return { label: '', value: '' }
  const idx = cell.indexOf(':')
  if (idx <= 0 || idx >= cell.length - 1) return { label: cell, value: '' }
  const value = cell.substring(idx + 1).trim()
  return {
    label: cell.substring(0, idx).trim(),
    value: value === '—' ? '' : value,
  }
}
