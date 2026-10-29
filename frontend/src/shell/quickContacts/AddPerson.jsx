import { useState } from 'react'
import PersonLookup from '../../shared/ui/PersonLookup'

/**
 * Add someone by name: Outlook says who the name is and fills the email; without the
 * Outlook app the email is typed. `detail` is the tab's own field (role, area, sector).
 */
export default function AddPerson({ detail, onAdd, canAdd = true, label = 'Add' }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [picked, setPicked] = useState(null)
  const [busy, setBusy] = useState(false)
  const ready = Boolean(name.trim()) && canAdd && !busy

  const submit = async (event) => {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    const fromOutlook = picked && picked.name === name ? picked : null
    const added = await onAdd({ ...(fromOutlook || {}), name: name.trim(), email: email.trim() })
    setBusy(false)
    if (added) {
      setName('')
      setEmail('')
      setPicked(null)
    }
  }

  return (
    <form className="qc-add" onSubmit={submit}>
      <PersonLookup
        value={name}
        onChange={setName}
        onPick={(person) => {
          setPicked(person)
          setName(person.name)
          setEmail(person.email || '')
        }}
        placeholder="Type a name"
      />
      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" aria-label="Email" />
      {detail}
      <button type="submit" className="cmd-btn cmd-btn--primary" disabled={!ready}>{label}</button>
    </form>
  )
}
