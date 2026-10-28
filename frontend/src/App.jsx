import { lazy, Suspense, useState, useEffect, useMemo } from 'react'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/deals.css'
import './styles/home.css'
import AppHeader from './AppHeader'
import DealList from './features/deals/components/DealList'
import ErrorBoundary from './shared/ui/ErrorBoundary'
import LazyGate from './shared/ui/LazyGate'
import Loader from './shared/ui/Loader'
import OpportunityDrawer from './features/deals/components/OpportunityDrawer'
import useStore from './shared/useStore'
import useDealStore from './shared/dealStore'
import { mondayService } from './shared/services/mondayService'
import { dealsInScope } from './shared/utils/solutioners'
import { APP_SHORTCUTS, MODAL_KEYS } from './shared/constants'
import { useDeals } from './features/deals/useDeals'
import { DEFAULT_DEAL_SHELL_MODULE_ID, DEAL_SHELL_MODULES, emitDealShellSelection } from './shell/dealShell'
import { MODULE_REGISTRY } from './shell/moduleRegistry'
import NamePicker from './shell/NamePicker'
import { cx } from './shared/utils/cx'
import { initTheme } from './shared/ui/ThemeSwitcher'

// Apply saved theme before first paint
initTheme()

const NewDealModal = lazy(() => import('./features/deals/components/NewDealModal'))
const Settings = lazy(() => import('./features/settings/components/Settings'))
const CommandPalette = lazy(() => import('./features/deals/components/CommandPalette'))
const ImportModal = lazy(() => import('./features/deals/components/ImportModal'))
const ExportModal = lazy(() => import('./features/deals/components/ExportModal'))
const ActionModal = lazy(() => import('./features/shell/ActionModal'))
const DealDetailsPanel = lazy(() => import('./features/deals/components/DealDetailsPanel'))
const ExecDashboard = lazy(() => import('./features/deals/components/ExecDashboard'))

const MONDAY_SIGN_IN_ERRORS = {
  not_configured: "monday isn't set up on this computer yet. Ask whoever manages s0L for the monday app file.",
  bad_state: 'The monday sign-in took too long or was started twice. Click the monday icon at the top to try again.',
  denied: 'monday sign-in was cancelled.',
  exchange_failed: "monday didn't accept the sign-in. Click the monday icon at the top to try again.",
}

const LAYOUT_KEY = 's0l-layout'
const LAYOUTS = ['grid', 'metrics', 'exec']

function savedLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    return LAYOUTS.includes(saved) ? saved : 'grid'
  } catch {
    return 'grid'
  }
}

