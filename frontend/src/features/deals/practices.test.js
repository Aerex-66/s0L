import { describe, expect, it } from 'vitest'
import { logoFor, practiceOf, vendorName, vendorOf } from './practices'

describe('practiceOf', () => {
  it('gives each board group its own emblem, short name and hue', () => {
    const sap = practiceOf('SAP')
    const oracle = practiceOf('Oracle')
    expect([sap.short, sap.color]).toEqual(['SAP', 'var(--practice-1)'])
    expect([oracle.short, oracle.color]).toEqual(['Oracle', 'var(--practice-2)'])
    expect(practiceOf('AMO and Supply Chain Transformation').short).toBe('AMO · SCT')
    expect(sap.Icon).not.toBe(oracle.Icon)
  })

  it('keeps an unknown group stable and named as the board has it', () => {
    expect(practiceOf('New Group').color).toBe(practiceOf('New Group').color)
    expect(practiceOf('New Group').short).toBe('New Group')
  })
})

describe('vendorOf', () => {
  it('maps a single-app practice to its app', () => {
    expect(vendorOf(practiceOf('SAP'), 'anything')).toBe('sap')
    expect(vendorOf(practiceOf('Oracle'), '')).toBe('oracle')
  })

  it('reads the app from the deal text in multi-app practices', () => {
    const crm = practiceOf('Salesforce, Adobe, ServiceNow')
    expect(vendorOf(crm, 'Service Cloud rollout')).toBe('salesforce')
    expect(vendorOf(crm, 'AEM migration')).toBe('adobe')
    expect(vendorOf(crm, 'ITSM refresh')).toBe('servicenow')
    expect(vendorOf(crm, 'Phase 2 support')).toBe(null)
    expect(vendorOf(practiceOf('Workday & SuccessFactors'), 'SuccessFactors EC')).toBe('successfactors')
  })

  it('has no app for AMO and unknown groups', () => {
    expect(vendorOf(practiceOf('AMO and Supply Chain Transformation'), 'SAP AMS')).toBe(null)
    expect(vendorOf(practiceOf('New Group'), 'Workday')).toBe(null)
  })

  it('finds the bundled SAP logo and names apps', () => {
    expect(logoFor('sap')).toEqual(expect.any(String))
    expect(logoFor(null)).toBe(null)
    expect(vendorName('servicenow')).toBe('ServiceNow')
  })
})
