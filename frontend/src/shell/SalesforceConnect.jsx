import { useCallback, useEffect, useRef, useState } from 'react'
import { salesforceService } from '../shared/services/salesforceService'
import useDealStore from '../shared/dealStore'
import Tip from '../shared/ui/Tip'
import { cx } from '../shared/utils/cx'
import salesforceLogo from '../assets/integration-logos/salesforce.svg'
import { salesforceBadge } from './salesforceBadge'

const POLL_MS = 3000
const POLL_LIMIT = 100 // five minutes to finish signing in

/** Header icon: one click connects Salesforce; the dot turns green once connected; then a click checks the board's deals. */
export default function SalesforceConnect() {
  const [status, setStatus] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const pollRef = useRef(null)
  const checkState = useDealStore((s) => s.salesforceCheck.state)
  const runSalesforceCheck = useDealStore((s) => s.runSalesforceCheck)
  const setAppNotice = useDealStore((s) => s.setAppNotice)

  const refresh = useCallback(
    () => salesforceService.status().then((next) => { setStatus(next); return next }).catch(() => null),
    [],
  )

  // Reload after every check so the tooltip's "checked" time stays true.
  useEffect(() => {
    if (checkState !== 'checking') refresh()
  }, [checkState, refresh])

  useEffect(() => () => clearInterval(pollRef.current), [])

  const check = async () => {
    await runSalesforceCheck()
    const { salesforceCheck } = useDealStore.getState()
    if (salesforceCheck.state === 'error') setAppNotice(`Salesforce: ${salesforceCheck.message}`)
  }

  const connect = async () => {
    try {
      await salesforceService.connect()
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
        if (next?.connected) check()
      }
    }, POLL_MS)
  }

  const badge = salesforceBadge(status, { connecting, checking: checkState === 'checking' })

  const handleClick = () => {
    if (badge.state === 'disconnected') connect()
    else if (badge.state === 'connected') check()
  }

  return (
    <Tip content={badge.label}>
      <button
        className={cx('header-action-btn', 'header-salesforce', !status?.connected && 'header-signed-out')}
        onClick={handleClick}
        aria-label={badge.label}
      >
        <img src={salesforceLogo} alt="" className="header-salesforce-logo" />
        <span className={cx('header-salesforce-dot', `is-${badge.state}`)} aria-hidden="true" />
      </button>
    </Tip>
  )
}
