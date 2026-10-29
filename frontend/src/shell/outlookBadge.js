/** What the header's Outlook icon shows: a state for the dot, the tooltip, and whether the mark is in colour. */
export function outlookBadge(status) {
  if (!status) return { state: 'unknown', label: 'Outlook', inUse: false }
  if (status.effective === 'web') return { state: 'web', label: 'Outlook · in the browser · click for Quick contacts', inUse: false }
  if (!status.app?.found) {
    return { state: 'missing', label: "Outlook · the app isn't set up on this computer · click to choose", inUse: false }
  }
  if (status.app.running) return { state: 'connected', label: 'Outlook · the app on this computer · click for Quick contacts', inUse: true }
  return {
    state: 'closed',
    label: 'Outlook · the app on this computer (open it to see your calendar) · click for Quick contacts',
    inUse: true,
  }
}
