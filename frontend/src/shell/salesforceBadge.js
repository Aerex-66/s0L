/** What the header's Salesforce icon shows: a state for the status dot and the tooltip text. */
const localTime = (iso) => new Date(iso).toLocaleString()

export function salesforceBadge(status, { connecting = false, checking = false, when = localTime } = {}) {
  if (!status) return { state: 'unknown', label: 'Salesforce' }
  if (!status.app_configured) return { state: 'unavailable', label: "Salesforce isn't set up on this computer" }
  if (status.connected && checking) return { state: 'checking', label: "Salesforce · checking the board's deals" }
  if (status.connected) {
    const name = status.user?.name
    const parts = ['Salesforce', name ? `connected as ${name}` : 'connected']
    if (status.last_check) parts.push(`checked ${when(status.last_check)}`)
    parts.push('click to check the board now')
    return { state: 'connected', label: parts.join(' · ') }
  }
  if (connecting) return { state: 'connecting', label: 'Finish signing in to Salesforce in your browser' }
  return { state: 'disconnected', label: 'Connect Salesforce' }
}
