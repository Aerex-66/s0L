import { formatDealName, IMPLEMENTATION_TYPE_COLORS, isClosedDeal } from './shared/constants'
import {
  SearchIcon, SettingsIcon, EditIcon, PlusIcon,
  ActiveDealsIcon, ArchiveIcon, TilesIcon, MetricsIcon, ExecIcon, BackIcon, MyDealsIcon, TeamDealsIcon,
} from './shared/ui/Icons'
import { cx } from './shared/utils/cx'
import { useMemo } from 'react'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import Tip from './shared/ui/Tip'
import ThemeSwitcher from './shared/ui/ThemeSwitcher'
import MondayConnect from './shell/MondayConnect'
import SalesforceConnect from './shell/SalesforceConnect'
import OutlookConnect from './shell/OutlookConnect'
import NoticeBanner from './shell/NoticeBanner'
import useUpdateStore, { readyUpdate } from './shared/updateStore'

export default function AppHeader({
  currentDeal,
  currentDealId,
  viewMode,
  setViewMode,
  layoutMode,
  setLayoutMode,
  deals,
  dealScope,
  solutioner,
  onScopeChange,
  onBrandClick,
  onCommandPalette,
  onSettings,
  onDealDetails,
  onNewDeal,
  onExitDeal,
}) {
  const headerMode = currentDeal ? 'deal' : 'dashboard'
  // The TT Exec view covers the whole team, active and archived, so whose deals and which list don't apply there.
  const dealFilters = !currentDeal && layoutMode !== 'exec'
  const updateReady = useUpdateStore((s) => readyUpdate(s.status))

  const activeCount = useMemo(() => {
    if (currentDeal) return 0
    return (deals || []).filter(d => !isClosedDeal(d)).length
  }, [deals, currentDeal])

  const archiveCount = useMemo(() => {
    if (currentDeal) return 0
    return (deals || []).filter(isClosedDeal).length
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

        {/* Notices belong to the individual dashboards; the TT Exec view is where they're sent */}
        {!currentDeal && layoutMode !== 'exec' && <NoticeBanner />}

        {/* Right: actions */}
        <div className="header-right">
          {dealFilters && (
            <ToggleGroup.Root
              type="single"
              value={dealScope}
              onValueChange={(v) => { if (v) onScopeChange(v) }}
              className="header-toggle-group"
              aria-label="Whose deals"
            >
              <Tip content={solutioner ? `My deals · ${solutioner}` : 'My deals · pick your name in Settings'}>
                <ToggleGroup.Item
                  value="mine"
                  aria-label="My deals"
                  className={cx('header-toggle', dealScope === 'mine' && 'active')}
                >
                  <MyDealsIcon />
                </ToggleGroup.Item>
              </Tip>
              <Tip content="Everyone's deals · team view">
                <ToggleGroup.Item
                  value="everyone"
                  aria-label="Everyone's deals"
                  className={cx('header-toggle', dealScope === 'everyone' && 'active')}
                >
                  <TeamDealsIcon />
                </ToggleGroup.Item>
              </Tip>
            </ToggleGroup.Root>
          )}
          {dealFilters && <span className="header-divider" aria-hidden="true" />}
          {dealFilters && (
            <ToggleGroup.Root
              type="single"
              value={viewMode}
              onValueChange={(v) => { if (v) setViewMode(v) }}
              className="header-toggle-group"
              aria-label="Deal list"
            >
              <Tip content={`Active · ${activeCount}`}>
                <ToggleGroup.Item
                  value="active"
                  aria-label={`Active deals (${activeCount})`}
                  className={cx('header-toggle', viewMode === 'active' && 'active')}
                >
                  <ActiveDealsIcon />
                </ToggleGroup.Item>
              </Tip>
              <Tip content={`Archives · ${archiveCount}`}>
                <ToggleGroup.Item
                  value="archives"
                  aria-label={`Archived deals (${archiveCount})`}
                  className={cx('header-toggle', viewMode === 'archives' && 'active')}
                >
                  <ArchiveIcon />
                </ToggleGroup.Item>
              </Tip>
            </ToggleGroup.Root>
          )}
          {dealFilters && <span className="header-divider" aria-hidden="true" />}
          {!currentDeal && (
            <ToggleGroup.Root
              type="single"
              value={layoutMode}
              onValueChange={(v) => { if (v) setLayoutMode(v) }}
              className="header-toggle-group"
              aria-label="Layout"
            >
              <Tip content="Tile view">
                <ToggleGroup.Item
                  value="grid"
                  aria-label="Tile view"
                  className={cx('header-toggle', layoutMode === 'grid' && 'active')}
                >
                  <TilesIcon />
                </ToggleGroup.Item>
              </Tip>
              <Tip content="Metrics view">
                <ToggleGroup.Item
                  value="metrics"
                  aria-label="Metrics view"
                  className={cx('header-toggle', layoutMode === 'metrics' && 'active')}
                >
                  <MetricsIcon />
                </ToggleGroup.Item>
              </Tip>
              <Tip content="TT Exec · the team's numbers and assignments">
                <ToggleGroup.Item
                  value="exec"
                  aria-label="TT Exec"
                  className={cx('header-toggle', layoutMode === 'exec' && 'active')}
                >
                  <ExecIcon />
                </ToggleGroup.Item>
              </Tip>
            </ToggleGroup.Root>
          )}
          {!currentDeal && <span className="header-divider" aria-hidden="true" />}
          <Tip content="Search &amp; commands (Ctrl+K)">
            <button className="header-action-btn" onClick={onCommandPalette} aria-label="Search and commands">
              <SearchIcon />
            </button>
          </Tip>
          <ThemeSwitcher />
          {currentDeal && (
            <Tip content="Edit deal details">
              <button className="header-action-btn" onClick={onDealDetails} aria-label="Edit deal details">
                <EditIcon />
              </button>
            </Tip>
          )}
          <MondayConnect />
          <SalesforceConnect />
          <OutlookConnect />
          <Tip content={updateReady ? `Settings (Ctrl+,) · s0L ${updateReady} is ready to install` : 'Settings (Ctrl+,)'}>
            <button
              className="header-action-btn"
              onClick={onSettings}
              aria-label={updateReady ? `Settings: s0L ${updateReady} is ready to install` : 'Settings'}
            >
              <SettingsIcon />
              {updateReady && <span className="header-settings-dot" aria-hidden="true" />}
            </button>
          </Tip>
          {!currentDeal && (
            <Tip content="New deal (Ctrl+N)">
              <button className="header-new-deal" onClick={onNewDeal} aria-label="New deal">
                <PlusIcon size={16} />
              </button>
            </Tip>
          )}
          {currentDeal && (
            <Tip content="Back to pipeline" side="left">
              <button className="header-action-btn" onClick={onExitDeal} aria-label="Back to pipeline">
                <BackIcon />
              </button>
            </Tip>
          )}
        </div>
      </div>
    </header>
  )
}
