/** Quick contacts vocabulary, shared by the Outlook panel and Home: roles, how a review works, a deal's sectors. */

export const REVIEW_HOW = [
  { value: '', label: 'Not known yet' },
  { value: 'form', label: 'Online form' },
  { value: 'word', label: 'Word document' },
  { value: 'invite', label: 'Calendar invite' },
  { value: 'none', label: 'No review form' },
]

export const howLabel = (value) => (REVIEW_HOW.find((how) => how.value === (value || '')) || REVIEW_HOW[0]).label

export function describeRole(role) {
  switch (role?.kind) {
    case 'deal_team': return [role.title || 'Deal Team', role.area].filter(Boolean).join(' · ')
    case 'sal': return `${role.area} SAL`
    case 'sldl': return role.area ? `SLDL · ${role.area}` : 'SLDL'
    case 'srr': return `${role.sector} SRR`
    case 'prr': return `${role.sector} PRR`
    default: return ''
  }
}

export const describeRoles = (person) => (person?.roles || []).map(describeRole).filter(Boolean).join(' · ')

export const rolesOf = (person, kind) => (person?.roles || []).filter((role) => role.kind === kind)

export const sameText = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

/** People holding a role of this kind (and, when given, one that `match` accepts). */
export const peopleWith = (people, kind, match = () => true) =>
  (people || []).filter((person) => rolesOf(person, kind).some(match))

/** A deal's sectors: the board writes several as "Distribution, Canada". */
export const dealSectors = (deal) =>
  String(deal?.sector || '').split(',').map((sector) => sector.trim()).filter(Boolean)

/** A sector's stored SRR or PRR form, matched without minding case; null when nothing is recorded. */
export function formFor(forms, kind, sector) {
  const slots = forms?.[kind] || {}
  const key = Object.keys(slots).find((stored) => sameText(stored, sector))
  return key ? slots[key] : null
}
