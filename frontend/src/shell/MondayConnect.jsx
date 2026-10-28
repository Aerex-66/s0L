import { useCallback, useEffect, useRef, useState } from 'react'
import { mondayService } from '../shared/services/mondayService'
import useDealStore from '../shared/dealStore'
import Tip from '../shared/ui/Tip'
import { cx } from '../shared/utils/cx'
import mondayLogo from '../assets/integration-logos/monday.svg'
import { mondayBadge } from './mondayBadge'

const POLL_MS = 3000
const POLL_LIMIT = 100 // five minutes to finish signing in

/** Header icon: one click connects monday; the dot turns green once connected; then a click syncs. */
export default function MondayConnect() {
  const [status, setStatus] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const pollRef = useRef(null)
  const syncState = useDealStore((s) => s.mondaySync.state)
  const runMondaySync = useDealStore((s) => s.runMondaySync)
  const setAppNotice = useDealStore((s) => s.setAppNotice)
  const mondayMe = useDealStore((s) => s.mondayMe)
  const loadMondayMe = useDealStore((s) => s.loadMondayMe)

  const refresh = useCallback(
    () => mondayService.status().then((next) => { setStatus(next); return next }).catch(() => null),
    [],
  )

  // Reload after every sync so the tooltip's "synced" time stays true.
  useEffect(() => {
    if (syncState !== 'syncing') refresh()
  }, [syncState, refresh])

  useEffect(() => () => clearInterval(pollRef.current), [])

  // Once connected, learn who this is on the board; with no name picked yet, the name picker opens.
  const connected = Boolean(status?.connected)
  useEffect(() => {
    if (connected && !mondayMe) loadMondayMe()
  }, [connected, mondayMe, loadMondayMe])

  const connect = async () => {
    try {
      await mondayService.connect()
    } catch (error) {
      setAppNotice(error.message)
      return
    }
    setConnecting(true)
    let tries = 0
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      tries += 1
      const next = await refresh()
      if (next?.connected || tries >= POLL_LIMIT) {
        clearInterval(pollRef.current)
        setConnecting(false)
        if (next?.connected) runMondaySync()
      }
    }, POLL_MS)
  }

  const badge = mondayBadge(status, { connecting, syncing: syncState === 'syncing', who: mondayMe?.name })

  const handleClick = () => {
    if (badge.state === 'disconnected') connect()
    else if (badge.state === 'connected') runMondaySync()
  }

  return (
    <Tip content={badge.label}>
      <button className="header-action-btn header-monday" onClick={handleClick} aria-label={badge.label}>
        <img src={mondayLogo} alt="" className="header-monday-logo" />
        <span className={cx('header-monday-dot', `is-${badge.state}`)} aria-hidden="true" />
      </button>
    </Tip>
  )
}
