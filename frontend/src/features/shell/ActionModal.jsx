import { Suspense, useState, useRef, useCallback } from 'react'
import useStore from '../../shared/useStore'
import Modal from '../../shared/ui/Modal'
import LazyGate from '../../shared/ui/LazyGate'
import { postFormData } from '../../shared/apiClient'
import { cx } from '../../shared/utils/cx'
import { PaperclipIcon, UploadIcon } from '../../shared/ui/Icons'
import QuickSetupWizard from '../home/components/QuickSetupWizard'
import ImportModal from '../deals/components/ImportModal'
import ExportModal from '../deals/components/ExportModal'

export default function ActionModal({ deal, activeModuleId, onUpdate }) {
  const { showActionModal, setShowActionModal } = useStore()

  if (!showActionModal) return null

  const handleClose = () => setShowActionModal(false)

  const renderContent = () => {
    switch (activeModuleId) {
      case 'home':
        return (
          <QuickSetupWizard 
            deal={deal} 
            onComplete={() => { handleClose(); onUpdate(); }} 
          />
        )
      case 'gssm':
        return (
          <FileUploadPanel
            title="Upload GSSM"
            description="Upload an Excel file (.xlsx, .xlsm) to extract GSSM data."
            accept=".xlsx,.xlsm"
            moduleId="gssm"
            deal={deal}
            onSuccess={() => { handleClose(); onUpdate?.(); }}
          />
        )
      case 'isbd':
        return (
          <FileUploadPanel
            title="Import iSBD"
            description="Upload a PowerPoint file (.pptx) to import iSBD slides for preview and editing."
            accept=".pptx"
            moduleId="isbd"
            deal={deal}
            onSuccess={() => { handleClose(); onUpdate?.(); }}
          />
        )
      case 'documents':
        return (
          <FileUploadPanel
            title="Upload Document"
            description="Upload any document to the deal library."
            accept=".pptx,.xlsx,.xlsm,.pdf,.docx"
            moduleId="documents"
            deal={deal}
            onSuccess={() => { handleClose(); onUpdate?.(); }}
          />
        )
      default:
        return (
          <div className="action-modal-content">
            <h3>Action</h3>
            <p>No specific action defined for this module.</p>
          </div>
        )
    }
  }

  // QuickSetupWizard has its own Modal wrapper, so we don't wrap it again
  if (activeModuleId === 'home') {
    return (
      <LazyGate when={true}>
        {renderContent()}
      </LazyGate>
    )
  }

  return (
    <Modal 
      title={`Action: ${activeModuleId.toUpperCase()}`} 
      onClose={handleClose} 
      className="modal-medium"
    >
      {renderContent()}
    </Modal>
  )
}

// ── Reusable file upload panel with drag-drop ────────────────────

function FileUploadPanel({ title, description, accept, moduleId, deal, onSuccess }) {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle | uploading | done | error
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleFile = useCallback((f) => {
    if (!f) return
    setFile(f)
    setError(null)
    setStatus('idle')
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handleInputChange = useCallback((e) => {
    handleFile(e.target.files?.[0])
  }, [handleFile])

  const handleUpload = useCallback(async () => {
    if (!file || !deal?.id) return
    setStatus('uploading')
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('deal_id', deal.id)
      formData.append('module_id', moduleId)

      const res = await postFormData('/api/documents/powerpoint/read', formData)
      setResult(res)
      setStatus('done')
      // Small delay so the user sees the success state
      setTimeout(() => onSuccess?.(), 800)
    } catch (err) {
      console.error('[Upload] Failed:', err)
      // Try to parse structured error from backend (JSON with error + hint)
      let errorMsg = 'Upload failed'
      let hintMsg = null
      try {
        const parsed = JSON.parse(err.message)
        errorMsg = parsed.error || errorMsg
        hintMsg = parsed.hint || null
      } catch {
        errorMsg = err.message || errorMsg
      }
      setError(errorMsg)
      setResult(hintMsg ? { hint: hintMsg } : null)
      setStatus('error')
    }
  }, [file, deal?.id, moduleId, onSuccess])

  return (
    <div className="action-modal-content">
      <h3>{title}</h3>
      <p className="description-text">{description}</p>

      {/* Drop zone */}
      <div
        className={cx('action-dropzone', dragOver && 'drag-over', file && 'has-file')}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
        {file ? (
          <div className="action-dropzone-file">
            <span className="action-dropzone-icon"><PaperclipIcon size={18} /></span>
            <span className="action-dropzone-name">{file.name}</span>
            <span className="action-dropzone-size">{formatBytes(file.size)}</span>
          </div>
        ) : (
          <div className="action-dropzone-empty">
            <span className="action-dropzone-icon"><UploadIcon size={22} /></span>
            <span>Drag & drop file here, or <strong>click to browse</strong></span>
            <span className="action-dropzone-hint">Accepted: {accept}</span>
          </div>
        )}
      </div>

      {/* Status */}
      {status === 'uploading' && (
        <div className="action-status action-status-info">
          <span className="action-spinner" /> Uploading and processing…
        </div>
      )}
      {status === 'done' && (
        <div className="action-status action-status-success">
          ✓ Imported successfully{result?.document?.name ? ` — ${result.document.name}` : ''}
          {result?.extracted_field_count > 0 && (
            <span className="ml-sm opacity-muted">
              ({result.extracted_field_count} fields extracted)
            </span>
          )}
        </div>
      )}
      {status === 'error' && (
        <div className="action-status action-status-error">
          <div>⚠ {error || 'Upload failed'}</div>
          {result?.hint && (
            <div className="text-hint mt-xs">
              {result.hint}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="action-buttons">
        {file && status !== 'uploading' && status !== 'done' && (
          <button className="action-btn action-btn-primary" onClick={handleUpload}>
            Upload & Import
          </button>
        )}
        {file && status === 'idle' && (
          <button className="action-btn" onClick={() => { setFile(null); setError(null) }}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}