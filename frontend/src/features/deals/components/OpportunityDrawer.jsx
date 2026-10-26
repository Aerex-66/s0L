import { DEAL_SHELL_MODULES } from '../../../shell/dealShell'
import { MODULE_ICONS } from '../../../shared/ui/Icons'
import { cx } from '../../../shared/utils/cx'

export default function OpportunityDrawer({ activeSection, onSelectSection, deal }) {
  const title = deal?.client_name || 'Selected Deal'
  const subtitle = deal?.opportunity_number || 'Opportunity'

  return (
    <aside className="opportunity-drawer" aria-label="Opportunity main menu">
      <div className="opportunity-drawer-header">
        <div className="opportunity-drawer-title">{title}</div>
        <div className="opportunity-drawer-meta">
          <span className="opportunity-drawer-subtitle">{subtitle}</span>
        </div>
      </div>

      <nav className="opportunity-drawer-nav">
        {DEAL_SHELL_MODULES.map((module) => (
          <button
            key={module.id}
            className={cx('opportunity-drawer-item', activeSection === module.id && 'active')}
            onClick={() => onSelectSection(module.id)}
            type="button"
          >
            <span className="drawer-item-icon">
              {MODULE_ICONS[module.id] ? MODULE_ICONS[module.id]() : '○'}
            </span>
            <span className="drawer-item-label">{module.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
