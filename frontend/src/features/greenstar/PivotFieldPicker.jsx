import { memo, useCallback, useMemo, useState, useRef } from 'react'
import { GripVertical, X, ChevronDown, Save, Trash2, RotateCcw, Plus } from 'lucide-react'
import { pivot } from '../../shared/gssmData'

/* ── Aggregation options ── */
const AGG_OPTIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'max', label: 'Max' },
  { value: 'min', label: 'Min' },
]

/* ── Field categories for visual grouping ── */
const ROSTER_FIELDS = new Set(['Rollout', 'Phase', 'Contract Holder', 'Coverage', 'Team Type', 'Team', 'Sub-Team', 'Resource Name', 'Role', 'Required Skill', 'Job Role', 'Speciality', 'JRS Services', 'Band'])
const VALUE_FIELDS = new Set(['Hours', 'Fees', 'Weighted Hours', 'Base Cost Rate', 'Adder', 'Numeric Level', 'Band Level', 'Total FTE'])
const SKIP_FIELDS = new Set(['_rowIndex'])

function classifyField(name) {
  if (SKIP_FIELDS.has(name)) return null
  if (ROSTER_FIELDS.has(name)) return 'roster'
  if (VALUE_FIELDS.has(name)) return 'value'
  if (/^\d+-\w+-\d+$/.test(name) || /^\w{3}-\d{2}$/.test(name)) return 'month'
  return 'other'
}

/* ── Default presets ── */
const DEFAULT_PRESETS = [
  {
    id: 'staff-by-team-role',
    name: 'Staff by Team & Role',
    rows: ['Team', 'Role'],
    values: [{ field: 'Hours', agg: 'sum' }, { field: 'Fees', agg: 'sum' }, { field: 'Total FTE', agg: 'sum' }],
    filters: [],
  },
  {
    id: 'band-mix',
    name: 'Band Mix',
    rows: ['Band', 'Team'],
    values: [{ field: 'Hours', agg: 'sum' }, { field: 'Fees', agg: 'sum' }],
    filters: [],
  },
  {
    id: 'company-team',
    name: 'By Company & Team',
    rows: ['Company', 'Team'],
    values: [{ field: 'Hours', agg: 'sum' }, { field: 'Fees', agg: 'sum' }],
    filters: [],
  },
  {
    id: 'phase-team',
    name: 'Phase × Team',
    rows: ['Phase', 'Team'],
    values: [{ field: 'Hours', agg: 'sum' }, { field: 'Fees', agg: 'sum' }],
    filters: [],
  },
  {
    id: 'rollout-band',
    name: 'Rollout × Band',
    rows: ['Rollout', 'Band'],
    values: [{ field: 'Hours', agg: 'sum' }, { field: 'Fees', agg: 'sum' }, { field: 'Total FTE', agg: 'sum' }],
    filters: [],
  },
  {
    id: 'individual-staff',
    name: 'Individual Staff',
    rows: ['Resource Name', 'Role', 'Band'],
    values: [{ field: 'Hours', agg: 'sum' }, { field: 'Fees', agg: 'sum' }, { field: 'Total FTE', agg: 'sum' }],
    filters: [],
  },
  {
    id: 'location-mix',
    name: 'Location Mix',
    rows: ['Coverage', 'Team'],
    values: [{ field: 'Hours', agg: 'sum' }, { field: 'Fees', agg: 'sum' }],
    filters: [],
  },
  {
    id: 'team-monthly-fte',
    name: 'Monthly FTE by Team',
    rows: ['Team'],
    values: [], // dynamically filled with month columns
    filters: [],
    dynamic: 'fte-months',
  },
]

/* ── Draggable field chip ── */
function FieldChip({ name, category, onAdd }) {
  return (
    <button
      type="button"
      className={`gfp-chip gfp-chip--${category}`}
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', name); e.dataTransfer.effectAllowed = 'copy' }}
      onClick={() => onAdd?.(name)}
      title={`Drag or click to add "${name}"`}
    >
      <GripVertical size={10} className="gfp-chip-grip" />
      {name}
    </button>
  )
}

