/** Board/Salesforce differences for the TT Exec view: grouped by the deal's TT Exec, each said in one sentence. */
export const UNASSIGNED = 'Unassigned'

/** [{ exec, rows }] with each row joined to its deal: the signed-in exec first, then A–Z, Unassigned last. */
export function groupDifferences(rows, deals, myName) {
  const byId = new Map(deals.map((deal) => [String(deal.id), deal]))
  const groups = new Map()
  for (const row of rows) {
    const deal = byId.get(String(row.deal_id))
    if (!deal) continue
    const exec = String(deal.tt_executive || '').trim() || UNASSIGNED
    if (!groups.has(exec)) groups.set(exec, [])
    groups.get(exec).push({ ...row, deal })
  }
  const rank = (exec) => (exec === myName ? 0 : exec === UNASSIGNED ? 2 : 1)
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([exec, grouped]) => ({ exec, rows: grouped }))
}

const quoted = (text) => `“${text}”`

export function describeDifference(row) {
  switch (row.kind) {
    case 'not_an_id':
      return "The board's opportunity number holds no Salesforce opportunity ID."
    case 'two_ids':
      return "The board's opportunity number holds two opportunity IDs, so s0L can't tell which one this deal is."
    case 'not_returned':
      return "Salesforce didn't return this opportunity: a wrong number, or you can't see it in Salesforce."
    case 'extra_text':
      return "The board's opportunity number holds more than the ID. s0L reads the ID and leaves the cell as it is."
    case 'full_id':
      return `The board has ${quoted(row.board)}; Salesforce's full ID is ${quoted(row.salesforce)}.`
    default:
      return `${row.label}: the board ${row.board ? `says ${quoted(row.board)}` : 'is empty'}, Salesforce says ${quoted(row.salesforce)}.`
  }
}
