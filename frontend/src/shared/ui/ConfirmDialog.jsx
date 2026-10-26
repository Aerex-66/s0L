import Modal from './Modal'

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null

  return (
    <Modal title={title} onClose={onCancel} className="confirm-dialog">
      <p className="confirm-dialog-message">{message}</p>
      <div className="confirm-dialog-actions">
        <button className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
        <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  )
}
