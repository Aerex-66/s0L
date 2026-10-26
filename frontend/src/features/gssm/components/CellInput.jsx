import { memo, useState, useRef, useCallback, useMemo } from 'react'

/**
 * Memoized text input with local state for instant keystroke responsiveness.
 *
 * Editing is local-only until committed.  The parent onCellEdit callback fires:
 *   • on blur  (user clicks away / tabs out)
 *   • on Enter (for single-line inputs)
 * Pressing Escape reverts to the last committed value.
 * Ctrl+Z / Ctrl+Y work natively inside the input (browser undo stack).
 *
 * If the user never changes the value, onCellEdit is NOT called — no spurious
 * edits are written to the edit store.
 *
 * Props:
 *   value       – current cell value from parent (rowData)
 *   rowIndex    – 0-based row index
 *   colIndex    – 0-based column index
 *   onCellEdit  – ({ rowIndex, colIndex, value }) => void
 *   className   – optional CSS class (defaults to "inline-cell-input")
 *   as          – 'input' | 'textarea' (defaults to 'input')
 *   rows        – textarea rows (only used when as='textarea')
 *   type        – input type (only used when as='input')
 */
const CellInput = memo(function CellInput({ value, rowIndex, colIndex, onCellEdit, className, as, rows, type }) {
  const asStr = value == null ? '' : String(value)
  const [local, setLocal] = useState(asStr)
  const parentRef = useRef(asStr)
  // Track the value at focus-time so we know whether anything actually changed
  const committedRef = useRef(asStr)
  const dirtyRef = useRef(false)
  const localRef = useRef(asStr) // latest local value for commit closure

  // Sync from parent when value changed externally (recalc, sheet switch, etc.)
  if (asStr !== parentRef.current) {
    parentRef.current = asStr
    committedRef.current = asStr
    dirtyRef.current = false
    localRef.current = asStr
    if (local !== asStr) setLocal(asStr)
  }

  const handleChange = useCallback((e) => {
    const v = e.target.value
    setLocal(v)
    localRef.current = v
    dirtyRef.current = (v !== committedRef.current)
  }, [])

  const commit = useCallback(() => {
    if (!dirtyRef.current) return
    const v = localRef.current
    dirtyRef.current = false
    committedRef.current = v
    parentRef.current = v
    if (typeof onCellEdit === 'function') {
      onCellEdit({ rowIndex, colIndex, value: v })
    }
  }, [onCellEdit, rowIndex, colIndex])

  const handleBlur = useCallback(() => {
    commit()
  }, [commit])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && as !== 'textarea') {
      e.target.blur() // triggers handleBlur → commit
    } else if (e.key === 'Escape') {
      // Revert to last committed value
      const revert = committedRef.current
      setLocal(revert)
      dirtyRef.current = false
      e.target.blur()
    }
  }, [as])

  if (as === 'textarea') {
    return (
      <textarea
        className={className || 'inline-cell-textarea'}
        value={local}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        rows={rows || 3}
      />
    )
  }

  return (
    <input
      type={type || 'text'}
      className={className || 'inline-cell-input'}
      value={local}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  )
})

/**
 * Memoized select with local state for instant visual feedback.
 * Selects commit immediately on change (no blur needed).
 */
const CellSelect = memo(function CellSelect({ value, rowIndex, colIndex, onCellEdit, className, children }) {
  const asStr = value == null ? '' : String(value)
  const [local, setLocal] = useState(asStr)
  const parentRef = useRef(asStr)

  if (asStr !== parentRef.current) {
    parentRef.current = asStr
    if (local !== asStr) setLocal(asStr)
  }

  return (
    <select
      className={className}
      value={local}
      onChange={(e) => {
        const v = e.target.value
        setLocal(v)
        parentRef.current = v
        if (typeof onCellEdit === 'function') {
          onCellEdit({ rowIndex, colIndex, value: v })
        }
      }}
    >
      {children}
    </select>
  )
})

export default CellInput
export { CellSelect }

/**
 * Combo input — editable text field with autocomplete dropdown.
 * User can type freely OR pick from filtered suggestions.
 * Commits on blur, Enter (picks highlighted or commits typed text), Escape reverts.
 */
const CellCombo = memo(function CellCombo({ value, rowIndex, colIndex, onCellEdit, options = [], className }) {
  const asStr = value == null ? '' : String(value)
  const [local, setLocal] = useState(asStr)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const parentRef = useRef(asStr)
  const committedRef = useRef(asStr)
  const dirtyRef = useRef(false)
  const localRef = useRef(asStr)
  const wrapRef = useRef(null)

  if (asStr !== parentRef.current) {
    parentRef.current = asStr
    committedRef.current = asStr
    dirtyRef.current = false
    localRef.current = asStr
    if (local !== asStr) setLocal(asStr)
  }

  const filtered = useMemo(() => {
    if (!local) return options
    const lower = local.toLowerCase()
    return options.filter((o) => o.toLowerCase().includes(lower))
  }, [local, options])

  const commit = useCallback((v) => {
    const val = v ?? localRef.current
    dirtyRef.current = false
    committedRef.current = val
    parentRef.current = val
    setOpen(false)
    setHighlight(-1)
    if (typeof onCellEdit === 'function') {
      onCellEdit({ rowIndex, colIndex, value: val })
    }
  }, [onCellEdit, rowIndex, colIndex])

  const handleChange = useCallback((e) => {
    const v = e.target.value
    setLocal(v)
    localRef.current = v
    dirtyRef.current = (v !== committedRef.current)
    setOpen(true)
    setHighlight(-1)
  }, [])

  const handleFocus = useCallback(() => {
    setOpen(true)
  }, [])

  const handleBlur = useCallback((e) => {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      if (wrapRef.current && wrapRef.current.contains(document.activeElement)) return
      if (dirtyRef.current) commit()
      setOpen(false)
    }, 150)
  }, [commit])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlight >= 0 && highlight < filtered.length) {
        const picked = filtered[highlight]
        setLocal(picked)
        localRef.current = picked
        dirtyRef.current = (picked !== committedRef.current)
        commit(picked)
      } else {
        commit()
      }
      e.target.blur()
    } else if (e.key === 'Escape') {
      const revert = committedRef.current
      setLocal(revert)
      localRef.current = revert
      dirtyRef.current = false
      setOpen(false)
      e.target.blur()
    }
  }, [commit, filtered, highlight])

  const pickOption = useCallback((opt) => {
    setLocal(opt)
    localRef.current = opt
    dirtyRef.current = (opt !== committedRef.current)
    commit(opt)
  }, [commit])

  return (
    <div ref={wrapRef} className="cell-combo-wrap">
      <input
        type="text"
        className={className || 'inline-cell-input'}
        value={local}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="cell-combo-list">
          {filtered.map((opt, i) => (
            <li
              key={opt}
              className={`cell-combo-item${i === highlight ? ' highlighted' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pickOption(opt) }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})

export { CellCombo }
