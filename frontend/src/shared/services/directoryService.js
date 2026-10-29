/** Quick contacts: the people directory and the SRR/PRR review forms (global reference data, not per deal). */
import { del, get, post, put } from '../apiClient'

export const directoryService = {
  quickContacts: () => get('/api/quick-contacts'),
  people: () => get('/api/contacts'),
  addPerson: (person) => post('/api/contacts', person),
  updatePerson: (id, changes) => put(`/api/contacts/${encodeURIComponent(id)}`, changes),
  removePerson: (id) => del(`/api/contacts/${encodeURIComponent(id)}`),
  saveReviewForm: (form) => put('/api/review-forms', form),
}
