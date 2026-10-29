/**
 * updateStore — s0L's own update (packaged app only), shared by the update prompt, the header's
 * Settings icon and the Settings panel. The backend checks monday and downloads; the launcher installs.
 */
import { create } from 'zustand'
import { updateService } from './services/updateService'

export const LATER_KEY = 's0l-update-later'
const RESTART_POLL_MS = 2000
const RESTART_POLLS = 90 // three minutes

/** The version waiting to be installed; only the packaged app has one. */
export const readyUpdate = (status) => (status?.enabled && status.ready) || null

function savedLater() {
  try {
    return sessionStorage.getItem(LATER_KEY)
  } catch {
    return null
  }
}

const useUpdateStore = create((set, get) => ({
  status: null,
  later: savedLater(),
  restarting: null,
  slow: false,

  refresh: async () => {
    try {
      const status = await updateService.status()
      set({ status })
      return status
    } catch {
      return null
    }
  },

  /** Later: the prompt stops asking about this version this session; Settings still shows it. */
  putOff: (version) => {
    try { sessionStorage.setItem(LATER_KEY, version) } catch { /* private mode: just don't remember */ }
    set({ later: version })
  },

  /** Install the ready update: the launcher restarts s0L, and the page reloads once it answers again. */
  restartNow: async () => {
    const { status, restarting } = get()
    const target = readyUpdate(status)
    if (!target || restarting) return
    try {
      await updateService.restart()
    } catch {
      get().refresh()
      return
    }
    set({ restarting: target, slow: false })
    let polls = 0
    let wentDown = false
    const timer = setInterval(async () => {
      polls += 1
      try {
        const next = await updateService.status()
        // The new version answering, or the old one back after a rollback (the launcher says why).
        if (next?.version === target || (wentDown && next?.version === status.version)) {
          clearInterval(timer)
          window.location.reload()
          return
        }
      } catch {
        wentDown = true
      }
      if (polls >= RESTART_POLLS) {
        clearInterval(timer)
        set({ slow: true })
      }
    }, RESTART_POLL_MS)
  },
}))

export default useUpdateStore
