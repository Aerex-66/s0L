// 'YYYY-MM-DD' is a calendar day; JS would read it as UTC midnight, the day before west of Greenwich.
const toDate = (value) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)

export function formatShortDate(value) {
  if (!value) return null
  const parsed = toDate(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatLongDate(value) {
  if (!value) return null
  const parsed = toDate(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatMonthYear(value) {
  const parsed = toDate(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function formatMonthDayYear(value) {
  const parsed = toDate(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatShortDateWithYear(value) {
  if (!value) return null
  const parsed = toDate(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatCompactMillions(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '—'
  if (numeric >= 1e9) return `$${(numeric / 1e9).toFixed(1)}B`
  if (numeric >= 1e6) return `$${(numeric / 1e6).toFixed(1)}M`
  return `$${Math.round(numeric / 1e3)}K`
}
