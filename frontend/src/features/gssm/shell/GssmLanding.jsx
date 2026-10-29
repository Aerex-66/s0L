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
          <Upload className="gssm-drop-icon" size={40} strokeWidth={1.5} />
          <h2 className="gssm-drop-text">Link this deal&apos;s GSSM workbook</h2>
          <p className="gssm-drop-hint">Drop the .xlsx or .xlsm workbook here, or browse for it.</p>
          <label className="gssm-btn gssm-btn--accent gssm-browse">
            Browse files
            <input type="file" accept=".xlsx,.xlsm" onChange={e => onFile(e.target.files?.[0])} hidden />
          </label>
          <ul className="gssm-drop-syncs" aria-label="What the workbook fills in on the deal">
            <li>Revenue, cost, GP and PTI</li>
            <li>Implementation timeline</li>
            <li>Staffing plan and FTE</li>
            <li>Bid metrics</li>
          </ul>
          <p className="gssm-drop-note">They sync to the deal as you work and show read-only in Home and the iSBD.</p>
        </div>
      </section>

      <aside className="gssm-catalog">
        <h3 className="gssm-catalog-title">Recent workbooks</h3>
        {catalogItems.length === 0 && <p className="gssm-catalog-empty">No workbooks imported on this computer yet.</p>}
        <ul className="gssm-catalog-list">
          {catalogItems.map(item => (
            <li key={item.id} className="gssm-catalog-item" onClick={() => onReimport(item)}>
              <FileSpreadsheet className="gssm-catalog-icon" size={18} />
              <div className="gssm-catalog-info">
                <span className="gssm-catalog-name">{item.name}</span>
                {item.opportunityNumber && <span className="gssm-catalog-opp" title="Opportunity number">{item.opportunityNumber}</span>}
                <span className="gssm-catalog-date">{new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
