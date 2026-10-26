import { expect, it } from 'vitest'
import { splitLabelValue } from './labelValue'

it('treats the reference deck placeholder dash as an empty value', () => {
  expect(splitLabelValue('Opportunity Owner Name: \u2014')).toEqual({ label: 'Opportunity Owner Name', value: '' })
  expect(splitLabelValue('Client Name: Acme')).toEqual({ label: 'Client Name', value: 'Acme' })
})
