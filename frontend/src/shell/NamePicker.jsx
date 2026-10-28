import { useMemo, useState } from 'react'
import Modal from '../shared/ui/Modal'
import useDealStore from '../shared/dealStore'
import useStore from '../shared/useStore'
import { cx } from '../shared/utils/cx'

/** "Which name on the board is you?" — asked once after connecting monday, and again from "Not you?". */
export default function NamePicker() {
  const open = useDealStore((s) => s.namePickerOpen)
  const me = useDealStore((s) => s.mondayMe)
  const remember = useDealStore((s) => s.rememberMondayMe)
  const close = useDealStore((s) => s.closeNamePicker)
  const loadPreferences = useStore((s) => s.loadPreferences)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const names = useMemo(() => {
    const wanted = filter.trim().toLowerCase()
    return (me?.names || []).filter((name) => name.toLowerCase().includes(wanted))
  }, [me, filter])

  if (!open || !me) return null

  const pick = async (name) => {
    setSaving(true)
    setError('')
    try {
      await remember(name)
      await loadPreferences()
      setFilter('')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Welcome to s0L" onClose={close} className="name-picker">
      <p className="section-description">
        Which name on the monday board is you? s0L uses it for My deals and adds you as Lead SSC on the deals you create.
      </p>
      <input
        type="search"
        className="name-picker-filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Find your name"
        aria-label="Find your name"
      />
      {error && <div className="text-danger mb-sm" role="alert">{error}</div>}
      <ul className="name-picker-list">
        {names.map((name) => (
          <li key={name}>
            <button
              type="button"
              className={cx('name-picker-item', name === me.name && 'is-current')}
              disabled={saving}
              onClick={() => pick(name)}
            >
              {name}
            </button>
          </li>
        ))}
        {names.length === 0 && <li className="name-picker-empty">No name on the board matches.</li>}
      </ul>
    </Modal>
  )
}
