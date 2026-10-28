/** noticeService — the TT Execs' notices for the team (the banner at the top of s0L). */
import { del, get, post } from '../apiClient'

export const noticeService = {
  list:   ()     => get('/api/notices'),
  post:   (text) => post('/api/notices', { text }),
  remove: (id)   => del(`/api/notices/${encodeURIComponent(id)}`),
}
