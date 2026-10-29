/**
 * salesforceService — the only frontend client for the Salesforce integration.
 * The backend does all Salesforce calls; nothing here ever sees a token.
 */
import { get, post } from '../apiClient'

export const salesforceService = {
  status:      () => get('/api/salesforce/status'),
  connect:     () => post('/api/salesforce/connect', {}),
  disconnect:  () => post('/api/salesforce/disconnect', {}),
  /** Looks every deal on the monday board up in Salesforce; resolves to the check's summary. */
  check:       () => post('/api/salesforce/check', {}),
  /** { differences: [{ deal_id, kind, key, label, board, salesforce, fix, fixable, record_url }], last_check } */
  differences: () => get('/api/salesforce/differences'),
}
