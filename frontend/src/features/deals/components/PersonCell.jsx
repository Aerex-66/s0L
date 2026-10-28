import { fieldsWhere, getField, isMondayLinked } from '../../../shared/constants/fieldIndex'
import AssignCell from './AssignCell'

// People columns s0L may change on the monday board (marked writable in the field index).
const ASSIGNABLE = new Set(fieldsWhere((entry) => entry.monday?.writable).map(([key]) => key))

/** A deal's person in one people column: for TT Execs on a linked deal, a picker that changes the board; else the name. */
export default function PersonCell({ deal, field, assign, canAssign, clip = false }) {
  const value = deal[field] || ''
  if (!canAssign || !ASSIGNABLE.has(field) || !isMondayLinked(deal)) {
    return clip ? <span className="pm-clip" title={value}>{value}</span> : value
  }
  const { label } = getField(field)
  return (
    <AssignCell
      value={value}
      label={label}
      clip={clip}
      names={assign.people.columns[field] || []}
      people={assign.people}
      onOpen={assign.loadPeople}
      onPick={(name) => {
        if (name !== value) assign.ask({ dealId: deal.id, key: field, label, name, old: value, client: deal.client_name })
      }}
    />
  )
}
