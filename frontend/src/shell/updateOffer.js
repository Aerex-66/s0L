/** The update prompt's decisions, kept pure so they can be tested without the dialog. */
import { readyUpdate } from '../shared/updateStore'

const NOTICES = {
  no_access: "Your monday account can't see s0L's update board, so s0L can't update itself. Ask the board's owner for access.",
  reconnect: 'Connect monday again (the icon at the top) so s0L can keep itself up to date.',
}

/** The version to offer: only in the packaged app, and not one the person put off this session. */
export function promptFor(status, laterVersion = null) {
  const ready = readyUpdate(status)
  return ready && ready !== laterVersion ? ready : null
}

/** What the person can do about an update that can't arrive; null when there is nothing to say. */
export function updateNotice(status) {
  return NOTICES[status?.notice] || null
}
