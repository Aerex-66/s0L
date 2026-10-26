export function formatShortDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatLongDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatMonthYear(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function formatMonthDayYear(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatShortDateWithYear(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatCompactMillions(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '—'
  return `$${(numeric / 1e6).toFixed(1)}M`
}
