import { del, get, post, put } from '../../shared/apiClient'

export const settingsService = {
  getDefaultApprovers:    ()         => get('/api/default-approvers'),
  updateDefaultApprovers: (payload)  => put('/api/default-approvers', payload),
  getDirectory:           ()         => get('/api/contacts'),
  addDirectoryContact:    (payload)  => post('/api/contacts', payload),
  updateDirectoryContact: (id, payload) => put(`/api/contacts/${id}`, payload),
  deleteDirectoryContact: (id)       => del(`/api/contacts/${id}`),
  // Legacy aliases
  getMasterContacts:      ()         => get('/api/contacts'),
  addMasterContact:       (payload)  => post('/api/contacts', payload),
  deleteMasterContact:    (id)       => del(`/api/contacts/${id}`),
  getResourceStructure:   ()         => get('/api/resource-structure'),
}
