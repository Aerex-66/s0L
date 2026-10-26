import { useState, useCallback, useMemo } from 'react'

/**
 * Reusable column-visibility toggle hook + UI component.
 *
 * Usage:
 *   const { visibleCols, hiddenSet, toggleCol, ColumnToggleButton, ColumnTogglePanel } = useColumnToggle(columns)
 *
 *   columns = [{ key: 'rollout', label: 'Rollout' }, ...]
 *
 *   - `visibleCols` — object { [key]: boolean }
 *   - `hiddenSet`   — Set of hidden keys (for fast lookup in render)
 *   - `toggleCol(key)` — flip a column
 *   - `ColumnToggleButton` — the "Columns" / "Done" button (place in stat-row)
 *   - `ColumnTogglePanel` — the checkbox grid (render below header)
 */
export function useColumnToggle(columns, defaultVisible) {
  const [showPanel, setShowPanel] = useState(false)

  const [visibleCols, setVisibleCols] = useState(() => {
    const init = {}
    columns.forEach((c) => {
      init[c.key] = defaultVisible ? !!defaultVisible[c.key] : true
    })
    return init
  })

  const hiddenSet = useMemo(
    () => new Set(Object.entries(visibleCols).filter(([, v]) => !v).map(([k]) => k)),
    [visibleCols],
  )

  const toggleCol = useCallback((key) => {
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const ColumnToggleButton = useCallback(
    () => (
      <button
        type="button"
        className="btn btn-text btn-sm"
        onClick={() => setShowPanel((prev) => !prev)}
      >
        {showPanel ? 'Done' : 'Columns'}
      </button>
    ),
    [showPanel],
  )

  const ColumnTogglePanel = useCallback(
    () =>
      showPanel ? (
        <div className="column-admin">
          {columns.map((c) => (
            <label key={c.key} className="column-admin-check">
              <input
                type="checkbox"
                checked={!!visibleCols[c.key]}
                onChange={() => toggleCol(c.key)}
              />
              {c.label}
            </label>
          ))}
        </div>
      ) : null,
    [showPanel, columns, visibleCols, toggleCol],
  )

  return { visibleCols, hiddenSet, toggleCol, togglePanel: () => setShowPanel((p) => !p), ColumnToggleButton, ColumnTogglePanel }
}
