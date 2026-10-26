import { describe, expect, it } from 'vitest'
import { REQUIRED_REFERENCE_FIELDS, REQUIRED_TEXT_FIELDS, isRequiredReferenceField, isRequiredTextField } from './referenceData'

describe('required deal fields come from the field index', () => {
  it('lists the required text fields', () => {
    expect(REQUIRED_TEXT_FIELDS).toEqual(['opportunity_number', 'client_name', 'project_name'])
  })

  it('lists the required setup selects', () => {
    expect([...REQUIRED_REFERENCE_FIELDS].sort()).toEqual(['implementation_type', 'industry', 'market', 'sector'])
  })

  it('answers per-field checks', () => {
    expect(isRequiredTextField('client_name')).toBe(true)
    expect(isRequiredReferenceField('market')).toBe(true)
    expect(isRequiredReferenceField('deal_type')).toBe(false)
  })
})
