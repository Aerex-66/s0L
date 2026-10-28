/** The New Deal form → the body for adding the deal to monday (POST /api/monday/deals). */
export const BOARD_FIELDS = ['opportunity_number', 'client_name', 'project_name', 'implementation_type', 'sector', 'industry', 'deal_type', 'currency']
export const S0L_FIELDS = ['rfp_submission_date', 'rate_card', 'price_to_win']
export const PEOPLE_FIELDS = ['lead_ssc', 'tt_executive', 'solution_consultant_2', 'solution_consultant_3']

const filled = (form, keys) => Object.fromEntries(
  keys.map((key) => [key, String(form[key] ?? '').trim()]).filter(([, value]) => value),
)

// Only TT Execs choose people; the server makes anyone else the Lead SSC.
export function newDealPayload(form, isExec) {
  return {
    group: form.group,
    values: filled(form, BOARD_FIELDS),
    people: isExec ? filled(form, PEOPLE_FIELDS) : {},
    deal: filled(form, S0L_FIELDS),
  }
}

/** The client as the board spells it, or '' when it isn't on the board's list. */
export function boardClient(name, clients) {
  const wanted = String(name || '').trim().toLowerCase()
  return (wanted && clients.find((client) => client.toLowerCase() === wanted)) || ''
}

/** Clients containing the typed text, those that start with it first; everything when nothing is typed. */
export function clientMatches(query, clients) {
  const wanted = String(query || '').trim().toLowerCase()
  if (!wanted) return clients
  const starts = []
  const contains = []
  for (const client of clients) {
    const name = client.toLowerCase()
    if (name.startsWith(wanted)) starts.push(client)
    else if (name.includes(wanted)) contains.push(client)
  }
  return [...starts, ...contains]
}
