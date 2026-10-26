import { formatDealName, IMPLEMENTATION_TYPE_COLORS, CLOSED_STATUSES } from './shared/constants'
import { SearchIcon, SettingsIcon, EditIcon } from './shared/ui/Icons'
import { cx } from './shared/utils/cx'
import { useMemo } from 'react'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import Tip from './shared/ui/Tip'
import ThemeSwitcher from './shared/ui/ThemeSwitcher'

export default function AppHeader({
  currentDeal,
  currentDealId,
  viewMode,
  setViewMode,
  layoutMode,
  setLayoutMode,
  deals,
  onBrandClick,
  onCommandPalette,
  onSettings,
  onDealDetails,
  onNewDeal,
  onExitDeal,
}) {
  const headerMode = currentDeal ? 'deal' : 'dashboard'

  const activeCount = useMemo(() => {
    if (currentDeal) return 0
    return (deals || []).filter(d => !CLOSED_STATUSES.includes(d.status)).length
  }, [deals, currentDeal])

  const archiveCount = useMemo(() => {
    if (currentDeal) return 0
    return (deals || []).filter(d => CLOSED_STATUSES.includes(d.status)).length
  }, [deals, currentDeal])

  return (
    <header className={cx('app-header', `${headerMode}-mode`)}>
      <div className="header-row">
        {/* Left: brand + breadcrumb */}
        <div className="header-left">
          <div
            className="header-brand"
            onClick={onBrandClick}
            title={currentDealId ? 'Toggle Opportunity Drawer' : 'Dashboard'}
          >
            <span className="brand-mark">s0L</span>
            {!currentDeal && <span className="brand-sub">Deal Tracker</span>}
          </div>
          {currentDeal && (
            <>
              <span className="header-breadcrumb-sep">/</span>
              <div className="header-breadcrumb-deal">
                <span className="breadcrumb-name">{formatDealName(currentDeal.project_name)}</span>
                {(() => {
                  const raw = currentDeal.implementation_type
                  const types = Array.isArray(raw) ? raw : raw ? [raw] : []
                  return types.map((t) => (
                    <span
                      key={t}
                      className="breadcrumb-impl-tag"
                      style={{ '--impl-color': IMPLEMENTATION_TYPE_COLORS[t] || '#8d8d8d' }}
                    >
                      {t}
                    </span>
                  ))
                })()}
              </div>
            </>
          )}
        </div>

        {/* Right: actions */}
        <div className="header-right">
          {!currentDeal && (
            <ToggleGroup.Root
              type="single"
              value={viewMode}
              onValueChange={(v) => { if (v) setViewMode(v) }}
              className="header-toggle-group"
            >
              <ToggleGroup.Item value="active" className={cx('header-toggle', viewMode === 'active' && 'active')}>
                Active <span className="header-toggle-count">{activeCount}</span>
              </ToggleGroup.Item>
              <ToggleGroup.Item value="archives" className={cx('header-toggle', viewMode === 'archives' && 'active')}>
                Archives <span className="header-toggle-count">{archiveCount}</span>
              </ToggleGroup.Item>
            </ToggleGroup.Root>
          )}
          {!currentDeal && (
            <ToggleGroup.Root
              type="single"
              value={layoutMode}
              onValueChange={(v) => { if (v) setLayoutMode(v) }}
              className="header-toggle-group"
            >
              <ToggleGroup.Item value="grid" className={cx('header-toggle', layoutMode === 'grid' && 'active')}>
                Tiles
              </ToggleGroup.Item>
              <ToggleGroup.Item value="metrics" className={cx('header-toggle', layoutMode === 'metrics' && 'active')}>
                Metrics
              </ToggleGroup.Item>
            </ToggleGroup.Root>
          )}
          <Tip content="Search &amp; commands (⌘K)">
            <button className="header-action-btn" onClick={onCommandPalette}>
              <SearchIcon />
            </button>
          </Tip>
          <ThemeSwitcher />
          {currentDeal && (
            <Tip content="Edit deal details">
              <button className="header-action-btn" onClick={onDealDetails}>
                <EditIcon />
              </button>
            </Tip>
          )}
          {currentDeal && (
            <Tip content="Settings (⌘,)">
              <button className="header-action-btn" onClick={onSettings}>
                <SettingsIcon />
              </button>
            </Tip>
          )}
          {!currentDeal && (
            <Tip content="New Deal (⌘N)">
              <button className="header-new-deal" onClick={onNewDeal}>
                + New Deal
              </button>
            </Tip>
          )}
          {currentDeal && (
            <Tip content="Exit to pipeline" side="left">
              <button className="cmd-btn" onClick={onExitDeal}>
                <span aria-hidden="true">←</span> Pipeline
              </button>
            </Tip>
          )}
        </div>
      </div>
    </header>
  )
}
