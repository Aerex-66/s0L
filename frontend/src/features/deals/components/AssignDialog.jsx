import ConfirmDialog from '../../../shared/ui/ConfirmDialog'

/** Asks before a picked name changes the monday board, and shows monday's answer when it refuses. */
export default function AssignDialog({ assign }) {
  const { change } = assign
  return (
    <ConfirmDialog
      isOpen={Boolean(change)}
      title="Change the monday board?"
      message={change && (
        <>
          {change.label} on {change.client || 'this deal'}: {change.old || 'nobody'} → <strong>{change.name}</strong>.
          {' '}Everyone sees the change on the board.
          {assign.error && <span className="pm-assign-error" role="alert">{assign.error}</span>}
        </>
      )}
      confirmLabel={assign.saving ? 'Changing…' : 'Change on monday'}
      onConfirm={assign.confirm}
      onCancel={assign.cancel}
    />
  )
}
