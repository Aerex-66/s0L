import { createContext, useCallback, useContext, useState, useRef, useEffect, memo, useMemo } from 'react'
import { parseCurrency } from '../../shared/utils/financialsHelpers'
import { isCurrencyEdit, toDisplayCurrency } from './cellValues'
import { getField, isbdKeyFor, ownerOf } from '../../shared/constants/fieldIndex'
import { splitLabelValue } from './labelValue'

/**
 * PptSlideView — faithful PPTX projection.
 *
 * Renders shapes from extracted PPTX data at their exact EMU coordinates
 * (converted to viewport %) within a 16:9 container. Every value cell in
 * every table is click-to-edit. This single component replaces 11 separate
 * layout-specific slide components.
 *
 * Coordinate system:
 *   PPTX standard slide = 14,630,400 × 8,229,600 EMU (16×9 in at 914,400 EMU/in)
 *   Shape positions → percentage of slide width/height → CSS left/top/width/height
 */

// ── Constants ──────────────────────────────────────────────────────

const SLIDE_W = 14_630_400
const SLIDE_H =  8_229_600

const pctX = (emu) => (emu / SLIDE_W) * 100
const pctY = (emu) => (emu / SLIDE_H) * 100

// ── Field key helpers ──────────────────────────────────────────────

/** Normalize a label string into a camelCase-free field key */
function labelToKey(label) {
  if (!label) return ''
  return label
    .replace(/[/:?()&,.\-'"*]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// ── Field keys, input types and defaults come from the field index ──

/** The slide type being rendered; scopes generic labels such as "Date" or "Client". */
const SlideTypeContext = createContext(null)

/** Resolve a cell label to its field key: the index first, a slugified label for cells it doesn't model. */
function useKeyFor() {
  const slideTypeId = useContext(SlideTypeContext)
  return useCallback((label) => isbdKeyFor(label, slideTypeId) ?? labelToKey(label), [slideTypeId])
}

const INPUT_TYPES = { yn: 'yn', toggle: 'toggle', date: 'date', currency: 'number', number: 'plain-number' }
const LOCKED_OWNERS = new Set(['gssm', 'derived'])

function getFieldType(fieldKey) {
  return INPUT_TYPES[getField(fieldKey)?.type] || 'text'
}

function getFieldDefault(fieldKey) {
  return getField(fieldKey)?.isbd?.default || ''
}

/**
 * Detect a 2×2 "dual-option" table.
 * Pattern: row 0 = ["Label", ""], row 1 = ["Option A", "Option B"]
 * Returns { label, key, options: [a, b] } or null.
 */
function parseDualOptionTable(rows, cols, slideTypeId) {
  if (cols !== 2 || rows.length !== 2) return null
  const r0 = rows[0], r1 = rows[1]
  if (!r0[0]?.trim() || r0[1]?.trim()) return null
  if (!r1[0]?.trim() || !r1[1]?.trim()) return null
  const key = isbdKeyFor(r0[0], slideTypeId)
  const field = getField(key)
  if (field?.type !== 'toggle' || !field.isbd?.options) return null
  return { label: r0[0].trim(), key, options: field.isbd.options }
}

/** Detect header/section-title rows in tables.
 *  Only true for known section-header patterns — NOT for data rows
 *  that happen to have an empty value column.
 */
const HEADER_LABELS = new Set([
  'profile', 'opportunity dates', 'financial and contractual profile ($usd)',
  'expected complexity', 'key opportunity team members', 'accountable roles',
  'current state – if incumbent', 'current state \u2013 if incumbent',
  'gen ai / asset inclusion', 'ibm consulting / (which is lead)',
  'non ibm consulting', 'total ibm consulting', 'total non ibm consulting', 'total',
  'compliance item', 'review item', 'risk assessment', 'risk assessment summary',
  'delivery locations', 'key resourcing risks', 'staffing approvals',
  'client', 'engagement type', 'engagement source', 'review  status', 'review status',
  'sap development hours summary', 'object count by complexity',
  'additional effort', 'sub total', 'grand total',
])
function isHeaderRow(cells) {
  if (!cells || cells.length === 0) return true
  const nonEmpty = cells.filter(c => c && c.trim())
  // Completely empty row
  if (nonEmpty.length === 0) return true
  // Single non-empty cell in a multi-column table → only a header if it
  // matches a known section-header label.  Otherwise it's a label+empty-value
  // row that needs an editable value cell.
  if (nonEmpty.length === 1 && cells.length > 1) {
    const text = nonEmpty[0]?.trim().toLowerCase() || ''
    if (HEADER_LABELS.has(text)) return true
    return false
  }
  // 4-col header: first and last cells have text, middle are empty (like "IBM Consulting / ... | | | TCV $M")
  if (cells.length === 4 && nonEmpty.length === 2 && cells[0]?.trim() && cells[3]?.trim() && !cells[1]?.trim() && !cells[2]?.trim()) {
    const first = cells[0].trim().toLowerCase()
    if (HEADER_LABELS.has(first)) return true
  }
  return false
}

// ══════════════════════════════════════════════════════════════════
//  PptSlideView — main component
// ══════════════════════════════════════════════════════════════════

const PptSlideView = memo(function PptSlideView({
  shapes,
  data = {},
  onChange,
  readOnly = false,
  bgImage,
  slideTypeId,
  snapshot = false,
  children,
}) {
  // In snapshot mode, disable all template-driven layout overrides.
  // Every shape renders generically at its raw EMU position.
  const isBackSlide = !snapshot && slideTypeId === 'back_slide'
  const isCover = !snapshot && slideTypeId === 'cover'
  const isDenseTableSlide = !snapshot && [
    'deal_profile_summary', 'additional_deal_profile', 'tda', 
    'compliance_review', 'staffing_approvals'
  ].includes(slideTypeId)

  // If no shapes, show a placeholder with the background
  if (!shapes || shapes.length === 0) {
    return (
      <div className="ppt-view">
        {bgImage && <img src={bgImage} alt="" className="ppt-view-bg" draggable={false} />}
        <div className="ppt-view-empty-inner">No layout data for this slide</div>
      </div>
    )
  }

  let renderContent = null

  if (isDenseTableSlide) {
    const tables = shapes.filter(s => s.table)
    const nonTables = shapes.filter(s => !s.table)
    
    // Group tables into columns based on left position (rounded to nearest 10%)
    const columns = {}
    tables.forEach(t => {
      const colKey = Math.round(pctX(t.left) / 10) * 10
      if (!columns[colKey]) columns[colKey] = []
      columns[colKey].push(t)
    })

    // For 3-column layouts, make all columns the same width and evenly spaced
    // within the bg-image separator line (3.65% → 96.35% of slide width).
    const colEntries = Object.entries(columns)
      .sort(([a], [b]) => Number(a) - Number(b))
    const colWidthOverrides = {}
    const colLeftOverrides = {}
    if (colEntries.length === 3) {
      colEntries.forEach(([, shapes]) => shapes.sort((a, b) => a.top - b.top))
      // The content_bg.png separator line spans 3.65% – 96.35% of the slide
      const contentLeft  = SLIDE_W * 0.0365
      const contentRight = SLIDE_W * 0.9635
      const contentSpan  = contentRight - contentLeft
      const gap = SLIDE_W * 0.005          // ~0.5% gap between columns
      const uniformW = (contentSpan - gap * 2) / 3
      colEntries.forEach(([key], i) => {
        colWidthOverrides[key] = uniformW
        colLeftOverrides[key] = contentLeft + i * (uniformW + gap)
      })
    }
    
    renderContent = (
      <>
        {nonTables.map((shape, i) => (
          <ShapeRenderer key={`nt-${i}`} shape={shape} data={data} onChange={onChange} readOnly={readOnly} isCover={isCover} totalShapes={shapes.length} shapeIndex={i} />
        ))}
        {Object.values(columns).map((colShapes, colIdx) => {
          colShapes.sort((a, b) => a.top - b.top)
          const first = colShapes[0]
          const colKey = Math.round(pctX(first.left) / 10) * 10
          const colWidth = colWidthOverrides[colKey] ?? first.width
          const colLeft  = colLeftOverrides[colKey]  ?? first.left
          
          // Instead of calculating total height, we just let the column take up the space
          // from its first table's top down to the bottom of the slide content area (approx 88%)
          const colTop = first.top
          const colBottom = SLIDE_H * 0.88 // Stop just before footer
          const colHeight = colBottom - colTop
          
          return (
            <div key={`col-${colIdx}`} style={{
              position: 'absolute',
              left: pctX(colLeft) + '%',
              top: pctY(colTop) + '%',
              width: pctX(colWidth) + '%',
              height: pctY(colHeight) + '%',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 50
            }}>
              {colShapes.map((shape, i) => {
                // Calculate flex-grow based on the table's original height proportion
                const flexGrow = shape.height / colHeight
                
                // Calculate margin top based on gap from previous table
                const prev = i > 0 ? colShapes[i - 1] : null
                const gap = prev ? Math.max(0, shape.top - (prev.top + prev.height)) : 0
                
                return (
                  <div key={`t-${i}`} className="ppt-v-table-wrap" style={{
                    marginTop: pctY(gap) + '%',
                    flex: `${flexGrow} 1 0%`,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0 // Crucial for flex children to not overflow
                  }}>
                    <TableShape
                      rows={shape.table}
                      cols={shape.table_cols || shape.table[0]?.length || 1}
                      data={data}
                      onChange={onChange}
                      readOnly={readOnly}
                      isCover={isCover}
                    />
                  </div>
                )
              })}
            </div>
          )
        })}
      </>
    )
  } else {
    renderContent = shapes.map((shape, i) => (
      <ShapeRenderer
        key={i}
        shape={shape}
        data={data}
        onChange={onChange}
        readOnly={readOnly}
        isCover={isCover}
        totalShapes={shapes.length}
        shapeIndex={i}
      />
    ))
  }

  return (
    <SlideTypeContext.Provider value={snapshot ? null : slideTypeId}>
      <div className={`ppt-view ${isCover ? 'ppt-view-cover' : ''} ${isBackSlide ? 'ppt-view-back' : ''}`}>
        {bgImage && <img src={bgImage} alt="" className="ppt-view-bg" draggable={false} />}

        {renderContent}
        {children}
      </div>
    </SlideTypeContext.Provider>
  )
})

export default PptSlideView

// ══════════════════════════════════════════════════════════════════
//  ShapeRenderer — dispatches each shape type
// ══════════════════════════════════════════════════════════════════

const ShapeRenderer = memo(function ShapeRenderer({ shape, data, onChange, readOnly, isCover, totalShapes, shapeIndex }) {
  const slideTypeId = useContext(SlideTypeContext)
  // Title placeholder (top < 10%) gets highest z-index.
  // Tables: lower on the slide → higher z-index so they render on top
  // of any slight overlap with the table above.
  // Other shapes: higher on slide → higher z-index.
  let zIndex
  if (shape.top / SLIDE_H < 0.1) {
    zIndex = 200
  } else if (shape.table) {
    zIndex = Math.max(1, Math.round((shape.top / SLIDE_H) * 100))
  } else {
    zIndex = Math.max(1, Math.round((1 - shape.top / SLIDE_H) * 100))
  }

  // Widen cover KV table by 20% so long values (e.g. GEO/Market/Industry) aren't clipped
  const effectiveWidth = (isCover && shape.table) ? shape.width * 1.2 : shape.width

  const style = {
    position: 'absolute',
    left: pctX(shape.left) + '%',
    top:  pctY(shape.top) + '%',
    width: pctX(effectiveWidth) + '%',
    zIndex,
  }
  // Apply fixed height to non-table shapes only; tables get minHeight to fill allocated space
  // Cover text shapes don't need fixed height — let them auto-size
  if (shape.height > 500 && !shape.table && !(isCover && shape.text)) {
    style.height = pctY(shape.height) + '%'
  }

  // ── DUAL-OPTION TOGGLE TABLE ──
  if (shape.table) {
    const dualOpt = parseDualOptionTable(
      shape.table,
      shape.table_cols || shape.table[0]?.length || 1,
      slideTypeId,
    )
    if (dualOpt) {
      const toggleStyle = {
        ...style,
        height: pctY(shape.height) + '%',
      }
      return (
        <div className="ppt-v-toggle-wrap" style={toggleStyle}>
          <DualOptionToggle
            label={dualOpt.label}
            fieldKey={dualOpt.key}
            options={dualOpt.options}
            value={data?.[dualOpt.key]}
            onChange={onChange}
            readOnly={readOnly}
          />
        </div>
      )
    }
  }

  // ── TABLE ──
  if (shape.table) {
    // Check if this is a flex-rendered prompt/body table
    const r0 = shape.table[0] || []
    const cols = shape.table_cols || r0.length || 1
    const isSingleColBody = cols === 1 && shape.table.length >= 2 && !r0[0]?.includes(':')
    const isPrompt = cols > 1 && r0.length > 1 && r0.every(c => c && c.trim()) && shape.table.length >= 2

    const tableStyle = {
      ...style,
      // All tables get fixed height matching their PPTX region.
      // Flex tables let the header auto-size; the body fills the rest.
      height: pctY(shape.height) + '%',
    }
    return (
      <div className="ppt-v-table-wrap" style={tableStyle}>
        <TableShape
          rows={shape.table}
          cols={cols}
          data={data}
          onChange={onChange}
          readOnly={readOnly}
          isCover={isCover}
        />
      </div>
    )
  }

  // ── TEXT ──
  if (shape.text != null && shape.text.trim()) {
    // Skip slide-number placeholders
    if (/^\d+$/.test(shape.text.trim()) && shape.width < 500000) return null

    const isTitle =
      shape.name?.includes('object 2') ||
      shape.name?.includes('object 4') ||
      (shape.type?.includes('PLACEHOLDER') && shape.height > 300000 && shape.width > 5000000)

    const isFooter = shape.top > 7500000

    // Cover title may contain \n for line break (2025 template uses colon+newline)
    const displayText = isCover && isTitle
      ? shape.text.replace(/\\n/g, '\n').replace(/  +/g, ' ')
      : shape.text

    return (
      <div
        className={
          'ppt-v-text' +
          (isTitle ? ' ppt-v-title' : '') +
          (isFooter ? ' ppt-v-footer-text' : '') +
          (isCover && isTitle ? ' ppt-v-cover-title' : '') +
          (isCover && shape.text.startsWith('for ') ? ' ppt-v-cover-subtitle' : '')
        }
        style={style}
      >
        {displayText}
      </div>
    )
  }

  // ── IMAGE (embedded) ──
  if (shape.image_file) {
    // On cover, decorative images are baked into cover_bg.png
    if (isCover) return null
    return (
      <div className="ppt-v-image" style={style}>
        <img
          src={`/isbd-bg/${shape.image_file}`}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          draggable={false}
        />
      </div>
    )
  }

  // ── FREEFORM ──
  if (shape.type?.includes('FREEFORM')) {
    // Height=0 → horizontal separator line
    if (shape.height === 0 && shape.width > 1000000) {
      return <div className="ppt-v-line" style={{ ...style, height: '1px' }} />
    }
    return null
  }

  // ── LINE ──
  if (shape.type?.includes('LINE') || (shape.type?.includes('Connector') && shape.height < 5000)) {
    return <div className="ppt-v-line" style={{ ...style, height: '1px' }} />
  }

  // Skip all other decorative shapes
  return null
})

// ══════════════════════════════════════════════════════════════════
//  TableShape — renders PPTX table at exact position
// ══════════════════════════════════════════════════════════════════

const TableShape = memo(function TableShape({ rows, cols, data, onChange, readOnly, isCover }) {
  const keyFor = useKeyFor()
  const colCount = cols || 1
  const isSingleCol = colCount === 1
  const isFourCol = colCount === 4

  // If row 0 has text in every column, it's a column-header row (prompt tables).
  const row0 = rows[0] || []
  const hasColumnHeaders = !isSingleCol && row0.length > 1 && row0.every(c => c && c.trim())

  // ── Single-col body table (header + narrative body) ──
  // Use flex layout so header auto-sizes and body fills remaining space.
  if (isSingleCol && rows.length >= 2 && !rows[0][0]?.includes(':')) {
    const headerLabel = rows[0][0] || ''
    const bodyRaw = rows[1]?.[0] || ''
    const key = keyFor(headerLabel)
    const displayVal = key && data?.[key] != null && data[key] !== '' ? data[key] : bodyRaw
    return (
      <div className="ppt-v-flex-table">
        <div className="ppt-v-flex-header">{headerLabel}</div>
        <div className="ppt-v-flex-body">
          <CellEdit
            value={displayVal}
            fieldKey={key}
            onChange={onChange}
            readOnly={readOnly}
            placeholder={bodyRaw || '—'}
          />
        </div>
      </div>
    )
  }

  // ── Prompt table (multi-col with all-filled header row) ──
  // Flex layout: thin header bar with column titles, body fills the rest.
  if (hasColumnHeaders && rows.length >= 2) {
    const headerCells = rows[0]
    const bodyRows = rows.slice(1)
    // Detect scope-style tables: headers must be actual scope panel labels
    // (e.g. "In Scope", "Out of Scope", "Assumptions") — not columns that
    // merely mention "scope" in a longer phrase like "Solution scope components"
    const isScopeTable = headerCells.some(c => /^(in\s+scope|out\s+of\s+scope|assumptions)$/i.test(c.trim()))

    // ── Scope & Assumptions: 3-panel layout ──
    if (isScopeTable) {
      const panelDefs = headerCells.map((hdr, ci) => {
        const key = keyFor(hdr)
        const rawContent = bodyRows.map(r => r[ci] || '').join('\n').trim()
        const displayVal = key && data?.[key] != null && data[key] !== '' ? data[key] : rawContent
        const variant = /in.scope/i.test(hdr) ? 'in-scope'
          : /out.of.scope/i.test(hdr) ? 'out-of-scope'
          : 'assumptions'
        return { hdr, key, rawContent, displayVal, variant }
      })
      const inScope = panelDefs.find(p => p.variant === 'in-scope')
      const outScope = panelDefs.find(p => p.variant === 'out-of-scope')
      const assumptions = panelDefs.find(p => p.variant === 'assumptions')

      // Notes & Context: toggleable panel below Assumptions
      const notesKey = 'notes_context'
      const notesVal = notesKey && data?.[notesKey] != null ? data[notesKey] : ''
      const showNotes = notesVal !== '' || false

      const renderPanel = (p) => (
        <div className={`ppt-v-scope-panel ppt-v-scope-panel--${p.variant}`}>
          <div className="ppt-v-scope-panel-header">{p.hdr}</div>
          <div className="ppt-v-scope-panel-body">
            <textarea
              value={p.displayVal}
              readOnly={readOnly}
              placeholder={p.rawContent || `Enter ${p.hdr.toLowerCase()}...`}
              onChange={e => {
                if (p.key && onChange) onChange(p.key, e.target.value)
              }}
            />
          </div>
        </div>
      )
      return (
        <div className="ppt-v-scope-wrap">
          <div className="ppt-v-scope-left">
            {inScope && renderPanel(inScope)}
            {outScope && renderPanel(outScope)}
          </div>
          <div className="ppt-v-scope-right">
            {assumptions && renderPanel(assumptions)}
            <div className={`ppt-v-scope-panel ppt-v-scope-panel--notes${showNotes ? '' : ' ppt-v-scope-panel--collapsed'}`}>
              <div className="ppt-v-scope-panel-header">
                Notes &amp; Context
                {!readOnly && (
                  <button
                    className="ppt-v-scope-notes-toggle"
                    title={showNotes ? 'Clear & hide notes' : 'Add notes'}
                    onClick={() => {
                      if (notesKey && onChange) onChange(notesKey, showNotes ? '' : ' ')
                    }}
                  >
                    {showNotes ? '×' : '+'}
                  </button>
                )}
              </div>
              {showNotes && (
                <div className="ppt-v-scope-panel-body">
                  <textarea
                    value={notesVal}
                    readOnly={readOnly}
                    placeholder="Add notes, context, or references..."
                    onChange={e => {
                      if (notesKey && onChange) onChange(notesKey, e.target.value)
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="ppt-v-flex-table">
        <div className="ppt-v-flex-header ppt-v-flex-header-multi">
          {headerCells.map((cell, ci) => (
            <span key={ci} className="ppt-v-flex-header-col" style={{ flex: 1 }}>{cell}</span>
          ))}
        </div>
        <div className="ppt-v-flex-body ppt-v-flex-body-multi">
          {bodyRows.map((cells, ri) => (
            <div key={ri} className="ppt-v-flex-body-row" style={{ display: 'flex', flex: 1 }}>
              {cells.map((cell, ci) => {
                const labelCell = headerCells[ci] || ''
                const key = keyFor(labelCell)
                const displayVal = key && data?.[key] != null && data[key] !== '' ? data[key] : cell
                return (
                  <div key={ci} className="ppt-v-flex-body-col" style={{ flex: 1 }}>
                    <CellEdit
                      value={displayVal}
                      fieldKey={key}
                      onChange={onChange}
                      readOnly={readOnly}
                      placeholder={cell || '—'}
                    />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Detect data-grid tables (merged header row + column-header row, e.g. WRICEF)
  const isDataGrid = rows.length > 2 && colCount >= 3 && isHeaderRow(rows[0]) &&
    rows[1] && rows[1].every(c => c && c.trim())

  return (
    <table className={`ppt-v-table${isDataGrid ? ' ppt-v-table-compact' : ''}`}>
      <tbody>
        {rows.map((cells, ri) => {
          // ── Single-column table (cover KV format: "Label: Value") ──
          if (isSingleCol) {
            const raw = cells[0] || ''
            const { label, value } = splitLabelValue(raw)
            // If no colon found at all, treat as header
            if (!raw.includes(':') && label) {
              return (
                <tr key={ri}>
                  <td className="ppt-v-header" colSpan={2}>{label}</td>
                </tr>
              )
            }
            const key = keyFor(label)
            const displayVal = key && data?.[key] != null && data[key] !== '' ? data[key] : value
            return (
              <tr key={ri}>
                <td className="ppt-v-label">{label}:</td>
                <td className="ppt-v-val">
                  <CellEdit
                    value={displayVal}
                    fieldKey={key}
                    onChange={onChange}
                    readOnly={readOnly}
                    placeholder={value || '—'}
                  />
                </td>
              </tr>
            )
          }

          // ── Detect header rows ──
          if (isHeaderRow(cells)) {
            const headerText = cells.filter(c => c && c.trim()).join(' ')
            // Empty separator row → render as thin spacer
            if (!headerText) {
              return <tr key={ri}><td colSpan={colCount} style={{ height: '0.2cqw', border: 'none' }}></td></tr>
            }
            // If it's a sub-header inside a table (like "Additional Effort"), style it differently
            if (ri > 0) {
              return (
                <tr key={ri}>
                  <td className="ppt-v-subheader" colSpan={colCount}>{headerText}</td>
                </tr>
              )
            }
            return (
              <tr key={ri}>
                <td className="ppt-v-header" colSpan={colCount}>{headerText}</td>
              </tr>
            )
          }

          // ── Column-header row (row after a separator/header) ──
          // All cells filled + previous row was a header → column-header strip,
          // UNLESS the trailing cells are numeric (then it's a data row).
          if (ri > 0 && isHeaderRow(rows[ri - 1]) && cells.every(c => c && c.trim())) {
            const tailCells = cells.slice(1)
            const hasNumericTail = tailCells.length > 0 && tailCells.every(c =>
              /^[\d,.$%\-–()\s]+$/.test(c.trim())
            )
            if (hasNumericTail) {
              // Data row after a separator — render as label + values
              const key = keyFor(cells[0])
              return (
                <tr key={ri}>
                  <td className="ppt-v-label">{cells[0]}</td>
                  {tailCells.map((cell, ci) => {
                    const colKey = ci === tailCells.length - 1 ? key : null
                    const displayVal = colKey && data?.[colKey] != null && data[colKey] !== '' ? data[colKey] : cell
                    return (
                      <td key={ci + 1} className="ppt-v-val">
                        <CellEdit
                          value={displayVal}
                          fieldKey={colKey}
                          onChange={onChange}
                          readOnly={readOnly}
                          placeholder={cell || '—'}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            }
            // Text column headers — thin header strip
            return (
              <tr key={ri}>
                {cells.map((cell, ci) => (
                  <td key={ci} className="ppt-v-header ppt-v-header-thin">{cell}</td>
                ))}
              </tr>
            )
          }

          // ── Detect sub-header rows that aren't full colSpan (like "Total IBM Consulting" in col 0) ──
          if (cells[0] && (cells[0].startsWith('Total') || cells[0].startsWith('Non IBM Consulting')) && !cells[1] && !cells[2]) {
            // If it's a 4-column table, we want the subheader to span all 4 columns
            // But we also want to render the value cell if it exists (e.g. the Total value)
            if (isFourCol) {
              return (
                <tr key={ri}>
                  <td className="ppt-v-subheader" colSpan={3}>{cells[0]}</td>
                  <td className="ppt-v-val">
                    <CellEdit
                      value={data?.[keyFor(cells[0])] || cells[3] || ''}
                      fieldKey={keyFor(cells[0])}
                      onChange={onChange}
                      readOnly={readOnly}
                      placeholder={cells[3] || '—'}
                    />
                  </td>
                </tr>
              )
            }
            return (
              <tr key={ri}>
                <td className="ppt-v-subheader" colSpan={colCount}>{cells[0]}</td>
              </tr>
            )
          }

          // ── Multi-column rows ──

          // Split "TCV / NPV GP%" into two side-by-side fields
          if (isFourCol && cells[0]?.trim() === 'TCV / NPV GP%' && !cells[2]?.trim() && !cells[3]?.trim()) {
            const [labelA, labelB] = cells[0].split(' / ').map(s => s.trim())
            const keyA = keyFor(labelA)
            const keyB = keyFor(labelB)
            const valA = keyA && data?.[keyA] != null && data[keyA] !== '' ? data[keyA] : ''
            const valB = keyB && data?.[keyB] != null && data[keyB] !== '' ? data[keyB] : ''
            return (
              <tr key={ri}>
                <td className="ppt-v-label">{labelA}</td>
                <td className="ppt-v-val">
                  <CellEdit value={valA} fieldKey={keyA} onChange={onChange} readOnly={readOnly} placeholder="—" />
                </td>
                <td className="ppt-v-label">{labelB}</td>
                <td className="ppt-v-val">
                  <CellEdit value={valB} fieldKey={keyB} onChange={onChange} readOnly={readOnly} placeholder="—" />
                </td>
              </tr>
            )
          }

          // For 4-col tables: if cols 2+3 are empty, this row only has one
          // label/value pair — render it spanning the full width instead of
          // showing two empty cells on the right.
          if (isFourCol && cells[0]?.trim() && !cells[2]?.trim() && !cells[3]?.trim()) {
            const key = keyFor(cells[0])
            const displayVal = key && data?.[key] != null && data[key] !== '' ? data[key] : cells[1]
            return (
              <tr key={ri}>
                <td className="ppt-v-label" colSpan={2}>{cells[0]}</td>
                <td className="ppt-v-val" colSpan={2}>
                  <CellEdit
                    value={displayVal}
                    fieldKey={key}
                    onChange={onChange}
                    readOnly={readOnly}
                    placeholder={cells[1] || '—'}
                  />
                </td>
              </tr>
            )
          }

          // For 4-col tables: if cols 0+1 are empty but col 2 has a label,
          // span the label+value across the full width (no blank cells on left).
          if (isFourCol && !cells[0]?.trim() && !cells[1]?.trim() && cells[2]?.trim()) {
            const key = keyFor(cells[2])
            const displayVal = key && data?.[key] != null && data[key] !== '' ? data[key] : cells[3]
            return (
              <tr key={ri}>
                <td className="ppt-v-label" colSpan={2}>{cells[2]}</td>
                <td className="ppt-v-val" colSpan={2}>
                  <CellEdit
                    value={displayVal}
                    fieldKey={key}
                    onChange={onChange}
                    readOnly={readOnly}
                    placeholder={cells[3] || '—'}
                  />
                </td>
              </tr>
            )
          }

          // For 4-col tables: sub-header in col 0 with a label in col 2
          // (e.g. "Non IBM Consulting" + "Technology") — split into two rows:
          // a full-width sub-header, then a label+value row for the col 2 item.
          if (isFourCol && cells[0]?.trim() && !cells[1]?.trim() && cells[2]?.trim() && !cells[3]?.trim()
              && (cells[0].startsWith('Non IBM') || cells[0].startsWith('Total'))) {
            const key = keyFor(cells[2])
            const displayVal = key && data?.[key] != null && data[key] !== '' ? data[key] : cells[3]
            return (
              <>
                <tr key={`${ri}-sh`}>
                  <td className="ppt-v-subheader" colSpan={4}>{cells[0]}</td>
                </tr>
                <tr key={ri}>
                  <td className="ppt-v-label" colSpan={2}>{cells[2]}</td>
                  <td className="ppt-v-val" colSpan={2}>
                    <CellEdit
                      value={displayVal}
                      fieldKey={key}
                      onChange={onChange}
                      readOnly={readOnly}
                      placeholder={cells[3] || '—'}
                    />
                  </td>
                </tr>
              </>
            )
          }

          // For 4-col tables: empty col 0 with labels in cols 1+2
          // (e.g. IBM Consulting service lines) — drop the empty col 0 and
          // the secondary BTS col 2, render as simple label + value full width.
          if (isFourCol && !cells[0]?.trim() && cells[1]?.trim() && cells[2]?.trim()) {
            const key = keyFor(cells[1])
            const displayVal = key && data?.[key] != null && data[key] !== '' ? data[key] : cells[3]
            return (
              <tr key={ri}>
                <td className="ppt-v-label" colSpan={2}>{cells[1]}</td>
                <td className="ppt-v-val" colSpan={2}>
                  <CellEdit
                    value={displayVal}
                    fieldKey={key}
                    onChange={onChange}
                    readOnly={readOnly}
                    placeholder={cells[3] || '—'}
                  />
                </td>
              </tr>
            )
          }

          return (
            <tr key={ri}>
              {cells.map((cell, ci) => {
                // For 4-column tables: even cols = labels, odd cols = values
                if (isFourCol) {
                  const isLabel = ci % 2 === 0
                  if (isLabel) {
                    // Empty label cell (e.g. IBM Consulting Lines checkbox col) — render as value
                    if (!cell || !cell.trim()) {
                      return <td key={ci} className="ppt-v-val"></td>
                    }
                    return <td key={ci} className="ppt-v-label">{cell}</td>
                  }
                  const labelCell = cells[ci - 1] || ''
                  const key = keyFor(labelCell)
                  const displayVal = key && data?.[key] != null && data[key] !== '' ? data[key] : cell
                  return (
                    <td key={ci} className="ppt-v-val">
                      <CellEdit
                        value={displayVal}
                        fieldKey={key}
                        onChange={onChange}
                        readOnly={readOnly}
                        placeholder={cell || '—'}
                      />
                    </td>
                  )
                }

                // 2-column: col 0 = label, col 1 = value
                if (ci === 0) {
                  return <td key={ci} className="ppt-v-label">{cell}</td>
                }
                const labelCell = cells[0] || ''
                const key = keyFor(labelCell)
                const displayVal = key && data?.[key] != null && data[key] !== '' ? data[key] : cell
                return (
                  <td key={ci} className="ppt-v-val">
                    <CellEdit
                      value={displayVal}
                      fieldKey={key}
                      onChange={onChange}
                      readOnly={readOnly}
                      placeholder={cell || '—'}
                    />
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
})

// ══════════════════════════════════════════════════════════════════
//  DualOptionToggle — slidable dual-option field
// ══════════════════════════════════════════════════════════════════

const DualOptionToggle = memo(function DualOptionToggle({
  label, fieldKey, options, value, onChange, readOnly
}) {
  const [optA, optB] = options
  const selected = value || optA   // default to first option

  const handleSelect = (opt) => {
    if (readOnly || !onChange) return
    if (opt !== selected) {
      onChange(fieldKey, opt)
    }
  }

  const isB = selected === optB

  return (
    <div className="ppt-v-dual-toggle">
      <div className="ppt-v-dual-header">{label}</div>
      <div className={`ppt-v-dual-track ${readOnly ? 'ppt-v-dual-ro' : ''}`}>
        <div
          className="ppt-v-dual-slider"
          style={{ transform: isB ? 'translateX(100%)' : 'translateX(0)' }}
        />
        <button
          className={`ppt-v-dual-opt ${!isB ? 'ppt-v-dual-active' : ''}`}
          onClick={() => handleSelect(optA)}
          disabled={readOnly}
          type="button"
        >
          {optA}
        </button>
        <button
          className={`ppt-v-dual-opt ${isB ? 'ppt-v-dual-active' : ''}`}
          onClick={() => handleSelect(optB)}
          disabled={readOnly}
          type="button"
        >
          {optB}
        </button>
      </div>
    </div>
  )
})

// ══════════════════════════════════════════════════════════════════
//  CellEdit — inline click-to-edit cell
// ══════════════════════════════════════════════════════════════════

const CellEdit = memo(function CellEdit({ value, fieldKey, onChange, readOnly: viewReadOnly, placeholder, fieldType, multiline }) {
  // GSSM-owned and derived values are shown, never edited, in the deck.
  const readOnly = viewReadOnly || LOCKED_OWNERS.has(ownerOf(fieldKey))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const inputRef = useRef(null)
  const type = fieldType || getFieldType(fieldKey)

  useEffect(() => { if (!editing) setDraft(value || '') }, [value, editing])
  useEffect(() => {
    if (editing && inputRef.current) {
      // For number fields, expand to full number when entering edit mode
      if (type === 'number' && value) {
        const n = parseCurrency(value)
        if (!isNaN(n)) setDraft(String(n))
      }
      inputRef.current.focus()
    }
  }, [editing, type, value])

  const commit = () => {
    setEditing(false)
    if (!onChange || !fieldKey) return
    if (type === 'number') {
      if (!isCurrencyEdit(value, draft)) return
      const n = parseCurrency(draft)
      onChange(fieldKey, Number.isNaN(n) ? draft : String(n))
      return
    }
    if (draft !== (value || '')) onChange(fieldKey, draft)
  }

  // ── Y/N toggle ──
  if (type === 'yn') {
    const defaultVal = getFieldDefault(fieldKey)
    const display = value || defaultVal || placeholder
    if (readOnly || !onChange) {
      return (
        <span className={`ppt-v-cell-ro ${!value && !defaultVal ? 'ppt-v-ph' : ''}`}>
          {display}
        </span>
      )
    }
    const cycle = () => {
      const cur = value || defaultVal
      const next = !cur || cur === '—' ? 'Y' : cur === 'Y' ? 'N' : cur === 'N' ? 'N/A' : cur === 'N/A' ? 'Y' : 'Y'
      if (onChange && fieldKey) onChange(fieldKey, next)
    }
    return (
      <span className="ppt-v-yn" onClick={cycle} title="Click to toggle Y / N / N/A">
        {display}
      </span>
    )
  }

  // Display value for number fields: always show $ prefix
  // For text fields with defaults, show the default when no value is set
  const textDefault = type === 'text' ? getFieldDefault(fieldKey) : ''
  const displayValue = type === 'number' && value ? toDisplayCurrency(value) : (value || textDefault)

  if (readOnly || !onChange) {
    return (
      <span className={`ppt-v-cell-ro ${!value && !textDefault ? 'ppt-v-ph' : ''} ${multiline ? 'ppt-v-cell-multiline' : ''}`}>
        {displayValue || placeholder}
      </span>
    )
  }

  if (!editing) {
    return (
      <span
        className={`ppt-v-cell-ed ${!value && !textDefault ? 'ppt-v-ph' : ''} ${multiline ? 'ppt-v-cell-multiline' : ''}`}
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        {displayValue || placeholder}
      </span>
    )
  }

  // ── Date input ──
  if (type === 'date') {
    return (
      <input
        ref={inputRef}
        className="ppt-v-input ppt-v-input-date"
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
        }}
      />
    )
  }

  // ── Number input ──
  if (type === 'number') {
    return (
      <input
        ref={inputRef}
        className="ppt-v-input ppt-v-input-num"
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
        }}
        placeholder={placeholder}
      />
    )
  }

  // ── Multiline textarea ──
  if (multiline) {
    return (
      <textarea
        ref={inputRef}
        className="ppt-v-input ppt-v-input-multiline"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
        }}
        placeholder={placeholder}
      />
    )
  }

  // ── Default text input ──
  return (
    <input
      ref={inputRef}
      className="ppt-v-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
      }}
      placeholder={placeholder}
    />
  )
})
