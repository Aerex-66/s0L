/**
 * mondayService — the only frontend client for the monday.com integration.
 * The backend does all monday calls; nothing here ever sees a token.
 */
import { get, post, put } from '../apiClient'

export const mondayService = {
  status:     ()                => get('/api/monday/status'),
  connect:    ()                => post('/api/monday/connect', {}),
  sync:       ({ dryRun } = {}) => post('/api/monday/sync', { dry_run: Boolean(dryRun) }),
  disconnect: ()                => post('/api/monday/disconnect', {}),
  /** { email, name, is_exec, names }: the board name this monday email picked (once), and the names to pick from. */
  me:         ()                => get('/api/monday/me'),
  rememberMe: (name)            => put('/api/monday/me', { name }),
  /** { groups, options: { field key: [board labels] }, me } for the New Deal form. */
  newDealOptions: ()            => get('/api/monday/new-deal'),
  /** Adds the row to the board and the linked deal to s0L; resolves to the new deal. */
  addDeal:    (payload)         => post('/api/monday/deals', payload),
  /** { columns: { field key: [names the board column offers] } } for the people columns s0L may change. */
  people:     ()                => get('/api/monday/people'),
  /** Changes the deal's board row (a name the column already has); resolves to the updated deal. */
  assign:     (dealId, key, name) => post('/api/monday/assign', { deal_id: dealId, key, name }),
  /** A TT Exec puts Salesforce's value for this field on the deal's board row; resolves to the updated deal. */
  fix:        (dealId, key)       => post('/api/monday/fix', { deal_id: dealId, key }),
}
