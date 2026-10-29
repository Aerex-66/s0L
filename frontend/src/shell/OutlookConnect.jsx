import { useEffect } from 'react'
import useOutlookStore from '../shared/outlookStore'
import Tip from '../shared/ui/Tip'
import { cx } from '../shared/utils/cx'
import outlookLogo from '../assets/integration-logos/outlook.svg'
import { outlookBadge } from './outlookBadge'

const REFRESH_MS = 60000 // the tooltip follows Outlook being opened or closed

/** Header icon: in colour while s0L uses the Outlook app (green dot while it's open); a click opens the Outlook panel. */
export default function OutlookConnect() {
  const status = useOutlookStore((s) => s.status)
  const load = useOutlookStore((s) => s.load)
  const openPanel = useOutlookStore((s) => s.openPanel)

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  const badge = outlookBadge(status)

  return (
    <Tip content={badge.label}>
      <button
        className={cx('header-action-btn', 'header-outlook', !badge.inUse && 'header-signed-out')}
        onClick={() => openPanel()}
        aria-label={badge.label}
      >
        <img src={outlookLogo} alt="" className="header-outlook-logo" />
        <span className={cx('header-outlook-dot', `is-${badge.state}`)} aria-hidden="true" />
      </button>
    </Tip>
  )
}
