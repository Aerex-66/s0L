import { describe, expect, it } from 'vitest'
import { dealSectors, describeRole, describeRoles, formFor, howLabel, peopleWith } from './directory'

describe('Quick contacts vocabulary', () => {
  it('names each role the way the panel shows it', () => {
    expect(describeRole({ kind: 'deal_team', title: 'Lead client partner' })).toBe('Lead client partner')
    expect(describeRole({ kind: 'deal_team', title: 'PAL (functional SME)', area: 'OTC' })).toBe('PAL (functional SME) · OTC')
    expect(describeRole({ kind: 'deal_team' })).toBe('Deal Team')
    expect(describeRole({ kind: 'sal', area: 'RTR' })).toBe('RTR SAL')
    expect(describeRole({ kind: 'sldl' })).toBe('SLDL')
    expect(describeRole({ kind: 'srr', sector: 'Distribution' })).toBe('Distribution SRR')
    expect(describeRoles({ roles: [{ kind: 'sal', area: 'Data' }, { kind: 'prr', sector: 'FSS' }] })).toBe('Data SAL · FSS PRR')
  })

  it('splits a deal with several sectors', () => {
    expect(dealSectors({ sector: 'Distribution, Canada' })).toEqual(['Distribution', 'Canada'])
    expect(dealSectors({ sector: '' })).toEqual([])
    expect(dealSectors({})).toEqual([])
  })

  it('finds a sector form without minding case, and says when nothing is recorded', () => {
    const forms = { srr: { 'Com-Ind': { how: 'form', url: 'https://x.ibm.com' } }, prr: {} }
    expect(formFor(forms, 'srr', 'com-ind')).toEqual({ how: 'form', url: 'https://x.ibm.com' })
    expect(formFor(forms, 'prr', 'Com-Ind')).toBeNull()
    expect(howLabel('word')).toBe('Word document')
    expect(howLabel(undefined)).toBe('Not known yet')
  })

  it('lists the people who hold a role', () => {
    const people = [
      { name: 'Ana', roles: [{ kind: 'srr', sector: 'Public' }] },
      { name: 'Bo', roles: [{ kind: 'srr', sector: 'FSS' }, { kind: 'sal', area: 'RTR' }] },
    ]
    expect(peopleWith(people, 'srr').map((p) => p.name)).toEqual(['Ana', 'Bo'])
    expect(peopleWith(people, 'srr', (role) => role.sector === 'FSS').map((p) => p.name)).toEqual(['Bo'])
  })
})
