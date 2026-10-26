/**
 * dealService — canonical API client for deal CRUD and nested resources.
 *
 * Lives in shared/ because every module (Home, iSBD, GSSM, Documents,
 * Metrics, Deals) reads/writes deal data. Per the architecture rules,
 * cross-cutting logic goes through shared/ — features must not import
 * from each other.
 */
import { del, get, post, put, buildUrl } from '../apiClient'

export const dealService = {
  list:               ()                     => get('/api/deals'),
  create:             (payload)              => post('/api/deals', payload),
  getById:            (dealId)               => get(`/api/deals/${dealId}`),
  update:             (dealId, payload)      => put(`/api/deals/${dealId}`, payload),
  syncFromGssm:       (dealId, payload)      => put(`/api/deals/${dealId}/gssm-sync`, payload),
  remove:             (dealId)               => del(`/api/deals/${dealId}`),
  bulkCreate:         (payload)              => post('/api/deals/bulk', payload),
  updateTimeline:     (dealId, payload)      => put(`/api/deals/${dealId}/timeline`, payload),
  getFinancials:      (dealId)               => get(`/api/deals/${dealId}/financials`),
  updateFinancials:   (dealId, payload)      => put(`/api/deals/${dealId}/financials`, payload),
  getResources:       (dealId)               => get(`/api/deals/${dealId}/resources`),
  updateResources:    (dealId, payload)      => put(`/api/deals/${dealId}/resources`, payload),
  updateActivity:     (dealId, id, payload)  => put(`/api/deals/${dealId}/activities/${id}`, payload),
  addContact:         (dealId, payload)      => post(`/api/deals/${dealId}/contacts`, payload),
  removeContact:      (dealId, contactId)    => del(`/api/deals/${dealId}/contacts/${contactId}`),
  getIsbd:            (dealId)               => get(`/api/deals/${dealId}/isbd`),
  saveIsbd:           (dealId, payload)      => put(`/api/deals/${dealId}/isbd`, payload),

  exportIsbd: async (dealId, isbdData, filename = 'iSBD.pptx') => {
    const url = buildUrl('/api/documents/isbd/export')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId, isbd_data: isbdData }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Export failed (${res.status})`)
    }
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
  },
}
