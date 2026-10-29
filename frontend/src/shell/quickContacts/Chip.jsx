import { CloseIcon } from '../../shared/ui/Icons'

/** A tonal block for a person or a role, with a remove button. */
export default function Chip({ label, sub, title, onRemove, removeLabel }) {
  return (
    <span className="qc-chip" title={title}>
      <span className="qc-chip-label">{label}</span>
      {sub && <span className="qc-chip-sub">{sub}</span>}
      <button type="button" className="qc-chip-remove" onClick={onRemove} aria-label={removeLabel}>
        <CloseIcon size={11} />
      </button>
    </span>
  )
}
