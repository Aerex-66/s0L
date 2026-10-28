/**
 * TT Exec numbers: deals added to the board, submitted, won and lost per calendar month, quarter,
 * half or year (by the date the row was added and the date its status last changed), and the open
 * deals still waiting for a lead.
 */
import { isClosedDeal } from '../../shared/constants'
import { leadSolutioner, UNASSIGNED } from '../../shared/utils/solutioners'
import { dealTcv } from './tcv'

export const PERIODS = [
  { id: 'month', label: 'Month', plural: 'months', months: 1 },
  { id: 'quarter', label: 'Quarter', plural: 'quarters', months: 3 },
  { id: 'half', label: 'Half', plural: 'halves', months: 6 },
  { id: 'year', label: 'Year', plural: 'years', months: 12 },
]
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WON = new Set(['Won', 'Closed Won'])
const LOST = new Set(['Lost', 'Closed Lost'])

const perYear = (size) => 12 / PERIODS.find((period) => period.id === size).months

/** Consecutive period number of a 'YYYY-MM…' date (next period = +1); null without a date. */
export function periodIndex(date, size) {
  const match = /^(\d{4})-(\d{2})/.exec(String(date ?? ''))
  if (!match) return null
  const slots = perYear(size)
  return Number(match[1]) * slots + Math.floor((Number(match[2]) - 1) / (12 / slots))
}

export function periodLabel(index, size) {
  const slots = perYear(size)
  const year = Math.floor(index / slots)
  const slot = index - year * slots
  if (size === 'month') return `${MONTH_NAMES[slot]} ${year}`
  if (size === 'quarter') return `Q${slot + 1} ${year}`
  if (size === 'half') return `H${slot + 1} ${year}`
  return String(year)
}

export const currentPeriod = (size, today = new Date()) =>
  periodIndex(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`, size)

// Rows from the board carry the day they were added; a deal made in s0L only has its own creation date.
const addedOn = (deal) => deal.monday_created_at || (deal.monday_item_id ? '' : deal.created_date)
// A status the board never changed has stood since the row was added.
const statusOn = (deal) => deal.status_changed_at || addedOn(deal)

const sumTcv = (deals) => deals.reduce((sum, deal) => sum + dealTcv(deal), 0)

/** Won against won plus lost, from the deals' statuses (rate null before any decision). */
export function winRate(deals) {
  const won = deals.filter((deal) => WON.has(deal.status)).length
  const lost = deals.filter((deal) => LOST.has(deal.status)).length
  return { won, lost, rate: won + lost ? won / (won + lost) : null }
}

export function periodStats(deals, size, index) {
  const inPeriod = (date) => periodIndex(date, size) === index
  const decided = (statuses) => deals.filter((deal) => statuses.has(deal.status) && inPeriod(statusOn(deal)))
  const added = deals.filter((deal) => inPeriod(addedOn(deal)))
  const won = decided(WON)
  const lost = decided(LOST)
  return {
    index,
    label: periodLabel(index, size),
    added: added.length,
    addedTcv: sumTcv(added),
    submitted: decided(new Set(['Submitted'])).length,
    won: won.length,
    wonTcv: sumTcv(won),
    lost: lost.length,
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
  }
}

/** periodStats for the `count` periods ending with `endIndex`, oldest first. */
export const trend = (deals, size, endIndex, count = 6) =>
  Array.from({ length: count }, (_, i) => periodStats(deals, size, endIndex - count + 1 + i))

/** Open deals waiting for assignment or without a lead solutioner, newest on the board first. */
export const needsAssignment = (deals) => deals
  .filter((deal) => !isClosedDeal(deal) && (deal.status === 'Assignment Needed' || leadSolutioner(deal) === UNASSIGNED))
  .sort((a, b) => String(addedOn(b)).localeCompare(String(addedOn(a))))
