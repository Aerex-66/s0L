/**
 * GssmLanding — drop zone + recent-workbook catalog shown before a
 * workbook is loaded.
 *
 * s0L-only shell component — NOT part of the standalone sync boundary.
 */
import { Upload, FileSpreadsheet } from 'lucide-react'

export default function GssmLanding({
  isDragOver, setIsDragOver, onDropFile, onFile, catalogItems, onReimport,
}) {
  return (
    <div className="gssm-landing">
      <section
        className={isDragOver ? 'gssm-drop gssm-drop--active' : 'gssm-drop'}
        onDragEnter={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={e => { e.preventDefault(); if (e.currentTarget.contains(e.relatedTarget)) return; setIsDragOver(false) }}
        onDrop={onDropFile}
      >
        <div className="gssm-drop-inner">
          <Upload className="gssm-drop-icon" size={48} strokeWidth={1.5} />
          <p className="gssm-drop-text">Drop a .xlsx or .xlsm workbook here</p>
          <p className="gssm-drop-hint">or use Browse below</p>
          <label className="gssm-btn gssm-btn--ghost gssm-browse">
            Browse files
            <input type="file" accept=".xlsx,.xlsm" onChange={e => onFile(e.target.files?.[0])} hidden />
          </label>
        </div>
      </section>

      <aside className="gssm-catalog">
        <h3 className="gssm-catalog-title">Recent workbooks</h3>
        {catalogItems.length === 0 && <p className="gssm-catalog-empty">No workbooks imported yet.</p>}
        <ul className="gssm-catalog-list">
          {catalogItems.map(item => (
            <li key={item.id} className="gssm-catalog-item" onClick={() => onReimport(item)}>
              <FileSpreadsheet className="gssm-catalog-icon" size={18} />
              <div className="gssm-catalog-info">
                <span className="gssm-catalog-name">{item.name}</span>
                {item.opportunityNumber && <span className="gssm-catalog-opp">OPP-{item.opportunityNumber}</span>}
                <span className="gssm-catalog-date">{new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
