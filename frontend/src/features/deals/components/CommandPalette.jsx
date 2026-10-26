import { useState, useEffect, useMemo, useRef } from 'react'
import Fuse from 'fuse.js'
import useStore from '../../../shared/useStore'
import { SearchIcon } from '../../../shared/ui/Icons'
import { cx } from '../../../shared/utils/cx'

export default function CommandPalette({ deals, onSelectDeal, onClose }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  
  const {
    setShowNewDealModal,
    setShowSettings,
    setShowImportModal,
    setShowExportModal
  } = useStore()

  // Fuzzy search setup
  const fuse = useMemo(() => new Fuse(deals, {
    keys: ['project_name', 'client_name', 'opportunity_number', 'sector', 'industry'],
    threshold: 0.3,
    includeScore: true
  }), [deals])

  // Quick actions
  const quickActions = useMemo(() => ([
    {
      id: 'new-deal',
      title: 'Create New Deal',
      action: () => {
        setShowNewDealModal(true)
        onClose()
      }
    },
    {
      id: 'import',
      title: 'Import Deals',
      action: () => {
        setShowImportModal(true)
        onClose()
      }
    },
    {
      id: 'export',
      title: 'Export Deals',
      action: () => {
        setShowExportModal(true)
        onClose()
      }
    },
    {
      id: 'settings',
      title: 'Settings',
      action: () => {
        setShowSettings(true)
        onClose()
      }
    }
  ]), [onClose, setShowExportModal, setShowImportModal, setShowNewDealModal, setShowSettings])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => {
    if (!query.trim()) {
      return quickActions
    }

    const dealResults = fuse.search(query).slice(0, 8).map(result => ({
      id: result.item.id,
      title: result.item.project_name,
      subtitle: `${result.item.client_name} • ${result.item.opportunity_number}`,
      deal: result.item,
      action: () => {
        onSelectDeal(result.item.id)
        onClose()
      }
    }))

    const actionResults = quickActions.filter(action =>
      action.title.toLowerCase().includes(query.toLowerCase())
    )

    return [...actionResults, ...dealResults]
  }, [fuse, onClose, onSelectDeal, query, quickActions])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault()
      results[selectedIndex].action()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-input-wrapper">
          <SearchIcon size={20} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Search deals or type a command..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="command-palette-hint">ESC</kbd>
        </div>
        
        <div className="command-palette-results">
          {results.length === 0 ? (
            <div className="command-palette-empty">
              No results found for "{query}"
            </div>
          ) : (
            results.map((result, index) => (
              <div
                key={result.id}
                className={cx('command-palette-result', index === selectedIndex && 'selected')}
                onClick={result.action}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="command-palette-result-content">
                  <div className="command-palette-result-title">{result.title}</div>
                  {result.subtitle && (
                    <div className="command-palette-result-subtitle">{result.subtitle}</div>
                  )}
                </div>
                {result.deal && result.deal.implementation_type && (
                  <span className="command-palette-result-badge">
                    {result.deal.implementation_type}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        
        <div className="command-palette-footer">
          <div className="command-palette-shortcuts">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Select</span>
            <span><kbd>ESC</kbd> Close</span>
          </div>
        </div>
      </div>
    </div>
  )
}
