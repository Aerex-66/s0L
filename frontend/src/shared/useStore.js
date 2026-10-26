import { create } from 'zustand'
import { MODAL_FLAG_MAP, MODAL_KEYS } from './constants'

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

    // Actions
    openModal: (modalKey) => set({ activeModal: modalKey, ...getModalFlags(modalKey) }),
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
