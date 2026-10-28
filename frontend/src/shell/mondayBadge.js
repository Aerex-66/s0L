/** What the header's monday icon shows: a state for the status dot and the tooltip text. */
const localTime = (iso) => new Date(iso).toLocaleString()

export function mondayBadge(status, { connecting = false, syncing = false, who = '', when = localTime } = {}) {
  if (!status) return { state: 'unknown', label: 'monday' }
  if (!status.app_configured) return { state: 'unavailable', label: "monday isn't set up on this computer" }
  if (status.connected && syncing) return { state: 'syncing', label: 'monday · syncing the deal board' }
  if (status.connected) {
    const name = who || status.user?.name
    const parts = ['monday', name ? `connected as ${name}` : 'connected']
    if (status.last_sync) parts.push(`synced ${when(status.last_sync)}`)
    parts.push('click to sync now')
    return { state: 'connected', label: parts.join(' · ') }
  }
  if (connecting) return { state: 'connecting', label: 'Finish signing in to monday in your browser' }
  return { state: 'disconnected', label: 'Connect monday' }
}
