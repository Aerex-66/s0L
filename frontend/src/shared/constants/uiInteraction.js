export const MODAL_KEYS = {
  NEW_DEAL: 'newDeal',
  SETTINGS: 'settings',
  COMMAND_PALETTE: 'commandPalette',
  IMPORT: 'import',
  EXPORT: 'export',
  ACTION: 'action',
  DEAL_DETAILS: 'dealDetails',
}

export const MODAL_FLAG_MAP = {
  [MODAL_KEYS.NEW_DEAL]: 'showNewDealModal',
  [MODAL_KEYS.SETTINGS]: 'showSettings',
  [MODAL_KEYS.COMMAND_PALETTE]: 'showCommandPalette',
  [MODAL_KEYS.IMPORT]: 'showImportModal',
  [MODAL_KEYS.EXPORT]: 'showExportModal',
  [MODAL_KEYS.ACTION]: 'showActionModal',
  [MODAL_KEYS.DEAL_DETAILS]: 'showDealDetails',
}

export const APP_SHORTCUTS = [
  { key: 'k', modal: MODAL_KEYS.COMMAND_PALETTE, ctrlOrMeta: true },
  { key: 'n', modal: MODAL_KEYS.NEW_DEAL, ctrlOrMeta: true },
  { key: 'i', modal: MODAL_KEYS.IMPORT, ctrlOrMeta: true },
  { key: 'e', modal: MODAL_KEYS.EXPORT, ctrlOrMeta: true },
  { key: ',', modal: MODAL_KEYS.SETTINGS, ctrlOrMeta: true },
]
