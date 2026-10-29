import { useEffect } from 'react'
import { DEAL_SHELL_MODULES } from '../../../shell/dealShell'
import { MODULE_ICONS } from '../../../shared/ui/Icons'
import { cx } from '../../../shared/utils/cx'
import useClientLogoStore, { clientKey, logoSrc } from '../clientLogoStore'

const monogram = (name) => String(name).split(/[\s-]+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()

export default function OpportunityDrawer({ activeSection, onSelectSection, deal }) {
  const title = deal?.client_name || 'Selected Deal'
  const subtitle = deal?.opportunity_number || 'Opportunity'
  const logo = useClientLogoStore((s) => s.logos[clientKey(deal?.client_name)])
  const logosLoaded = useClientLogoStore((s) => Object.keys(s.logos).length > 0)
  const loadLogos = useClientLogoStore((s) => s.load)
  const src = logoSrc(logo)

  useEffect(() => { if (!logosLoaded) loadLogos() }, [logosLoaded, loadLogos])

  return (
    <aside className="opportunity-drawer" aria-label="Opportunity main menu">
      <div className="opportunity-drawer-header">
        <div className={cx('opportunity-drawer-logo', !src && 'is-monogram')} title={title}>
          {src ? <img src={src} alt={title} draggable="false" /> : <span role="img" aria-label={title}>{monogram(title)}</span>}
        </div>
        <hr className="opportunity-drawer-divider" />
        <div className="opportunity-drawer-meta">
          <span className="opportunity-drawer-subtitle" title="Opportunity number">{subtitle}</span>
        </div>
      </div>
      <hr className="opportunity-drawer-divider opportunity-drawer-divider--nav" />

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
