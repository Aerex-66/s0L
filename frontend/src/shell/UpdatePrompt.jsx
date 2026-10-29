import { useEffect } from 'react'
import Modal from '../shared/ui/Modal'
import useDealStore from '../shared/dealStore'
import useUpdateStore from '../shared/updateStore'
import { promptFor, updateNotice } from './updateOffer'

const CHECK_MS = 10 * 60 * 1000

export default function UpdatePrompt() {
  const setAppNotice = useDealStore((s) => s.setAppNotice)
  const status = useUpdateStore((s) => s.status)
  const later = useUpdateStore((s) => s.later)
  const restarting = useUpdateStore((s) => s.restarting)
  const slow = useUpdateStore((s) => s.slow)
  const refresh = useUpdateStore((s) => s.refresh)
  const putOff = useUpdateStore((s) => s.putOff)
  const restartNow = useUpdateStore((s) => s.restartNow)

  useEffect(() => {
    const check = async () => {
      const notice = updateNotice(await refresh())
      if (notice) setAppNotice(notice)
    }
    check()
    const timer = setInterval(check, CHECK_MS)
    return () => clearInterval(timer)
  }, [refresh, setAppNotice])

  const version = promptFor(status, later)

  if (restarting) {
    return (
      <Modal title={`Updating s0L to ${restarting}`} onClose={() => { if (slow) window.location.reload() }} className="confirm-dialog">
        <p className="confirm-dialog-message">
          {slow ? 's0L is taking longer than usual. Open it again from its tray icon.' : 'Restarting s0L…'}
        </p>
        {slow && (
          <div className="confirm-dialog-actions">
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>Close</button>
          </div>
        )}
      </Modal>
    )
  }

  if (!version) return null

  return (
    <Modal title={`s0L ${version} is ready`} onClose={() => putOff(version)} className="confirm-dialog">
      <p className="confirm-dialog-message">Restart s0L to use it. Your deals and documents stay as they are.</p>
      <div className="confirm-dialog-actions">
        <button className="btn btn-secondary" onClick={() => putOff(version)}>Later</button>
        <button className="btn btn-primary" onClick={() => restartNow()}>Restart now</button>
      </div>
    </Modal>
  )
}