function App() {
  const [isOpportunityDrawerOpen, setIsOpportunityDrawerOpen] = useState(true)
  const [activeDealShellModuleId, setActiveDealShellModuleId] = useState(DEFAULT_DEAL_SHELL_MODULE_ID)
  const [viewMode, setViewMode] = useState('active')
  const [layoutMode, setLayoutModeState] = useState(savedLayout)
  // The dashboard reopens on the view you left it on, even after the page reloads.
  const setLayoutMode = (mode) => {
    setLayoutModeState(mode)
    try { localStorage.setItem(LAYOUT_KEY, mode) } catch { /* private mode: just don't remember */ }
  }
  
  const {
    currentDealId,
    showNewDealModal,
    showSettings,
    showCommandPalette,
    showImportModal,
    showExportModal,
    showActionModal,
    showDealDetails,
    activeModal,
    setCurrentDealId,
    openModal,
    closeModal,
    setShowNewDealModal,
    setShowSettings,
    setShowCommandPalette,
    setShowImportModal,
    setShowExportModal,
    setShowDealDetails,
    settingsTab,
    openSettingsAt,
    preferences,
    loadPreferences,
    savePreferences,
  } = useStore()

  const { deals, loading, appNotice, loadDeals, createDeal, archiveDeal, restoreDeal } = useDeals()
  const setAppNotice = useDealStore((s) => s.setAppNotice)
  const runMondaySync = useDealStore((s) => s.runMondaySync)
  const mondayKnowsMe = useDealStore((s) => Boolean(s.mondayMe))
  const openNamePicker = useDealStore((s) => s.openNamePicker)

  // The dashboard shows the user's own deals until they switch to everyone's (or haven't picked their name yet).
  const dashboardDeals = useMemo(() => dealsInScope(deals, preferences), [deals, preferences])
  const needsName = preferences.scope === 'mine' && !preferences.solutioner

  useEffect(() => { loadPreferences() }, [loadPreferences])

  const handleScopeChange = (scope) => {
    savePreferences({ scope })
    if (scope === 'mine' && !preferences.solutioner) openSettingsAt('view')
  }

  // monday: finish a return from monday's sign-in page, then sync the board once if signed in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('monday')
    if (result) {
      const reason = params.get('reason')
      params.delete('monday')
      params.delete('reason')
      const query = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
      if (result !== 'connected') setAppNotice(MONDAY_SIGN_IN_ERRORS[reason] || 'monday sign-in failed. Click the monday icon at the top to try again.')
    }
    mondayService.status()
      .then((status) => {
        if (status.connected) runMondaySync()
        else if (status.app_configured && status.last_sync) setAppNotice('monday: click the monday icon at the top to sign in again and keep deals in sync.')
      })
      .catch(() => {})
  }, [runMondaySync, setAppNotice])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e) => {
      const shortcut = APP_SHORTCUTS.find((candidate) => {
        if (candidate.ctrlOrMeta && !(e.metaKey || e.ctrlKey)) return false
        return e.key === candidate.key
      })

      if (shortcut) {
        e.preventDefault()
        openModal(shortcut.modal)
        return
      }

      if (e.key === 'Escape') {
        if (activeModal) closeModal()
        else if (currentDealId) setCurrentDealId(null)
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [activeModal, closeModal, currentDealId, openModal, setCurrentDealId])

  const currentDeal = deals.find(d => String(d.id) === String(currentDealId))

  const handleDealShellModuleSelect = (moduleId) => {
    setActiveDealShellModuleId(moduleId)
    emitDealShellSelection({ module: DEAL_SHELL_MODULES.find(m => m.id === moduleId) || null, deal: currentDeal })
  }

  const openDeal = (dealId) => {
    setCurrentDealId(dealId)
    setIsOpportunityDrawerOpen(true)
    setActiveDealShellModuleId(DEFAULT_DEAL_SHELL_MODULE_ID)
  }

  if (loading) {
    return <Loader.Page />
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <AppHeader
          currentDeal={currentDeal}
          currentDealId={currentDealId}
          viewMode={viewMode}
          setViewMode={setViewMode}
          layoutMode={layoutMode}
          setLayoutMode={setLayoutMode}
          deals={dashboardDeals}
          dealScope={preferences.scope}
          solutioner={preferences.solutioner}
          onScopeChange={handleScopeChange}
          onBrandClick={() => currentDealId ? setIsOpportunityDrawerOpen(p => !p) : setCurrentDealId(null)}
          onCommandPalette={() => openModal(MODAL_KEYS.COMMAND_PALETTE)}
          onSettings={() => openModal(MODAL_KEYS.SETTINGS)}
          onDealDetails={() => openModal(MODAL_KEYS.DEAL_DETAILS)}
          onNewDeal={() => openModal(MODAL_KEYS.NEW_DEAL)}
          onExitDeal={() => setCurrentDealId(null)}
        />

        <main className={cx('app-main', currentDealId ? 'workspace-mode' : 'dashboard-mode')}>
          {appNotice && <div className="text-danger mb-sm">{appNotice}</div>}
          {currentDealId ? (
            <div className={cx('window-workspace', isOpportunityDrawerOpen ? 'drawer-open' : 'drawer-closed')}>
              <aside className="window-left-rail glass-panel" aria-label="Opportunity navigation rail">
                <OpportunityDrawer
                  deal={currentDeal}
                  activeSection={activeDealShellModuleId}
                  onSelectSection={handleDealShellModuleSelect}
                />
              </aside>
              <div className="window-main-content glass-panel">
                <Suspense fallback={<Loader.Module />}>
                  {(() => {
                    const ActiveModule = MODULE_REGISTRY[activeDealShellModuleId] ?? MODULE_REGISTRY.home
                    return <ActiveModule key={activeDealShellModuleId} deal={currentDeal} onUpdate={loadDeals} />
                  })()}
                </Suspense>
              </div>
            </div>
          ) : layoutMode === 'exec' ? (
            <Suspense fallback={<Loader.Module />}>
              <ExecDashboard deals={deals} onSelectDeal={openDeal} />
            </Suspense>
          ) : (
            <DealList
              deals={dashboardDeals}
              teamView={preferences.scope === 'everyone'}
              needsName={needsName}
              me={preferences.scope === 'mine' ? preferences.solutioner : ''}
              onPickName={() => (mondayKnowsMe ? openNamePicker() : openSettingsAt('view'))}
              viewMode={viewMode}
              layoutMode={layoutMode}
              onSelectDeal={openDeal}
              onArchiveDeal={archiveDeal}
              onRestoreDeal={restoreDeal}
              onCreateDeal={() => openModal(MODAL_KEYS.NEW_DEAL)}
            />
          )}
        </main>

        <LazyGate when={showNewDealModal}>
          <NewDealModal
            onClose={() => setShowNewDealModal(false)}
            onCreate={(data) => createDeal(data, (id) => { openDeal(id); setShowNewDealModal(false) })}
            onAdded={async (deal) => { await loadDeals(); openDeal(deal.id); setShowNewDealModal(false) }}
          />
        </LazyGate>
        <NamePicker />
        <LazyGate when={showSettings}>
          <Settings initialTab={settingsTab} onClose={() => setShowSettings(false)} />
        </LazyGate>
        <LazyGate when={showCommandPalette}>
          <CommandPalette deals={deals} onSelectDeal={setCurrentDealId} onClose={() => setShowCommandPalette(false)} />
        </LazyGate>
        <LazyGate when={showImportModal}>
          <ImportModal onClose={() => setShowImportModal(false)} onImport={loadDeals} />
        </LazyGate>
        <LazyGate when={showExportModal}>
          <ExportModal deals={deals} onClose={() => setShowExportModal(false)} />
        </LazyGate>
        <LazyGate when={showActionModal && currentDeal}>
          <ActionModal 
            deal={currentDeal} 
            activeModuleId={activeDealShellModuleId} 
            onUpdate={loadDeals} 
          />
        </LazyGate>
        <LazyGate when={showDealDetails && currentDeal}>
          <DealDetailsPanel
            deal={currentDeal}
            onClose={() => setShowDealDetails(false)}
            onUpdate={loadDeals}
          />
        </LazyGate>
      </div>
    </ErrorBoundary>
  )
}

export default App