/* ── Drop zone for rows/filters ── */
function DropZone({ label, items, onDrop, onRemove, zone }) {
  const [over, setOver] = useState(false)
  return (
    <div
      className={`gfp-zone${over ? ' gfp-zone--over' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData('text/plain'), zone) }}
    >
      <div className="gfp-zone-label">{label}</div>
      <div className="gfp-zone-items">
        {items.length === 0 && <span className="gfp-zone-hint">Drop fields here</span>}
        {items.map((item, i) => (
          <span key={i} className="gfp-zone-tag">
            {typeof item === 'string' ? item : item.field}
            <button type="button" className="gfp-zone-remove" onClick={() => onRemove(i, zone)}><X size={10} /></button>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Drop zone for values (with aggregation selector) ── */
function ValuesZone({ items, onDrop, onRemove, onChangeAgg }) {
  const [over, setOver] = useState(false)
  return (
    <div
      className={`gfp-zone${over ? ' gfp-zone--over' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData('text/plain'), 'values') }}
    >
      <div className="gfp-zone-label">Σ Values</div>
      <div className="gfp-zone-items">
        {items.length === 0 && <span className="gfp-zone-hint">Drop numeric fields here</span>}
        {items.map((item, i) => (
          <span key={i} className="gfp-zone-tag gfp-zone-tag--value">
            <select
              className="gfp-agg-select"
              value={item.agg}
              onChange={e => onChangeAgg(i, e.target.value)}
            >
              {AGG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {item.field}
            <button type="button" className="gfp-zone-remove" onClick={() => onRemove(i, 'values')}><X size={10} /></button>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Main Field Picker ── */
const PivotFieldPicker = memo(function PivotFieldPicker({ dataRows, fteMonthFields, onPivotResult }) {
  const [rows, setRows] = useState([])
  const [values, setValues] = useState([])
  const [filters, setFilters] = useState([])
  const [presets, setPresets] = useState(() => {
    try {
      const saved = localStorage.getItem('gs-pivot-presets')
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return DEFAULT_PRESETS
  })
  const [activePresetId, setActivePresetId] = useState(null)
  const [editingPresetName, setEditingPresetName] = useState(null)
  const nameInputRef = useRef(null)

  // Discover available fields from data
  const availableFields = useMemo(() => {
    if (!dataRows?.length) return { roster: [], value: [], month: [], other: [] }
    const sample = dataRows[0]
    const groups = { roster: [], value: [], month: [], other: [] }
    for (const key of Object.keys(sample)) {
      const cat = classifyField(key)
      if (cat && groups[cat]) groups[cat].push(key)
    }
    // Sort roster fields in canonical order
    groups.roster.sort((a, b) => {
      const ai = [...ROSTER_FIELDS].indexOf(a)
      const bi = [...ROSTER_FIELDS].indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    return groups
  }, [dataRows])

  // Persist presets
  const savePresets = useCallback((next) => {
    setPresets(next)
    try { localStorage.setItem('gs-pivot-presets', JSON.stringify(next)) } catch { /* ignore */ }
  }, [])

  // Drop handler
  const handleDrop = useCallback((fieldName, zone) => {
    if (!fieldName) return
    if (zone === 'rows') {
      setRows(prev => prev.includes(fieldName) ? prev : [...prev, fieldName])
    } else if (zone === 'values') {
      setValues(prev => prev.some(v => v.field === fieldName) ? prev : [...prev, { field: fieldName, agg: 'sum' }])
    } else if (zone === 'filters') {
      setFilters(prev => prev.includes(fieldName) ? prev : [...prev, fieldName])
    }
    setActivePresetId(null)
  }, [])

  const handleRemove = useCallback((index, zone) => {
    if (zone === 'rows') setRows(prev => prev.filter((_, i) => i !== index))
    else if (zone === 'values') setValues(prev => prev.filter((_, i) => i !== index))
    else if (zone === 'filters') setFilters(prev => prev.filter((_, i) => i !== index))
    setActivePresetId(null)
  }, [])

  const handleChangeAgg = useCallback((index, agg) => {
    setValues(prev => prev.map((v, i) => i === index ? { ...v, agg } : v))
    setActivePresetId(null)
  }, [])

  // Add field via click (auto-place: roster→rows, numeric→values)
  const handleAddField = useCallback((name) => {
    const cat = classifyField(name)
    if (cat === 'value' || cat === 'month') {
      handleDrop(name, 'values')
    } else {
      handleDrop(name, 'rows')
    }
  }, [handleDrop])

  // Execute pivot
  const handleExecute = useCallback(() => {
    if (!rows.length || !values.length || !dataRows?.length) return
    // Apply filters
    let filtered = dataRows
    // For now, filters just include rows where the field is non-empty
    for (const f of filters) {
      filtered = filtered.filter(row => {
        const val = row[f]
        return val != null && val !== '' && val !== 0
      })
    }
    const result = pivot(filtered, rows, values)
    onPivotResult?.({ rows: rows, values: values, result })
  }, [rows, values, filters, dataRows, onPivotResult])

  // Auto-execute on config change
  useMemo(() => {
    if (rows.length && values.length && dataRows?.length) {
      let filtered = dataRows
      for (const f of filters) {
        filtered = filtered.filter(row => {
          const val = row[f]
          return val != null && val !== '' && val !== 0
        })
      }
      let effectiveValues = values
      // Handle dynamic FTE months
      if (values.length === 0 && fteMonthFields?.length) {
        effectiveValues = fteMonthFields.map(f => ({ field: f, agg: 'sum' }))
      }
      const result = pivot(filtered, rows, effectiveValues)
      onPivotResult?.({ rows, values: effectiveValues, result })
    }
  }, [rows, values, filters, dataRows, fteMonthFields, onPivotResult])

  // Load preset
  const loadPreset = useCallback((preset) => {
    let effectiveValues = preset.values
    if (preset.dynamic === 'fte-months' && fteMonthFields?.length) {
      effectiveValues = fteMonthFields.map(f => ({ field: f, agg: 'sum' }))
    }
    setRows(preset.rows || [])
    setValues(effectiveValues || [])
    setFilters(preset.filters || [])
    setActivePresetId(preset.id)
  }, [fteMonthFields])

  // Save current config as preset
  const handleSavePreset = useCallback(() => {
    const id = `custom-${Date.now()}`
    const newPreset = { id, name: 'Custom Pivot', rows: [...rows], values: values.map(v => ({ ...v })), filters: [...filters] }
    const next = [...presets, newPreset]
    savePresets(next)
    setActivePresetId(id)
    setEditingPresetName(id)
    setTimeout(() => nameInputRef.current?.select(), 50)
  }, [rows, values, filters, presets, savePresets])

  // Update preset name
  const handleRenameDone = useCallback((id, newName) => {
    const next = presets.map(p => p.id === id ? { ...p, name: newName || p.name } : p)
    savePresets(next)
    setEditingPresetName(null)
  }, [presets, savePresets])

  // Overwrite active preset
  const handleOverwritePreset = useCallback(() => {
    if (!activePresetId) return
    const next = presets.map(p => p.id === activePresetId
      ? { ...p, rows: [...rows], values: values.map(v => ({ ...v })), filters: [...filters] }
      : p
    )
    savePresets(next)
  }, [activePresetId, rows, values, filters, presets, savePresets])

  // Delete preset
  const handleDeletePreset = useCallback((id) => {
    const next = presets.filter(p => p.id !== id)
    savePresets(next)
    if (activePresetId === id) setActivePresetId(null)
  }, [presets, savePresets, activePresetId])

  // Reset to defaults
  const handleResetPresets = useCallback(() => {
    savePresets(DEFAULT_PRESETS)
    setActivePresetId(null)
  }, [savePresets])

  // Clear all zones
  const handleClear = useCallback(() => {
    setRows([]); setValues([]); setFilters([])
    setActivePresetId(null)
    onPivotResult?.(null)
  }, [onPivotResult])

  return (
    <div className="gfp-root">
      {/* Presets */}
      <div className="gfp-presets">
        <div className="gfp-presets-header">
          <span className="gfp-section-title">Presets</span>
          <div className="gfp-presets-actions">
            <button type="button" className="gfp-icon-btn" onClick={handleSavePreset} title="Save current as preset" disabled={!rows.length}>
              <Plus size={12} />
            </button>
            <button type="button" className="gfp-icon-btn" onClick={handleResetPresets} title="Reset to defaults">
              <RotateCcw size={12} />
            </button>
          </div>
        </div>
        <div className="gfp-preset-list">
          {presets.map(p => (
            <div key={p.id} className={`gfp-preset${activePresetId === p.id ? ' gfp-preset--active' : ''}`}>
              {editingPresetName === p.id ? (
                <input
                  ref={nameInputRef}
                  className="gfp-preset-name-input"
                  defaultValue={p.name}
                  onBlur={e => handleRenameDone(p.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                />
              ) : (
                <button
                  type="button"
                  className="gfp-preset-btn"
                  onClick={() => loadPreset(p)}
                  onDoubleClick={() => setEditingPresetName(p.id)}
                  title="Click to load, double-click to rename"
                >
                  {p.name}
                </button>
              )}
              {activePresetId === p.id && (
                <button type="button" className="gfp-icon-btn gfp-preset-save" onClick={handleOverwritePreset} title="Overwrite preset with current config">
                  <Save size={10} />
                </button>
              )}
              {p.id.startsWith('custom-') && (
                <button type="button" className="gfp-icon-btn gfp-preset-del" onClick={() => handleDeletePreset(p.id)} title="Delete preset">
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Field list */}
      <div className="gfp-fields">
        <div className="gfp-section-title">Fields</div>
        {availableFields.roster.length > 0 && (
          <div className="gfp-field-group">
            <div className="gfp-field-group-label">Roster</div>
            {availableFields.roster.map(f => <FieldChip key={f} name={f} category="roster" onAdd={handleAddField} />)}
          </div>
        )}
        {availableFields.value.length > 0 && (
          <div className="gfp-field-group">
            <div className="gfp-field-group-label">Values</div>
            {availableFields.value.map(f => <FieldChip key={f} name={f} category="value" onAdd={handleAddField} />)}
          </div>
        )}
        {availableFields.other.length > 0 && (
          <div className="gfp-field-group">
            <div className="gfp-field-group-label">Other</div>
            {availableFields.other.map(f => <FieldChip key={f} name={f} category="other" onAdd={handleAddField} />)}
          </div>
        )}
        {availableFields.month.length > 0 && (
          <div className="gfp-field-group">
            <div className="gfp-field-group-label">FTE Months <span className="gfp-field-count">({availableFields.month.length})</span></div>
            <div className="gfp-month-chips">
              {availableFields.month.slice(0, 6).map(f => <FieldChip key={f} name={f} category="month" onAdd={handleAddField} />)}
              {availableFields.month.length > 6 && <span className="gfp-field-more">+{availableFields.month.length - 6} more</span>}
            </div>
          </div>
        )}
      </div>

      {/* Drop zones */}
      <div className="gfp-zones">
        <DropZone label="↕ Rows" items={rows} onDrop={handleDrop} onRemove={handleRemove} zone="rows" />
        <ValuesZone items={values} onDrop={handleDrop} onRemove={handleRemove} onChangeAgg={handleChangeAgg} />
        <DropZone label="⊘ Filters" items={filters} onDrop={handleDrop} onRemove={handleRemove} zone="filters" />
      </div>

      {/* Actions */}
      <div className="gfp-actions">
        <button type="button" className="gfp-clear-btn" onClick={handleClear} disabled={!rows.length && !values.length}>Clear</button>
      </div>
    </div>
  )
})

export default PivotFieldPicker
