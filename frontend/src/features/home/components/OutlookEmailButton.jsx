import { useState } from 'react'
import useOutlookStore, { effectiveMode } from '../../../shared/outlookStore'
import { outlookWebMailLink } from '../../../shared/utils/outlookLinks'
import { mailtoLink } from '../handoff'

/**
 * An email button: a real draft in the Outlook app, Outlook on the web in a new tab, or,
 * until s0L knows which Outlook this computer uses, today's mailto: link.
 */
export default function OutlookEmailButton({ message, dealId, className, title, ariaLabel, children }) {
  const mode = useOutlookStore((s) => effectiveMode(s.status))
  const openEmail = useOutlookStore((s) => s.openEmail)
  const [opening, setOpening] = useState(false)

  if (!message) return null

  if (mode !== 'app') {
    const web = mode === 'web'
    return (
      <a
        className={className}
        href={web ? outlookWebMailLink(message) : mailtoLink(message)}
        title={title}
        aria-label={ariaLabel}
        {...(web ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  }

  const open = async () => {
    setOpening(true)
    await openEmail(message, { dealId })
    setOpening(false)
  }

  return (
    <button
      type="button"
      className={className}
      title={opening ? 'Opening Outlook…' : title}
      aria-label={ariaLabel}
      aria-busy={opening}
      disabled={opening}
      onClick={open}
    >
      {children}
    </button>
  )
}
