import { lazy, Suspense, useState, useEffect } from 'react'
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
import { APP_SHORTCUTS, MODAL_KEYS } from './shared/constants'
import { useDeals } from './features/deals/useDeals'
import { DEFAULT_DEAL_SHELL_MODULE_ID, DEAL_SHELL_MODULES, emitDealShellSelection } from './shell/dealShell'
import { MODULE_REGISTRY } from './shell/moduleRegistry'
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

function App() {
  const [isOpportunityDrawerOpen, setIsOpportunityDrawerOpen] = useState(true)
  const [activeDealShellModuleId, setActiveDealShellModuleId] = useState(DEFAULT_DEAL_SHELL_MODULE_ID)
  const [viewMode, setViewMode] = useState('active')
  const [layoutMode, setLayoutMode] = useState('grid')
  
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
    setShowActionModal,
    setShowDealDetails,
  } = useStore()

  const { deals, loading, appNotice, loadDeals, createDeal, archiveDeal, restoreDeal } = useDeals()

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
          deals={deals}
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
          ) : (
            <DealList
              deals={deals}
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
          />
        </LazyGate>
        <LazyGate when={showSettings}>
          <Settings onClose={() => setShowSettings(false)} />
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
