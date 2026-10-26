export function formatCurrency(value) {
  if (!value) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(value)
}

/** Strip $, commas, and K/M/B suffix → raw number or NaN */
export function parseCurrency(str) {
  if (!str) return NaN
  let s = String(str).trim().replace(/[$,\s]/g, '')
  let mult = 1
  if (/[bB]$/i.test(s)) { mult = 1e9; s = s.slice(0, -1) }
  else if (/[mM]$/i.test(s)) { mult = 1e6; s = s.slice(0, -1) }
  else if (/[kK]$/i.test(s)) { mult = 1e3; s = s.slice(0, -1) }
  const n = parseFloat(s)
  return isNaN(n) ? NaN : n * mult
}

/** Format a number with $ and K/M/B suffix (compact display) */
export function formatCompactCurrency(val) {
  if (val == null || val === '') return ''
  const s = String(val).trim()
  if (s.startsWith('$')) return s
  const n = parseCurrency(s)
  if (isNaN(n)) return s
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e9) {
    const d = abs / 1e9
    return sign + '$' + (d % 1 === 0 ? d.toFixed(0) : d.toFixed(1).replace(/\.0$/, '')) + 'B'
  }
  if (abs >= 1e6) {
    const d = abs / 1e6
    return sign + '$' + (d % 1 === 0 ? d.toFixed(0) : d.toFixed(1).replace(/\.0$/, '')) + 'M'
  }
  if (abs >= 1e3) {
    const d = abs / 1e3
    return sign + '$' + (d % 1 === 0 ? d.toFixed(0) : d.toFixed(1).replace(/\.0$/, '')) + 'K'
  }
  return sign + '$' + abs.toFixed(0)
}
