import { useState } from 'react'
import { rolesOf, peopleWith } from '../../shared/utils/directory'
import AddPerson from './AddPerson'
import Chip from './Chip'

const DEAL_TEAM_ROLES = [
  'Lead client partner',
  'Client partner',
  'Business development manager',
  'Sales leader',
  'Deal manager',
  'PAL (functional SME)',
  'Other',
]

const COPY = {
  deal_team: {
    intro: 'The sales team you work with: lead client partner, business development manager and so on. PALs go here too, as the functional SMEs you borrow when they are free. Someone with several roles stays one entry.',
    empty: 'No one on your Deal Team yet. Add people by name above.',
  },
  sldl: {
    intro: 'Service line delivery leads.',
    empty: 'No SLDLs yet. Add people by name above.',
  },
}

const initials = (name) => String(name || '?').split(/[\s.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

/** In this tab a role chip says only what differs: the Deal Team role, or the service line an SLDL covers. */
const roleLabel = (role) => [role.title, role.area].filter(Boolean).join(' · ') || (role.kind === 'sldl' ? 'SLDL' : 'Deal Team')

/** Deal Team and SLDL: one row per person, their roles in this tab as chips. */
export default function PeopleList({ kind, people, onAdd, onRemoveRole }) {
  const [title, setTitle] = useState(DEAL_TEAM_ROLES[0])
  const [area, setArea] = useState('')
  const members = peopleWith(people, kind)

  const detail = kind === 'deal_team'
    ? (
      <select value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Role on the Deal Team">
        {DEAL_TEAM_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
      </select>
    )
    : <input type="text" value={area} onChange={(event) => setArea(event.target.value)} placeholder="Service line (optional)" aria-label="Service line" />

  const role = kind === 'deal_team' ? { kind, title } : { kind, area: area.trim() }

  return (
    <div className="qc-tab">
      <p className="qc-intro">{COPY[kind].intro}</p>
      <AddPerson detail={detail} onAdd={(person) => onAdd(person, role)} />
      {members.length ? (
        <ul className="qc-people">
          {members.map((person) => (
            <li key={person.id} className="qc-person">
              <span className="ws-initials" aria-hidden="true">{initials(person.name)}</span>
              <span className="qc-person-who">
                <span className="qc-person-name">{person.name}</span>
                <span className={person.email ? 'qc-person-email' : 'qc-none'}>{person.email || 'No email on file'}</span>
                {(person.title || person.department) && (
                  <span className="qc-person-meta">{[person.title, person.department].filter(Boolean).join(' · ')}</span>
                )}
              </span>
              <span className="qc-chips">
                {rolesOf(person, kind).map((held, index) => (
                  <Chip
                    key={`${roleLabel(held)}-${index}`}
                    label={roleLabel(held)}
                    onRemove={() => onRemoveRole(person, (candidate) => candidate === held)}
                    removeLabel={`Remove ${person.name} as ${roleLabel(held)}`}
                  />
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="qc-empty">{COPY[kind].empty}</p>
      )}
    </div>
  )
}
