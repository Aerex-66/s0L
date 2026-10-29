import { useEffect, useId, useRef, useState } from 'react'
import { BookUser } from 'lucide-react'
import { outlookService } from '../services/outlookService'
import { cx } from '../utils/cx'

const DELAY_MS = 180
const QUIET = { status: 'idle', people: [] }

/**
 * A name field that shows who Outlook thinks the typed name is, like Outlook's own To line: each
 * suggestion carries its email (and title) so there's no doubt. Picking one hands the whole person
 * to onPick; anything else stays a plain name. Without the Outlook app it is just a text field.
 */
export default function PersonLookup({ value, onChange, onPick, placeholder = 'Full name', autoFocus = false, required = false }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(-1)
  const [result, setResult] = useState(QUIET)
  const [picking, setPicking] = useState(false)
  const listId = useId()
  const latest = useRef(0)
  const query = String(value || '').trim()
  const asking = typed && query.length >= 2
  const shown = asking ? result : QUIET
  const people = shown.people || []
  const lookups = shown.status === 'ok' || shown.status === 'not_running'

  useEffect(() => {
    if (!asking) return undefined
    const ticket = ++latest.current
    const timer = setTimeout(() => {
      outlookService.people(query)
        .then((next) => { if (ticket === latest.current) setResult(next) })
        .catch(() => { if (ticket === latest.current) setResult({ status: 'failed', people: [] }) })
    }, DELAY_MS)
    return () => clearTimeout(timer)
  }, [asking, query])

  // The dialog around the field hears Escape too: an open list catches it first and closes alone.
  useEffect(() => {
    if (!open || !lookups) return undefined
    const closeList = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', closeList, true)
    return () => window.removeEventListener('keydown', closeList, true)
  }, [open, lookups])

  const choose = (person) => {
    onPick(person)
    setTyped(false)
    setOpen(false)
    setActive(-1)
  }

  const openAddressBook = () => {
    setPicking(true)
    outlookService.pickPerson()
      .then(({ person }) => { if (person) choose(person) })
      .catch(() => {})
      .finally(() => setPicking(false))
  }

  const handleKeyDown = (event) => {
    if (!open || !people.length) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => (current < 0 ? (step > 0 ? 0 : people.length - 1) : (current + step + people.length) % people.length))
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      choose(people[active])
    }
  }

  const showList = open && lookups

  return (
    <div className="person-lookup">
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setTyped(true)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        required={required}
      />
      {showList && (
        // Keeps focus in the field while the list is clicked or scrolled.
        <div className="person-lookup-pop" onMouseDown={(event) => event.preventDefault()}>
          <ul id={listId} role="listbox" className="person-lookup-list" aria-label="People in Outlook">
            {people.map((person, index) => (
              <li
                key={person.email}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cx('person-lookup-item', index === active && 'is-active')}
                onClick={() => choose(person)}
              >
                <span className="person-lookup-name">{person.name}</span>
                <span className="person-lookup-email">{person.email}</span>
                {(person.title || person.department) && (
                  <span className="person-lookup-meta">{[person.title, person.department].filter(Boolean).join(' · ')}</span>
                )}
              </li>
            ))}
          </ul>
          {shown.status === 'not_running' && <p className="person-lookup-note">Open Outlook to see who matches.</p>}
          {shown.status === 'ok' && people.length === 0 && (
            <p className="person-lookup-note">Outlook doesn&apos;t suggest anyone for &ldquo;{query}&rdquo;.</p>
          )}
          <button type="button" className="person-lookup-book" onClick={openAddressBook} disabled={picking}>
            <BookUser size={13} />
            {picking ? "Outlook's address book is open (it may be behind this window)" : "Search Outlook's address book…"}
          </button>
        </div>
      )}
    </div>
  )
}
