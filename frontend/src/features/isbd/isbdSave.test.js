import { describe, expect, it } from 'vitest'
import { canonicalizeSlideData, formatForDeck, mergeEditedSlides, splitIsbdSave } from './isbdSave'

describe('formatForDeck', () => {
  it('writes currency the way the deck shows it and leaves other values alone', () => {
    expect(formatForDeck({ price_to_win: '4980000', tcv: '14100000', client_name: 'Acme', swb_stage: '3' }))
      .toEqual({ price_to_win: '$5M', tcv: '$14.1M', client_name: 'Acme', swb_stage: '3' })
  })
})

describe('splitIsbdSave', () => {
  it('sends deal-owned edits to the deal, iSBD-only values to isbd_data, and drops GSSM/derived values', () => {
    const flat = { client_name: 'New', swb_stage: '3', tcv: '1', geo_market: 'x', Compliance: [{ item: 'DPA' }] }
    const edited = new Set(Object.keys(flat))
    expect(splitIsbdSave(flat, { client_name: 'Old' }, edited)).toEqual({
      dealUpdate: { client_name: 'New' },
      isbdData: { swb_stage: '3', Compliance: [{ item: 'DPA' }] },
    })
  })

  it('never writes values the user did not edit', () => {
    const flat = { price_to_win: '$5M', decision_date: '12/01/2026', financial_assumptions: 'GP%: 30%', swb_stage: '3' }
    const { dealUpdate, isbdData } = splitIsbdSave(flat, { price_to_win: '4980000' }, new Set(['swb_stage']))
    expect(dealUpdate).toEqual({})
    expect(isbdData).toEqual({ swb_stage: '3' })
  })

  it('stores an edited deal currency exactly as typed', () => {
    const { dealUpdate } = splitIsbdSave({ price_to_win: '4985250' }, { price_to_win: '5000000' }, new Set(['price_to_win']))
    expect(dealUpdate).toEqual({ price_to_win: '4985250' })
  })

  it('stores an edited deal date as ISO', () => {
    const { dealUpdate } = splitIsbdSave({ decision_date: '12/15/2026' }, { decision_date: '' }, new Set(['decision_date']))
    expect(dealUpdate).toEqual({ decision_date: '2026-12-15' })
  })
})

describe('mergeEditedSlides', () => {
  it('lets the latest edit win when a field appears on several slides', () => {
    const slides = [
      { data: { client_name: 'Acme' }, edited: [] },
      { data: { client_name: 'Acme Corp' }, edited: ['client_name'] },
    ]
    const { flat, edited } = mergeEditedSlides(slides)
    expect(flat.client_name).toBe('Acme Corp')
    expect(edited.has('client_name')).toBe(true)
  })
})

describe('canonicalizeSlideData', () => {
  it('restoreDraft maps legacy keys', () => {
    expect(canonicalizeSlideData({ bid_date: 'd', notes_context: 'n' })).toEqual({ bid_submission_date: 'd', notes_context: 'n' })
  })

  it('prefers a value already stored under the index key', () => {
    expect(canonicalizeSlideData({ bid_date: 'old', bid_submission_date: 'new' })).toEqual({ bid_submission_date: 'new' })
  })
})
