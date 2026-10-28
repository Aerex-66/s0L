import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cx } from '../../../shared/utils/cx'
import { boardClient, clientMatches } from '../newDealPayload'

/**
 * The client field for a deal going on the board: s0L's own list, drawn inside the dialog so it
 * scrolls (the browser's suggestion list sits outside it, where the dialog blocks scrolling).
 */
export default function ClientPicker({ value, clients, canAdd, onChange }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const listRef = useRef(null)
  const matches = useMemo(() => clientMatches(value, clients), [value, clients])
  const current = boardClient(value, clients)
  const typed = value.trim()

  // The dialog hears Escape before the field does: an open list catches it first and closes alone.
  useEffect(() => {
    if (!open) return undefined
    const closeList = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', closeList, true)
    return () => window.removeEventListener('keydown', closeList, true)
  }, [open])

  const choose = (client) => {
    onChange(client)
    setOpen(false)
    setActive(-1)
  }

  const move = (step) => {
    if (!matches.length) return
    const next = active < 0 ? (step > 0 ? 0 : matches.length - 1) : (active + step + matches.length) % matches.length
    setOpen(true)
    setActive(next)
    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
  }

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault()
      choose(matches[active])
    }
  }

  return (
    <div className="client-picker">
      <input
        type="text"
        name="client_name"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={canAdd ? 'Pick a client, or type a new one' : 'Pick a client'}
        autoComplete="off"
        required
      />
      {open && (
        // Keeps focus in the field while the list is clicked or its scrollbar dragged.
        <ul id={listId} ref={listRef} role="listbox" className="client-picker-list" onMouseDown={(event) => event.preventDefault()}>
          {matches.map((client, index) => (
            <li
              key={`${index}:${client}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={cx('client-picker-item', index === active && 'is-active', client === current && 'is-current')}
              onClick={() => choose(client)}
            >
              {client}
            </li>
          ))}
          {matches.length === 0 && (
            <li className="client-picker-note">
              {canAdd ? `"${typed}" will be added to the board as a new client.` : 'No client on the board matches. Only TT Execs can add a new one.'}
            </li>
          )}
        </ul>
      )}
      {!open && typed && !current && canAdd && (
        <p className="client-picker-hint">New client: it will be added to the board.</p>
      )}
    </div>
  )
}
