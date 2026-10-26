import { useState, useCallback, useRef, memo, useMemo, useEffect } from 'react'
import './DocumentsModule.css'
import useDocuments, { REQUIRED_DOCUMENTS } from './useDocuments'
import { buildUrl, get, post } from '../../shared/apiClient'
import { dealService } from '../../shared/services/dealService'
import {
  SearchIcon,
  UploadSmallIcon,
  DownloadIcon,
  CheckIcon,
  PlusIcon,
  FolderIcon,
  FolderOpenIcon,
  FileDropIcon,
  TrashIcon,
  CloudUploadIcon,
  ChevronRightIcon,
} from '../../shared/ui/Icons'
import { cx } from '../../shared/utils/cx'

/* ── Format helpers ────────────────────────── */
const FMT = { pptx: 'PPTX', xlsx: 'XLSX', xlsm: 'XLSM', pdf: 'PDF', docx: 'DOCX', csv: 'CSV' }

function FormatBadge({ format, className = '' }) {
  const f = (format || '').toLowerCase()
  const c = ['pptx', 'xlsx', 'xlsm', 'pdf', 'docx'].includes(f) ? f : 'default'
  return <span className={`${className} ${c}`}>{FMT[f] || f.toUpperCase() || '—'}</span>
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtSize(b) {
  if (!b && b !== 0) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

/* ════════════════════════════════════════════
   RequiredSlot — single required document row
   ════════════════════════════════════════════ */

const RequiredSlot = memo(function RequiredSlot({ slot, matchedDoc, onUpload, onDownload, onDelete, onSendToCloud }) {
  const filled = Boolean(matchedDoc)
  // Use actual file format when uploaded, fall back to slot's expected format
  const actualFmt = filled ? (matchedDoc.format || '').toLowerCase() : ''
  const fmtLabel = filled ? (FMT[actualFmt] || actualFmt.toUpperCase() || slot.formatLabel) : slot.formatLabel
  const fmtClass = filled
    ? (['pptx', 'xlsx', 'xlsm', 'pdf', 'docx'].includes(actualFmt) ? actualFmt : 'any')
    : slot.formatClass

  return (
    <div className={`docs-slot${filled ? ' filled' : ''}`}>
      {/* Top row: status + document name */}
      <div className="docs-slot-main">
        <div className={`docs-slot-status ${filled ? 'uploaded' : 'missing'}`}>
          {filled ? <CheckIcon /> : <PlusIcon />}
        </div>
        <span className="docs-slot-name">{slot.label}</span>
      </div>

      {/* Bottom row: format + date + actions */}
      <div className="docs-slot-bottom-row">
        <span className={`docs-slot-format ${fmtClass}`}>{fmtLabel}</span>
        {filled && <span className="docs-slot-date">{fmtDate(matchedDoc.ingested_at)}</span>}
        {!filled && <span className="docs-slot-hint">Not uploaded</span>}
        <div className="docs-slot-actions">
          {filled && (
            <>
              <button className="docs-slot-action" onClick={() => onDownload(matchedDoc)} title="Download"><DownloadIcon /></button>
              {onSendToCloud && (
                <button className="docs-slot-action docs-cloud-action" onClick={() => onSendToCloud(matchedDoc)} title="Send to OneDrive"><CloudUploadIcon /></button>
              )}
              <button className="docs-slot-action docs-delete-action" onClick={() => onDelete(matchedDoc)} title="Remove from app"><TrashIcon /></button>
            </>
          )}
          <button className={`docs-slot-action${filled ? '' : ' upload-trigger'}`} onClick={() => onUpload(slot.id)} title={filled ? 'Replace' : 'Upload'}>
            <UploadSmallIcon /> {filled ? 'Replace' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
})

/* ════════════════════════════════════════════
   LibraryCard — uploaded doc in the library grid
   ════════════════════════════════════════════ */
const LibraryCard = memo(function LibraryCard({ doc, selected, onClick, onDownload, onDelete, onSendToCloud }) {
  const fmt = (doc.format || '').toLowerCase()
  const hasPptxThumb = fmt === 'pptx' && doc.id

  return (
    <div className={`docs-lib-card${selected ? ' selected' : ''}`} onClick={() => onClick(doc)}>
      <div className="docs-lib-card-thumb">
        {hasPptxThumb
          ? <img src={buildUrl(`/api/documents/slides/${doc.id}/1`)} alt={doc.name} loading="lazy" onError={e => { e.target.style.display = 'none' }} />
          : <FormatBadge format={fmt} className="docs-lib-format-icon" />
        }
      </div>
      <div className="docs-lib-card-body">
        <div className="docs-lib-card-name" title={doc.name}>{doc.name}</div>
        <div className="docs-lib-card-meta">
          {doc.module && <span className={`docs-lib-card-tag mod-${doc.module}`}>{doc.module}</span>}
          <span className="docs-lib-card-date">{fmtDate(doc.ingested_at)}</span>
        </div>
      </div>
      <div className="docs-lib-card-actions">
        <button className="docs-lib-action-btn" onClick={e => { e.stopPropagation(); onDownload(doc) }} title="Download">
          <DownloadIcon /> Download
        </button>
        {onSendToCloud && (
          <button className="docs-lib-action-btn docs-cloud-action" onClick={e => { e.stopPropagation(); onSendToCloud(doc) }} title="Send to OneDrive">
            <CloudUploadIcon /> OneDrive
          </button>
        )}
        <button className="docs-lib-action-btn docs-delete-action" onClick={e => { e.stopPropagation(); onDelete(doc) }} title="Remove from app">
          <TrashIcon /> Remove
        </button>
      </div>
    </div>
  )
})

/* ════════════════════════════════════════════
   DocumentPreview — right-side detail panel
   ════════════════════════════════════════════ */
function DocumentPreview({ doc, onClose, onDownload, onDelete }) {
  if (!doc) return null
  const fmt = (doc.format || '').toLowerCase()
  const isPptx = fmt === 'pptx'
  const slides = doc.slide_count || doc.extracted_field_count || 0

  return (
    <div className="docs-preview">
      <div className="docs-preview-header">
        <div className="docs-preview-title" title={doc.name}>{doc.name}</div>
        <button className="docs-preview-close" onClick={onClose}>&times;</button>
      </div>
      <div className="docs-preview-body">
        <div className="docs-preview-thumb">
          {isPptx && doc.id
            ? <img src={buildUrl(`/api/documents/slides/${doc.id}/1`)} alt="Slide 1" onError={e => { e.target.style.display = 'none' }} />
            : <FormatBadge format={fmt} className="docs-lib-format-icon" />}
        </div>
        <div className="docs-preview-field">
          <div className="docs-preview-label">File Name</div>
          <div className="docs-preview-value">{doc.name}</div>
        </div>
        <div className="docs-preview-field">
          <div className="docs-preview-label">Format</div>
          <div className="docs-preview-value">{(fmt || '—').toUpperCase()}</div>
        </div>
        {doc.module && (
          <div className="docs-preview-field">
            <div className="docs-preview-label">Module</div>
            <div className="docs-preview-value">{doc.module.toUpperCase()}</div>
          </div>
        )}
        <div className="docs-preview-field">
          <div className="docs-preview-label">Uploaded</div>
          <div className="docs-preview-value">{fmtDate(doc.ingested_at)}</div>
        </div>
        {doc.source && (
          <div className="docs-preview-field">
            <div className="docs-preview-label">Source</div>
            <div className="docs-preview-value">{doc.source}</div>
          </div>
        )}
        {isPptx && slides > 0 && (
          <>
            <div className="docs-preview-label" style={{ marginTop: '0.5rem' }}>Slides</div>
            <div className="docs-preview-slides">
              {Array.from({ length: Math.min(slides, 9) }, (_, i) => (
                <div className="docs-preview-slide-thumb" key={i}>
                  <img src={buildUrl(`/api/documents/slides/${doc.id}/${i + 1}`)} alt={`Slide ${i + 1}`} loading="lazy" onError={e => { e.target.style.display = 'none' }} />
                </div>
              ))}
            </div>
          </>
        )}
        <div className="docs-preview-actions">
          <button className="docs-preview-action-btn primary" onClick={() => onDownload(doc)}>Download</button>
          <button className="docs-preview-action-btn docs-delete-action" onClick={() => { onDelete(doc); onClose() }}>Remove</button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   UploadPanel — modal overlay with drag-drop
   ════════════════════════════════════════════ */
function UploadPanel({ onClose, onUpload, preselectedSlot }) {
  const [file, setFile] = useState(null)
  const [slotId, setSlotId] = useState(preselectedSlot || '')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleFile = useCallback(f => { if (f) { setFile(f); setError(null); setStatus('idle') } }, [])
  const handleDrop = useCallback(e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer?.files?.[0]) }, [handleFile])

  const handleUpload = useCallback(async () => {
    if (!file) return
    setStatus('uploading')
    setError(null)
    try {
      await onUpload(file, slotId)
      setStatus('done')
      setTimeout(() => onClose(), 600)
    } catch (err) {
      let msg = 'Upload failed'
      try { msg = JSON.parse(err.message)?.error || msg } catch { msg = err.message || msg }
      setError(msg)
      setStatus('error')
    }
  }, [file, slotId, onUpload, onClose])

  const ext = file ? (file.name.split('.').pop() || '').toLowerCase() : ''
  const extCls = ['pptx', 'xlsx', 'xlsm', 'pdf', 'docx'].includes(ext) ? ext : 'default'

  return (
    <div className="docs-upload-overlay" onClick={onClose}>
      <div className="docs-upload-panel" onClick={e => e.stopPropagation()}>
        <div className="docs-upload-panel-header">
          <div className="docs-upload-panel-title">
            {preselectedSlot
              ? `Upload: ${REQUIRED_DOCUMENTS.find(r => r.id === preselectedSlot)?.label || 'Document'}`
              : 'Upload Document'}
          </div>
          <button className="docs-upload-panel-close" onClick={onClose}>&times;</button>
        </div>
        <div className="docs-upload-panel-body">
          {/* Slot selector (hidden if preselected) */}
          {!preselectedSlot && (
            <>
              <div className="docs-upload-slot-label">Document Type</div>
              <select
                className="docs-upload-slot-select"
                value={slotId}
                onChange={e => setSlotId(e.target.value)}
              >
                <option value="">General (no category)</option>
                {REQUIRED_DOCUMENTS.map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </>
          )}

          {/* Dropzone */}
          <div
            className={`docs-dropzone${dragOver ? ' drag-over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
          >
            <div className="docs-dropzone-icon"><FileDropIcon /></div>
            <div className="docs-dropzone-text"><strong>Click to browse</strong> or drag & drop</div>
            <div className="docs-dropzone-hint">.pptx, .xlsx, .xlsm, .pdf, .docx</div>
            <input ref={inputRef} type="file" accept=".pptx,.xlsx,.xlsm,.pdf,.docx,.csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
          </div>

          {/* Selected file */}
          {file && (
            <div className="docs-upload-file-row">
              <div className={`docs-upload-file-icon ${extCls}`}>{ext.toUpperCase()}</div>
              <div className="docs-upload-file-name">{file.name}</div>
              <div className="docs-upload-file-size">{fmtSize(file.size)}</div>
              <button className="docs-upload-file-remove" onClick={() => { setFile(null); setStatus('idle') }}>&times;</button>
            </div>
          )}

          {/* Status */}
          {status === 'uploading' && (
            <div className="docs-upload-progress">
              <div className="docs-upload-spinner" />
              <span className="docs-upload-status">Uploading {file?.name}...</span>
            </div>
          )}
          {status === 'done' && <div className="docs-upload-success">Document uploaded successfully.</div>}
          {status === 'error' && error && <div className="docs-upload-error">{error}</div>}
        </div>
        <div className="docs-upload-panel-footer">
          <button className="docs-tool-btn" onClick={onClose}>Cancel</button>
          <button className="docs-upload-btn" disabled={!file || status === 'uploading'} onClick={handleUpload}>
            {status === 'uploading' ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   DOCUMENTS MODULE — main component
   ════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════
   ExternalLinks — GPE / GSSM / RBK / DCA URLs
   ════════════════════════════════════════════ */
const LINK_DEFS = [
  { key: 'gpe_url', label: 'GPE' },
  { key: 'rbk_url', label: 'RBK' },
  { key: 'dca_url', label: 'DCA' },
  { key: 'onedrive_url', label: 'Deal Team Folder' },
  { key: 'greenstar_url', label: 'Greenstar' },
  { key: 'swb_url', label: 'SWB' },
  { key: 'adtd_url', label: 'ADTD' },
  { key: 'tiger_url', label: 'Tiger Team' },
]

const ExternalLinks = memo(function ExternalLinks({ deal, onUpdate }) {
  const [links, setLinks] = useState(() => {
    const ext = deal.external_links || deal.financials || {}
    return Object.fromEntries(LINK_DEFS.map(d => [d.key, ext[d.key] || '']))
  })
  // Track which links are saved (have a persisted value)
  const [saved, setSaved] = useState(() => {
    const ext = deal.external_links || deal.financials || {}
    return Object.fromEntries(LINK_DEFS.map(d => [d.key, Boolean(ext[d.key])]))
  })
  const [editing, setEditing] = useState({})
  const [drafts, setDrafts] = useState({})

  // Sync when deal changes
  const dealId = deal.id
  const extRef = useRef(dealId)
  if (extRef.current !== dealId) {
    extRef.current = dealId
    const ext = deal.external_links || deal.financials || {}
    setLinks(Object.fromEntries(LINK_DEFS.map(d => [d.key, ext[d.key] || ''])))
    setSaved(Object.fromEntries(LINK_DEFS.map(d => [d.key, Boolean(ext[d.key])])))
    setEditing({})
    setDrafts({})
  }

  const saveLink = useCallback(async (key, value) => {
    const next = { ...links, [key]: value }
    setLinks(next)
    setSaved(prev => ({ ...prev, [key]: Boolean(value) }))
    setEditing(prev => ({ ...prev, [key]: false }))
    try {
      await dealService.update(deal.id, { external_links: next })
      onUpdate?.()
    } catch (e) { console.error('link save error:', e) }
  }, [links, deal.id, onUpdate])

  const clearLink = useCallback(async (key) => {
    const next = { ...links, [key]: '' }
    setLinks(next)
    setSaved(prev => ({ ...prev, [key]: false }))
    setEditing(prev => ({ ...prev, [key]: false }))
    try {
      await dealService.update(deal.id, { external_links: next })
      onUpdate?.()
    } catch (e) { console.error('link clear error:', e) }
  }, [links, deal.id, onUpdate])

  const startEdit = (key) => {
    setDrafts(prev => ({ ...prev, [key]: links[key] || '' }))
    setEditing(prev => ({ ...prev, [key]: true }))
  }

  const cancelEdit = (key) => {
    setEditing(prev => ({ ...prev, [key]: false }))
  }

  return (
    <div className="docs-section docs-links-section">
      <div className="docs-section-header">
        <span className="docs-section-title">External Links</span>
      </div>
      <div className="docs-links">
        {LINK_DEFS.map(({ key, label }) => {
          const isEditing = editing[key] || !saved[key]
          const url = links[key]

          return (
            <div key={key} className="docs-link-row">
              <span className="docs-link-label">{label}</span>
              {isEditing ? (
                <>
                  <input
                    type="url"
                    className="docs-link-input"
                    value={drafts[key] ?? url}
                    onChange={e => setDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveLink(key, drafts[key] ?? url) }}
                    placeholder="https://..."
                    autoFocus={saved[key]}
                  />
                  <button className="docs-link-btn docs-link-save" onClick={() => saveLink(key, drafts[key] ?? url)} title="Save">&#10003;</button>
                  {url && <a className="docs-link-btn docs-link-go" href={url} target="_blank" rel="noopener noreferrer" title="Open">&#8599;</a>}
                  {saved[key] && <button className="docs-link-btn docs-link-cancel" onClick={() => cancelEdit(key)} title="Cancel">&times;</button>}
                </>
              ) : (
                <>
                  <a className="docs-link-href" href={url} target="_blank" rel="noopener noreferrer" title={url}>{url}</a>
                  <button className="docs-link-btn docs-link-edit" onClick={() => startEdit(key)} title="Edit">&#9998;</button>
                  <button className="docs-link-btn docs-link-remove" onClick={() => clearLink(key)} title="Remove">&times;</button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

/* ════════════════════════════════════════════
   FolderPickerModal — browse local sync folder
   ════════════════════════════════════════════ */
function FolderPickerModal({ rootPath, onSelect, onClose }) {
  const [currentPath, setCurrentPath] = useState(rootPath)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const browse = useCallback(async (path) => {
    setLoading(true)
    setError(null)
    try {
      const result = await post('/api/documents/cloud-sync/browse', { path })
      setCurrentPath(result.path)
      setEntries(result.entries || [])
    } catch (e) {
      setError(e.message || 'Failed to browse folder')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { browse(rootPath) }, [rootPath, browse])

  const folders = entries.filter(e => e.is_dir)

  const goUp = () => {
    const parent = currentPath.replace(/[\\/][^\\/]+$/, '')
    if (parent && parent !== currentPath) browse(parent)
  }

  return (
    <div className="docs-upload-overlay" onClick={onClose}>
      <div className="docs-folder-picker" onClick={e => e.stopPropagation()}>
        <div className="docs-folder-picker-header">
          <span className="docs-folder-picker-title">Choose Subfolder</span>
          <button className="docs-upload-panel-close" onClick={onClose}>&times;</button>
        </div>
        <div className="docs-folder-picker-path">
          <button className="docs-folder-picker-up" onClick={goUp} title="Go up">&larr;</button>
          <span className="docs-folder-picker-current" title={currentPath}>{currentPath}</span>
        </div>
        <div className="docs-folder-picker-list">
          {loading && <div className="docs-folder-picker-loading">Loading...</div>}
          {error && <div className="docs-upload-error">{error}</div>}
          {!loading && !error && folders.length === 0 && (
            <div className="docs-folder-picker-empty">No subfolders</div>
          )}
          {!loading && folders.map(f => (
            <button
              key={f.name}
              className="docs-folder-picker-item"
              onClick={() => browse(currentPath + '\\' + f.name)}
            >
              <FolderOpenIcon /> <span>{f.name}</span> <ChevronRightIcon />
            </button>
          ))}
        </div>
        <div className="docs-folder-picker-footer">
          <button className="docs-tool-btn" onClick={onClose}>Cancel</button>
          <button className="docs-upload-btn" onClick={() => onSelect(currentPath)}>
            Send Here
          </button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   CloudSyncSection — per-deal OneDrive path
   ════════════════════════════════════════════ */
const CloudSyncSection = memo(function CloudSyncSection({ deal, onUpdate }) {
  const [roots, setRoots] = useState([])        // discovered OneDrive roots
  const [loading, setLoading] = useState(false)
  const [discovered, setDiscovered] = useState(false)
  const [status, setStatus] = useState(null)     // null | 'saving' | 'saved' | 'error'
  const [showPicker, setShowPicker] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const syncPath = deal.cloud_sync_path || ''

  // Discover OneDrive roots on first render or when user clicks
  const discover = useCallback(async () => {
    setLoading(true)
    try {
      const result = await get('/api/documents/cloud-sync/discover')
      setRoots(result || [])
      setDiscovered(true)
    } catch (e) {
      console.error('OneDrive discovery failed:', e)
      setRoots([])
      setDiscovered(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-discover on mount
  useEffect(() => { discover() }, [discover])

  // Build flat list of selectable folders: root + each top-level subfolder
  const folderOptions = useMemo(() => {
    const opts = []
    for (const root of roots) {
      opts.push({ path: root.path, label: root.label, isRoot: true, email: root.email })
      for (const sub of root.folders || []) {
        opts.push({ path: root.path + '\\' + sub, label: sub, isRoot: false, parent: root.label })
      }
    }
    return opts
  }, [roots])

  const selectFolder = useCallback(async (path) => {
    setStatus('saving')
    try {
      await dealService.update(deal.id, { cloud_sync_path: path })
      setStatus('saved')
      onUpdate?.()
      setTimeout(() => setStatus(null), 2000)
    } catch (e) {
      setStatus('error')
    }
  }, [deal.id, onUpdate])

  const clearPath = useCallback(async () => {
    setStatus(null)
    try {
      await dealService.update(deal.id, { cloud_sync_path: '' })
      onUpdate?.()
    } catch (e) { console.error('clear sync path error:', e) }
  }, [deal.id, onUpdate])

  // Friendly display: show just the last 2 path segments
  const shortPath = syncPath ? syncPath.split('\\').slice(-2).join(' / ') : ''

  return (
    <div className="docs-section docs-cloud-sync-section">
      {syncPath ? (
        /* ── Connected: single row ── */
        <div className="docs-cloud-sync-row">
          <div className="docs-cloud-sync-left">
            <CloudUploadIcon />
            <span className="docs-cloud-sync-label">OneDrive</span>
            <span className="docs-section-badge complete">Connected</span>
          </div>
          <span className="docs-cloud-sync-path" title={syncPath}>{shortPath}</span>
          <div className="docs-cloud-sync-right">
            <button className="docs-link-btn docs-link-edit" onClick={() => setShowPicker(true)} title="Change folder">&#9998;</button>
            <button className="docs-link-btn docs-link-remove" onClick={clearPath} title="Disconnect">&times;</button>
          </div>
        </div>
      ) : (
        /* ── Not connected ── */
        <>
          <div className="docs-section-header">
            <span className="docs-section-title"><CloudUploadIcon /> OneDrive Sync</span>
          </div>
          <div className="docs-cloud-sync-body">
            <div className="docs-cloud-sync-empty">
              {loading ? (
                <span className="docs-cloud-sync-status">Discovering OneDrive folders...</span>
              ) : discovered && folderOptions.length === 0 ? (
                <span className="docs-cloud-sync-status error">No OneDrive sync folders found on this machine.</span>
              ) : (
                <button className="docs-cloud-connect-btn" onClick={() => setShowPicker(true)}>
                  <FolderOpenIcon /> Connect OneDrive Folder
                </button>
              )}
            </div>
            {status === 'saving' && <span className="docs-cloud-sync-status">Saving...</span>}
            {status === 'saved' && <span className="docs-cloud-sync-status saved">Connected</span>}
            {status === 'error' && <span className="docs-cloud-sync-status error">Failed to save</span>}

            {/* How-to link */}
            <button className="docs-cloud-help-toggle" onClick={() => setShowHelp(h => !h)}>
              {showHelp ? 'Hide instructions' : "Don't see your folder?"}
            </button>
            {showHelp && (
              <div className="docs-cloud-help">
                <p className="docs-cloud-help-intro">To send files to a deal team's OneDrive, the folder must be synced locally first. It only takes a few seconds:</p>
                <ol className="docs-cloud-help-steps">
                  <li>Open the shared OneDrive/SharePoint folder link in your <strong>browser</strong></li>
                  <li>Click <strong>"Add shortcut to My files"</strong> in the top toolbar (or click <strong>Sync</strong>)</li>
                  <li>The folder will appear in your local OneDrive within seconds</li>
                  <li>Come back here and click <strong>Refresh</strong> below</li>
                </ol>
                <button className="docs-cloud-connect-btn" onClick={() => { discover(); setShowHelp(false) }}>
                  Refresh Folders
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Inline folder picker */}
      {showPicker && (
        <div className="docs-cloud-picker-overlay" onClick={() => setShowPicker(false)}>
          <div className="docs-cloud-picker" onClick={e => e.stopPropagation()}>
            <div className="docs-folder-picker-header">
              <span className="docs-folder-picker-title">Select OneDrive Folder</span>
              <button className="docs-upload-panel-close" onClick={() => setShowPicker(false)}>&times;</button>
            </div>
            <div className="docs-cloud-picker-list">
              {loading && <div className="docs-folder-picker-loading">Discovering...</div>}
              {!loading && folderOptions.length === 0 && (
                <div className="docs-folder-picker-empty">No synced folders found. See instructions below the sync section.</div>
              )}
              {!loading && folderOptions.map((opt, i) => (
                <button
                  key={opt.path}
                  className={`docs-cloud-picker-item${opt.isRoot ? ' root' : ''}${opt.path === syncPath ? ' active' : ''}`}
                  onClick={() => { selectFolder(opt.path); setShowPicker(false) }}
                >
                  {opt.isRoot ? <CloudUploadIcon /> : <FolderOpenIcon />}
                  <span className="docs-cloud-picker-label">{opt.label}</span>
                  {opt.isRoot && opt.email && <span className="docs-cloud-picker-email">{opt.email}</span>}
                  {!opt.isRoot && <span className="docs-cloud-picker-parent">{opt.parent}</span>}
                </button>
              ))}
            </div>
            <div className="docs-folder-picker-footer">
              <button className="docs-tool-btn" onClick={() => discover()} title="Refresh">Refresh</button>
              <button className="docs-tool-btn" onClick={() => setShowPicker(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default function DocumentsModule({ deal, onUpdate }) {
  const [showUpload, setShowUpload] = useState(false)
  const [uploadSlotId, setUploadSlotId] = useState('')
  const [selectedDocId, setSelectedDocId] = useState(null)

  const [showLibrary, setShowLibrary] = useState(false)

  const {
    documents: allDocuments,
    loading,
    reload,
    searchQuery,
    setSearchQuery,
    uploadDocument,
    downloadDocument,
    deleteDocument,
    requiredSlotMap,
  } = useDocuments(deal)

  // Readiness: how many required docs are fulfilled
  const readiness = useMemo(() => {
    const filled = REQUIRED_DOCUMENTS.filter(r => requiredSlotMap[r.id]).length
    const total = REQUIRED_DOCUMENTS.length
    const pct = total > 0 ? Math.round((filled / total) * 100) : 0
    return { filled, total, pct }
  }, [requiredSlotMap])

  const readinessClass = readiness.pct >= 80 ? 'high' : readiness.pct >= 40 ? 'mid' : 'low'

  // IDs of docs already filling a required slot
  const filledDocIds = useMemo(() => {
    const ids = new Set()
    for (const slot of REQUIRED_DOCUMENTS) {
      const doc = requiredSlotMap[slot.id]
      if (doc) ids.add(doc.id)
    }
    return ids
  }, [requiredSlotMap])

  // Filter library docs: exclude required-slot docs, apply search
  const libraryDocs = useMemo(() => {
    const base = allDocuments.filter(d => !filledDocIds.has(d.id))
    if (!searchQuery.trim()) return base
    const q = searchQuery.toLowerCase()
    return base.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.module || '').toLowerCase().includes(q) ||
      (d.format || '').toLowerCase().includes(q)
    )
  }, [allDocuments, searchQuery, filledDocIds])

  const selectedDoc = allDocuments.find(d => d.id === selectedDocId) || null

  // Open upload modal for a specific slot or general
  const openUpload = useCallback((slotId = '') => {
    setUploadSlotId(slotId)
    setShowUpload(true)
  }, [])

  const handleUpload = useCallback(async (file, slotId) => {
    await uploadDocument(file, slotId || '')
    onUpdate?.()
  }, [uploadDocument, onUpdate])

  const handleDocClick = useCallback(doc => {
    setSelectedDocId(prev => prev === doc.id ? null : doc.id)
  }, [])

  const handleDownload = useCallback(doc => { downloadDocument(doc) }, [downloadDocument])

  const handleDelete = useCallback(async (doc) => {
    try {
      await deleteDocument(doc)
      if (selectedDocId === doc.id) setSelectedDocId(null)
      onUpdate?.()
    } catch (err) {
      console.error('Error deleting document:', err)
    }
  }, [deleteDocument, selectedDocId, onUpdate])

  // ── Cloud sync (Send to OneDrive) ────────
  const [cloudSendDoc, setCloudSendDoc] = useState(null)  // doc being sent
  const [cloudSendStatus, setCloudSendStatus] = useState(null)  // null | 'sending' | {ok, dest_name} | {error}

  const syncPath = deal.cloud_sync_path || ''

  const handleSendToCloud = useCallback((doc) => {
    if (!syncPath) return
    setCloudSendDoc(doc)
    setCloudSendStatus(null)
  }, [syncPath])

  const executeSendToCloud = useCallback(async (targetFolder) => {
    if (!cloudSendDoc) return
    setCloudSendStatus('sending')
    try {
      const result = await post(`/api/documents/${cloudSendDoc.id}/send-to-cloud`, { target_folder: targetFolder })
      setCloudSendStatus(result)
      setTimeout(() => { setCloudSendDoc(null); setCloudSendStatus(null) }, 2000)
    } catch (e) {
      setCloudSendStatus({ error: e.message || 'Send failed' })
    }
  }, [cloudSendDoc])

  const onSendToCloud = syncPath ? handleSendToCloud : null

  // ── Loading ──────────────────────────────
  if (loading && allDocuments.length === 0) {
    return (
      <div className="docs-module">
        <div className="docs-loading">
          <div className="docs-upload-spinner" style={{ width: 20, height: 20 }} />
          <span className="docs-loading-text">Loading documents...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="docs-module">
      {/* ── Toolbar ─────────────────────────── */}
      <div className="docs-toolbar">
        <div className="docs-toolbar-left">
          <span className="docs-toolbar-title">Documents</span>
          <div className="docs-readiness">
            <div className="docs-readiness-bar">
              <div className={`docs-readiness-fill ${readinessClass}`} style={{ width: `${readiness.pct}%` }} />
            </div>
            <span className="docs-readiness-label">{readiness.filled}/{readiness.total}</span>
          </div>
        </div>
        <div className="docs-toolbar-center">
          <div className="docs-search">
            <SearchIcon className="docs-search-icon" />
            <input
              className="docs-search-input"
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="docs-toolbar-right">
          <button className="docs-upload-btn" onClick={() => openUpload('')}>
            <UploadSmallIcon /> Upload
          </button>
        </div>
      </div>

      {/* ── External Links ────────────────── */}
      <ExternalLinks deal={deal} onUpdate={onUpdate} />

      {/* ── OneDrive Sync ─────────────────── */}
      <CloudSyncSection deal={deal} onUpdate={onUpdate} />

      {/* ── Body ────────────────────────────── */}
      <div className={selectedDoc ? 'docs-preview-split' : ''} style={selectedDoc ? {} : { display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>
        <div className="docs-body">
          {/* Required Documents */}
          <div className="docs-section">
            <div className="docs-section-header">
              <span className="docs-section-title">Required Documents</span>
              <span className={`docs-section-badge ${readiness.pct === 100 ? 'complete' : readiness.filled > 0 ? 'partial' : 'empty'}`}>
                {readiness.pct === 100 ? 'Complete' : `${readiness.filled} of ${readiness.total}`}
              </span>
            </div>
            <div className="docs-required-grid">
              {REQUIRED_DOCUMENTS.map(slot => (
                <RequiredSlot
                  key={slot.id}
                  slot={slot}
                  matchedDoc={requiredSlotMap[slot.id] || null}
                  onUpload={openUpload}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                  onSendToCloud={onSendToCloud}
                />
              ))}
            </div>
          </div>

          {/* Document Library — collapsible */}
          <div className="docs-section">
            <div className="docs-section-header docs-section-collapsible" onClick={() => setShowLibrary(v => !v)}>
              <span className="docs-section-title">
                <span className={`docs-collapse-arrow${showLibrary ? ' open' : ''}`}>&#9654;</span>
                All Documents
              </span>
              {libraryDocs.length > 0 && (
                <span className="docs-section-badge empty">{libraryDocs.length}</span>
              )}
            </div>
            {showLibrary && (
              libraryDocs.length === 0 ? (
                <div className="docs-empty">
                  <div className="docs-empty-icon"><FolderIcon /></div>
                  <div className="docs-empty-title">
                    {searchQuery ? 'No matching documents' : 'No extra documents'}
                  </div>
                  <div className="docs-empty-desc">
                    {searchQuery
                      ? 'Try a different search term.'
                      : 'Documents not assigned to a required slot will appear here.'}
                  </div>
                </div>
              ) : (
                <div className="docs-library-grid">
                  {libraryDocs.map(doc => (
                    <LibraryCard
                      key={doc.id}
                      doc={doc}
                      selected={selectedDocId === doc.id}
                      onClick={handleDocClick}
                      onDownload={handleDownload}
                      onDelete={handleDelete}
                      onSendToCloud={onSendToCloud}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {/* Preview panel */}
        {selectedDoc && (
          <DocumentPreview
            doc={selectedDoc}
            onClose={() => setSelectedDocId(null)}
            onDownload={handleDownload}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* Upload overlay */}
      {showUpload && (
        <UploadPanel
          preselectedSlot={uploadSlotId}
          onClose={() => setShowUpload(false)}
          onUpload={handleUpload}
        />
      )}

      {/* Folder picker for Send to OneDrive */}
      {cloudSendDoc && cloudSendStatus !== 'sending' && !cloudSendStatus?.ok && (
        <FolderPickerModal
          rootPath={syncPath}
          onSelect={(folder) => executeSendToCloud(folder)}
          onClose={() => { setCloudSendDoc(null); setCloudSendStatus(null) }}
        />
      )}

      {/* Send status toast */}
      {cloudSendStatus === 'sending' && (
        <div className="docs-cloud-toast sending">Sending {cloudSendDoc?.name}...</div>
      )}
      {cloudSendStatus?.ok && (
        <div className="docs-cloud-toast success">Sent to {cloudSendStatus.dest_name}</div>
      )}
      {cloudSendStatus?.error && (
        <div className="docs-cloud-toast error">{cloudSendStatus.error}</div>
      )}
    </div>
  )
}
