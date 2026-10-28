/** The team notices, newest first: read by the header banner, posted from the TT Exec view. */
import { create } from 'zustand'
import { noticeService } from './services/noticeService'

const useNoticeStore = create((set, get) => ({
  notices: [],

  load: async () => {
    try {
      const { notices } = await noticeService.list()
      set({ notices: notices || [] })
    } catch {
      // No notices is a fine state; the banner just stays hidden.
    }
  },

  post: async (text) => {
    const notice = await noticeService.post(text)
    set({ notices: [notice, ...get().notices] })
  },

  remove: async (id) => {
    await noticeService.remove(id)
    set({ notices: get().notices.filter((notice) => notice.id !== id) })
  },
}))

export default useNoticeStore
