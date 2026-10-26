import { describe, expect, it, vi } from 'vitest'

vi.mock('./services/dealService', () => ({
  dealService: { list: vi.fn(async () => [{ id: '1', timelines: [] }]) },
}))

describe('dealStore.ensureLoaded', () => {
  it('fetches deals once per store, however often it is asked', async () => {
    const { default: store } = await import('./dealStore')
    const { dealService } = await import('./services/dealService')
    await Promise.all([store.getState().ensureLoaded(), store.getState().ensureLoaded()])
    expect(dealService.list).toHaveBeenCalledTimes(1)
    expect(store.getState().loading).toBe(false)
    expect(store.getState().deals).toHaveLength(1)
  })

  it('a re-created store (hot reload) loads again instead of waiting forever', async () => {
    vi.resetModules()
    const { default: fresh } = await import('./dealStore')
    expect(fresh.getState().loading).toBe(true)
    await fresh.getState().ensureLoaded()
    expect(fresh.getState().loading).toBe(false)
  })
})
