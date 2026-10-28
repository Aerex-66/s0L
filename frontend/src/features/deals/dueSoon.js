const DAY_MS = 86400000

// Calendar day number of a local date, so 'YYYY-MM-DD' compares without time-zone drift.
const dayOf = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS

function rfpDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS : null
}

/** Deals whose RFP submission date falls between today and `days` days ahead. */
export function dueSoon(deals, { days = 7, today = new Date() } = {}) {
  const start = dayOf(today)
  return deals.filter((deal) => {
    const day = rfpDay(deal.rfp_submission_date)
    return day !== null && day >= start && day <= start + days
  })
}
