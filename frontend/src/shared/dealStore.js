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
import { migrateTimelineStructure } from './utils/migrateTimelines'

const useDealStore = create((set, get) => ({
  deals: [],
  loading: true,
  appNotice: '',
  initialLoad: null,

  // GSSM → deal sync health: 'idle' | 'syncing' | 'ok' | 'error'
  syncStatus: { state: 'idle', at: null, message: '' },

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
