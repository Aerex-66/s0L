/**
 * updateService — s0L's own updates (packaged app only). The backend checks monday and
 * downloads; the launcher installs. Nothing here talks to monday.
 */
import { get, post } from '../apiClient'

export const updateService = {
  /** { enabled, version, ready, notice } */
  status:  () => get('/api/updates/status'),
  /** Asks the launcher to install the ready update and restart s0L. */
  restart: () => post('/api/updates/restart', {}),
}
