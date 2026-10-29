/**
 * dealStore — shared deal-data layer (Zustand).
 *
 * Single cached source of deal records for ALL modules. Home tabs, GSSM,
 * iSBD, Documents, and Metrics render their own UI but read/write the same
 * deal objects held here, so an edit made in one module is immediately
 * visible in every other module without a full refetch.
 *
 * - loadDeals(): refetch everything from Flask (initial load / bulk ops)
 * - patchDeal(deal): merge one updated deal record into the cache
 *   (used after PUT /api/deals/:id responses — no refetch needed)
 * - syncStatus: GSSM → deal sync health, surfaced in the UI so silent
 *   sync failures are impossible.
 */
import { create } from 'zustand'
import { dealService } from './services/dealService'
import { mondayService } from './services/mondayService'
import { salesforceService } from './services/salesforceService'
import { migrateTimelineStructure } from './utils/migrateTimelines'

const useDealStore = create((set, get) => ({
  deals: [],
  loading: true,
  appNotice: '',
  initialLoad: null,

  // GSSM → deal sync health: 'idle' | 'syncing' | 'ok' | 'error'
  syncStatus: { state: 'idle', at: null, message: '' },

  // monday board → deal sync: 'idle' | 'syncing' | 'ok' | 'error', plus the last summary
  mondaySync: { state: 'idle', summary: null, message: '', at: null },

  // Salesforce check of the board's deals: 'idle' | 'checking' | 'ok' | 'error', plus the last summary
  salesforceCheck: { state: 'idle', summary: null, message: '', at: null },

  // Who the signed-in monday person is on the board: { email, name, is_exec, names }; null until known.
  mondayMe: null,
  namePickerOpen: false,

  loadMondayMe: async () => {
    try {
      const me = await mondayService.me()
      set({ mondayMe: me, namePickerOpen: !me.name })
      return me
    } catch {
      return null
    }
  },

  rememberMondayMe: async (name) => {
    const me = await mondayService.rememberMe(name)
    set({ mondayMe: me, namePickerOpen: false })
    return me
  },

  openNamePicker: () => set({ namePickerOpen: true }),
  closeNamePicker: () => set({ namePickerOpen: false }),

  runMondaySync: async () => {
    if (get().mondaySync.state === 'syncing') return
    set((s) => ({ mondaySync: { ...s.mondaySync, state: 'syncing', message: '' } }))
    try {
      const summary = await mondayService.sync()
      set({ mondaySync: { state: 'ok', summary, message: '', at: new Date().toISOString() } })
      await get().loadDeals()
      // The board's opportunity numbers are fresh, so check them against Salesforce when signed in there.
      get().runSalesforceCheck({ ifConnected: true })
    } catch (error) {
      set((s) => ({ mondaySync: { ...s.mondaySync, state: 'error', message: error.message } }))
    }
  },

  runSalesforceCheck: async ({ ifConnected = false } = {}) => {
    const before = get().salesforceCheck
    if (before.state === 'checking') return
    set({ salesforceCheck: { ...before, state: 'checking', message: '' } })
    try {
      if (ifConnected && !(await salesforceService.status()).connected) {
        set({ salesforceCheck: before })
        return
      }
      const summary = await salesforceService.check()
      set({ salesforceCheck: { state: 'ok', summary, message: '', at: new Date().toISOString() } })
      await get().loadDeals()
    } catch (error) {
      set({ salesforceCheck: { ...before, state: 'error', message: error.message, at: new Date().toISOString() } })
    }
  },

  /** First load, once per store — a store re-created by hot reload loads again. */
  ensureLoaded: () => {
    if (!get().initialLoad) set({ initialLoad: get().loadDeals() })
    return get().initialLoad
  },

  loadDeals: async () => {
    try {
      const data = await dealService.list()
      set({ deals: data.map(migrateTimelineStructure), loading: false })
    } catch (error) {
      console.error('Error loading deals:', error)
      set({ appNotice: `Failed to load deals: ${error.message}`, loading: false })
    }
  },

  patchDeal: (updatedDeal) => {
    if (!updatedDeal?.id) return
    set((state) => ({
      deals: state.deals.map((d) =>
        String(d.id) === String(updatedDeal.id)
          ? migrateTimelineStructure(updatedDeal)
          : d
      ),
    }))
  },

  setAppNotice: (appNotice) => set({ appNotice }),

  setSyncStatus: (state, message = '') =>
    set({ syncStatus: { state, at: new Date().toISOString(), message } }),
}))

export default useDealStore
