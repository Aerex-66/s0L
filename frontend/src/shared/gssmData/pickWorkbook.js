/**
 * The GSSM workbook that belongs to a deal: the one recorded on the deal by
 * the last GSSM sync (gssm_workbook_id), else the single catalog workbook
 * carrying the deal's opportunity number. Never guesses beyond that — showing
 * another deal's workbook is worse than showing none.
 */
export function pickWorkbookForDeal(deal, catalog) {
  if (!deal || !Array.isArray(catalog)) return null
  if (deal.gssm_workbook_id != null) {
    const linked = catalog.find((item) => String(item.id) === String(deal.gssm_workbook_id))
    if (linked) return linked
  }
  const opp = String(deal.opportunity_number || '').trim()
  if (!opp) return null
  const matches = catalog.filter((item) => String(item.opportunityNumber || '').trim() === opp)
  return matches.length === 1 ? matches[0] : null
}
