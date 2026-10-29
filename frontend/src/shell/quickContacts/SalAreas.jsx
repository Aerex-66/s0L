import { useState } from 'react'
import { peopleWith, sameText } from '../../shared/utils/directory'
import AddPerson from './AddPerson'
import Chip from './Chip'

/** One row per service area: its SALs, who new deals name on that area's SAL row. */
export default function SalAreas({ areas, people, onAdd, onRemoveRole }) {
  const [area, setArea] = useState('')
  const chosen = area || areas[0] || ''

  return (
    <div className="qc-tab">
      <p className="qc-intro">
        Service area leads. A SAL review helps but is never a gate: it&apos;s an extra step, and a SAL can delegate it.
        New deals name these people on their SAL rows.
      </p>
      <AddPerson
        detail={(
          <select value={chosen} onChange={(event) => setArea(event.target.value)} aria-label="Service area">
            {areas.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
        canAdd={Boolean(chosen)}
        onAdd={(person) => onAdd(person, { kind: 'sal', area: chosen })}
      />
      <ul className="qc-rows">
        {areas.map((name) => {
          const leads = peopleWith(people, 'sal', (role) => sameText(role.area, name))
          return (
            <li key={name} className="qc-row">
              <span className="qc-row-label">{name}</span>
              <span className="qc-chips">
                {leads.length ? leads.map((person) => (
                  <Chip
                    key={person.id}
                    label={person.name}
                    sub={person.email}
                    title={person.email || 'No email on file'}
                    onRemove={() => onRemoveRole(person, (role) => role.kind === 'sal' && sameText(role.area, name))}
                    removeLabel={`Remove ${person.name} as ${name} SAL`}
                  />
                )) : <span className="qc-none">No SAL yet</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
