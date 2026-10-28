/**
 * Client logos: the backend looks them up once (Wikidata, then the client's website icon),
 * caches them on this computer and serves them from localhost. Tiles show sure or approved
 * logos. Every failure here just means no logo.
 */
import { create } from 'zustand'
import { buildUrl, get, post } from '../../shared/apiClient'

/** Same key the backend uses: lower-case, single-spaced client name. */
export const clientKey = (name) => String(name ?? '').toLowerCase().split(/\s+/).filter(Boolean).join(' ')

export const logoSrc = (logo) => (logo?.url ? buildUrl(logo.url) : null)

const useClientLogoStore = create((set, getState) => ({
  logos: {},
  hidden: [],
  running: false,
  pending: 0,

  load: async () => {
    try {
      const next = await get('/api/client-logos')
      set({ logos: next.logos || {}, hidden: next.hidden || [], running: Boolean(next.running), pending: next.pending || 0 })
    } catch {
      // No logos is a fine state; the tiles show the client name either way.
    }
  },

  /** Look up clients never checked, then refresh. */
  resolve: async () => {
    try {
      await post('/api/client-logos/resolve', {})
    } catch {
      // Same as above: logos are optional.
    }
    await getState().load()
  },

  /** { client_name, action: 'hide' | 'show' | 'website', website? } */
  override: async (payload) => {
    const result = await post('/api/client-logos/override', payload)
    await getState().load()
    return result
  },
}))

export default useClientLogoStore
