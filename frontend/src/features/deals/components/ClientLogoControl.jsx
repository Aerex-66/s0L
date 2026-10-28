import { useEffect, useState } from 'react'
import useClientLogoStore, { clientKey, logoSrc } from '../clientLogoStore'

/** Shows the client's logo and lets you hide a wrong one or take the icon from the client's website. */
export default function ClientLogoControl({ clientName }) {
  const key = clientKey(clientName)
  const logo = useClientLogoStore((s) => s.logos[key])
  const hidden = useClientLogoStore((s) => s.hidden.includes(key))
  const load = useClientLogoStore((s) => s.load)
  const override = useClientLogoStore((s) => s.override)
  const [website, setWebsite] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [load])

  if (!key) return null

  const act = async (payload, done) => {
    setBusy(true)
    setMessage('')
    try {
      await override({ client_name: clientName, ...payload })
      setMessage(done)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="client-logo-control">
      <span className="client-logo-control-label">Client logo</span>
      {logo
        ? <img className="client-logo-control-img" src={logoSrc(logo)} alt={`${clientName} logo`} draggable="false" />
        : <span className="text-muted">{hidden ? 'Hidden' : 'None found yet'}</span>}
      {logo && (
        <button type="button" className="btn btn-ghost" disabled={busy}
          onClick={() => act({ action: 'hide' }, `Hidden on every ${clientName} deal.`)}>
          Wrong logo? Hide
        </button>
      )}
      {hidden && (
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => act({ action: 'show' }, 'Shown again.')}>
          Show again
        </button>
      )}
      <input
        type="url"
        className="client-logo-control-site"
        placeholder="https://client-website.com"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        aria-label="Client website"
      />
      <button type="button" className="btn btn-ghost" disabled={busy || !website.trim()}
        onClick={() => act({ action: 'website', website: website.trim() }, "Using the website's icon.")}>
        Use website icon
      </button>
      {message && <span className="text-muted client-logo-control-msg">{message}</span>}
    </div>
  )
}
