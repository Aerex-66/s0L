import { create } from 'zustand'
import { MODAL_FLAG_MAP, MODAL_KEYS } from './constants'
import { get as apiGet, put as apiPut } from './apiClient'

function getModalFlags(activeModal) {
  return Object.entries(MODAL_FLAG_MAP).reduce((acc, [modalKey, stateKey]) => {
    acc[stateKey] = activeModal === modalKey
    return acc
  }, {})
}

const useStore = create((set, get) => ({
    // Navigation
    currentDealId: null,

    // Modal visibility — activeModal is the source of truth.
    // Legacy show* flags kept in sync via getModalFlags() for backward compat.
    activeModal: null,
    showNewDealModal: false,
    showSettings: false,
    showCommandPalette: false,
    showImportModal: false,
    showExportModal: false,
    showActionModal: false,
    showDealDetails: false,
    settingsTab: null,

    // Whose deals the dashboard shows (saved by the backend for this computer)
    preferences: { solutioner: '', scope: 'mine' },
    loadPreferences: async () => {
      try {
        set({ preferences: await apiGet('/api/preferences') })
      } catch (error) {
        console.error('Loading preferences failed:', error)
      }
    },
    savePreferences: async (patch) => {
      set({ preferences: { ...get().preferences, ...patch } })
      try {
        set({ preferences: await apiPut('/api/preferences', patch) })
      } catch (error) {
        console.error('Saving preferences failed:', error)
      }
    },

    // Actions
    openModal: (modalKey) => set({ activeModal: modalKey, settingsTab: null, ...getModalFlags(modalKey) }),
    openSettingsAt: (tab) => set({ activeModal: MODAL_KEYS.SETTINGS, settingsTab: tab, ...getModalFlags(MODAL_KEYS.SETTINGS) }),
    closeModal: () => set({ activeModal: null, ...getModalFlags(null) }),
    setCurrentDealId: (id) => set({ currentDealId: id }),

    // Unified setter — all legacy setShow* route through the same logic
    _setModalFlag: (modalKey, show) => {
      const nextModal = show ? modalKey : null
      set({ activeModal: nextModal, ...getModalFlags(nextModal) })
    },
    setShowNewDealModal:   (show) => get()._setModalFlag(MODAL_KEYS.NEW_DEAL, show),
    setShowSettings:       (show) => get()._setModalFlag(MODAL_KEYS.SETTINGS, show),
    setShowCommandPalette: (show) => get()._setModalFlag(MODAL_KEYS.COMMAND_PALETTE, show),
    setShowImportModal:    (show) => get()._setModalFlag(MODAL_KEYS.IMPORT, show),
    setShowExportModal:    (show) => get()._setModalFlag(MODAL_KEYS.EXPORT, show),
    setShowActionModal:    (show) => get()._setModalFlag(MODAL_KEYS.ACTION, show),
    setShowDealDetails:    (show) => get()._setModalFlag(MODAL_KEYS.DEAL_DETAILS, show),
  })
)

export default useStore
