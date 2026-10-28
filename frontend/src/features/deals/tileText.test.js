import { describe, expect, it } from 'vitest'
import { descriptionParts } from './tileText'

describe('descriptionParts', () => {
  it('drops the client name when the description repeats it', () => {
    expect(descriptionParts('USAA RISE MSP', 'USAA')).toEqual(['RISE MSP'])
    expect(descriptionParts('Xcel Energy - SAP S/Forward - Next Phase', 'Xcel Energy')).toEqual(['SAP S/Forward', 'Next Phase'])
    expect(descriptionParts('mckesson BU EFPR init 28', 'McKesson')).toEqual(['BU EFPR init 28'])
  })

  it('only drops a whole-word repeat', () => {
    expect(descriptionParts('Intelligent Automation', 'Intel')).toEqual(['Intelligent Automation'])
  })

  it('splits at dashes and bars, never inside a name', () => {
    expect(descriptionParts('NEE/FPL - ITECA - SAP AI Units', 'FLORIDA POWER & LIGHT CO')).toEqual(['NEE/FPL', 'ITECA', 'SAP AI Units'])
    expect(descriptionParts('SAP S/4HANA Implementation', 'Bio-Rad')).toEqual(['SAP S/4HANA Implementation'])
    expect(descriptionParts('Post-merger ERP | Phase 2', 'Contoso')).toEqual(['Post-merger ERP', 'Phase 2'])
  })

  it('is empty when there is nothing besides the client name', () => {
    expect(descriptionParts('USAA', 'USAA')).toEqual([])
    expect(descriptionParts(null, 'USAA')).toEqual([])
  })
})
