/** Similar deals and how they turned out — pure functions over deal records, so the Metrics module stays a view. */
import { isClosedDeal, isWonDeal } from '../../shared/constants/uiStates'

export const tcvOf = (deal) => Number(deal?.financials?.tcv || deal?.estimated_value || deal?.price_to_win) || 0

export const isLostDeal = (deal) => ['Lost', 'Closed Lost'].includes(deal?.status) || deal?.sales_stage === 'Lost'

const same = (a, b) => Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase()

/**
 * Deals like this one: the same practice (monday group) when both have one, and the same implementation type or
 * industry. Each comes back with the reasons it matched, closest first, then biggest.
 */
export function similarDeals(deal, deals) {
  if (!deal) return []
  return (deals || [])
    .filter((other) => other && String(other.id) !== String(deal.id))
    .filter((other) => !deal.monday_group || !other.monday_group || same(deal.monday_group, other.monday_group))
    .map((other) => {
      const reasons = []
      if (same(deal.implementation_type, other.implementation_type)) reasons.push('Same type')
      if (same(deal.industry, other.industry)) reasons.push('Same industry')
      return { deal: other, reasons, score: reasons.length * 2 + (same(deal.sector, other.sector) ? 1 : 0) }
    })
    .filter(({ reasons }) => reasons.length > 0)
    .sort((a, b) => b.score - a.score || tcvOf(b.deal) - tcvOf(a.deal))
}

/** Won, lost and still-open counts for a set of deals, and the win rate of the decided ones. */
export function outcomes(deals) {
  const won = deals.filter(isWonDeal).length
  const lost = deals.filter((d) => !isWonDeal(d) && isLostDeal(d)).length
  const closed = deals.filter(isClosedDeal).length
  const decided = won + lost
  return { won, lost, otherClosed: Math.max(0, closed - decided), open: deals.length - closed, winRate: decided ? won / decided : null }
}

/** Where a TCV sits among others: rank (1 = biggest), median, smallest and biggest of the ones with a TCV. */
export function tcvStanding(tcv, deals) {
  const values = deals.map(tcvOf).filter((v) => v > 0).sort((a, b) => a - b)
  if (!values.length) return null
  const mid = Math.floor(values.length / 2)
  const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2
  const rank = tcv > 0 ? values.filter((v) => v > tcv).length + 1 : null
  return { count: values.length, median, smallest: values[0], biggest: values[values.length - 1], rank }
}
