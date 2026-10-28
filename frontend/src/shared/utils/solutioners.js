/**
 * Solutioners on a deal come from the monday board: Lead SSC and SSC2–SSC4.
 * "TBD" is the board's placeholder label, not a person.
 */
const SOLUTIONER_KEYS = ['lead_ssc', 'solution_consultant_2', 'solution_consultant_3', 'solution_consultant_4']
const PLACEHOLDERS = new Set(['', 'tbd'])

const norm = (value) => String(value ?? '').trim().toLowerCase()
const isPerson = (value) => !PLACEHOLDERS.has(norm(value))

/** Every person named as a solutioner on any deal, sorted. */
export function solutionerNames(deals) {
  const names = new Map()
  for (const deal of deals || []) {
    for (const key of SOLUTIONER_KEYS) {
      const value = String(deal?.[key] ?? '').trim()
      if (isPerson(value) && !names.has(norm(value))) names.set(norm(value), value)
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b))
}

/** Whether a person is the lead or a supporting solutioner on a deal. */
export function isSolutionerDeal(deal, name) {
  const wanted = norm(name)
  return isPerson(wanted) && SOLUTIONER_KEYS.some((key) => norm(deal?.[key]) === wanted)
}

/** The deals the dashboard shows: only the user's when scope is "mine" and they've picked their name. */
export function dealsInScope(deals, { scope, solutioner } = {}) {
  if (scope !== 'mine' || !solutioner) return deals
  return deals.filter((deal) => isSolutionerDeal(deal, solutioner))
}

export const UNASSIGNED = 'Unassigned'

/** The lead solutioner on a deal, or UNASSIGNED. */
export const leadSolutioner = (deal) => (isPerson(deal?.lead_ssc) ? String(deal.lead_ssc).trim() : UNASSIGNED)

/** Deals per lead solutioner, busiest first; deals without a lead count as UNASSIGNED. */
export function leadSolutionerCounts(deals) {
  const counts = new Map()
  for (const deal of deals || []) {
    const name = leadSolutioner(deal)
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
