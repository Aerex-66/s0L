import { cx } from '../utils/cx'

/**
 * Shared tab bar used by any shell module.
 * Reads tab definitions from the registry — never hardcodes labels/icons.
 */
export default function WorkspaceTabs({ tabs, activeTab, onSelect, deal }) {
  return (
    <nav className="workspace-tabs" role="tablist" aria-label="Module tabs">
      {tabs.map((tab) => {
        const badge = typeof tab.badge === 'function' ? tab.badge(deal || {}) : null
        const Icon = tab.icon || null
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            data-tab={tab.id}
            className={cx('workspace-tab', activeTab === tab.id && 'active')}
            onClick={() => onSelect(tab.id)}
          >
            {Icon && <Icon size={15} className="workspace-tab-icon" />}
            <span className="workspace-tab-label">{tab.label}</span>
            {badge != null && <span className="workspace-tab-badge">{badge}</span>}
          </button>
        )
      })}
    </nav>
  )
}
