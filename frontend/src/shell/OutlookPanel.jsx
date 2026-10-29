import { useState } from 'react'
import Modal from '../shared/ui/Modal'
import useOutlookStore from '../shared/outlookStore'
import { cx } from '../shared/utils/cx'
import QuickContacts from './quickContacts/QuickContacts'

const CHOICES = [
  {
    mode: 'web',
    title: 'Outlook in the browser',
    found: "Emails and invites open in Outlook on the web, filled in. s0L can't attach files or show your Outlook calendar.",
  },
  {
    mode: 'app',
    title: 'The Outlook app on this computer',
    found: 'Found. s0L opens real Outlook emails and invites, with deal documents attached, and shows your calendar while Outlook is open.',
    missing: 'Not found: s0L needs the classic Outlook app, set up for you on this computer.',
  },
]

/** The Outlook icon's panel: which Outlook s0L uses on this computer, then Quick contacts. */
export default function OutlookPanel() {
  const open = useOutlookStore((s) => s.panelOpen)
  const tab = useOutlookStore((s) => s.panelTab)
  const status = useOutlookStore((s) => s.status)
  const setMode = useOutlookStore((s) => s.setMode)
  const close = useOutlookStore((s) => s.closePanel)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null
  const appFound = Boolean(status?.app?.found)

  const choose = async (mode) => {
    setSaving(true)
    setError('')
    try {
      await setMode(mode)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Outlook" onClose={close} className="outlook-panel-modal">
      <section className="outlook-panel-section" aria-labelledby="outlook-which">
        <h3 className="outlook-panel-heading" id="outlook-which">Which Outlook do you use?</h3>
        <div className="outlook-choices">
          {CHOICES.map((choice) => {
            const usable = choice.mode === 'web' || appFound
            const current = status?.effective === choice.mode
            return (
              <button
                key={choice.mode}
                type="button"
                className={cx('outlook-choice', current && 'is-current')}
                disabled={!usable || saving}
                aria-pressed={current}
                onClick={() => choose(choice.mode)}
              >
                <span className="outlook-choice-title">{choice.title}</span>
                <span className="outlook-choice-note">{usable ? choice.found : choice.missing}</span>
              </button>
            )
          })}
        </div>
        {error && <p className="pm-assign-error" role="alert">{error}</p>}
      </section>
      <QuickContacts initialTab={tab} />
    </Modal>
  )
}
