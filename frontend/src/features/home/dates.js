/** Calendar days for Home: a 'YYYY-MM-DD' value is a local day, not UTC midnight. */
export function toLocalDate(value) {
  if (!value) return null
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const midnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/** Whole calendar days from one date to another (default today), never negative; null when the start is missing. */
export function daysBetween(from, to = new Date()) {
  const start = toLocalDate(from)
  const end = toLocalDate(to)
  if (!start || !end) return null
  return Math.max(0, Math.round((midnight(end) - midnight(start)) / 86400000))
}
