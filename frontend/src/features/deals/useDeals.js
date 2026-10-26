import { useCallback, useEffect } from 'react'
import { dealService } from '../../shared/services/dealService'
import useDealStore from '../../shared/dealStore'

/**
 * useDeals — deal list + lifecycle actions, backed by the shared dealStore.
 * All modules now read from one cached copy of the deals; patchDeal /
 * loadDeals on the store propagate everywhere automatically.
 */
export function useDeals() {
  const deals = useDealStore((s) => s.deals)
  const loading = useDealStore((s) => s.loading)
  const appNotice = useDealStore((s) => s.appNotice)
  const loadDeals = useDealStore((s) => s.loadDeals)
  const setAppNotice = useDealStore((s) => s.setAppNotice)
  const ensureLoaded = useDealStore((s) => s.ensureLoaded)

  useEffect(() => { ensureLoaded() }, [ensureLoaded])

  const createDeal = useCallback(async (dealData, onSuccess) => {
    try {
      setAppNotice('')
      const newDeal = await dealService.create(dealData)
      await loadDeals()
      onSuccess?.(newDeal.id)
    } catch (error) {
      console.error('Error creating deal:', error)
      setAppNotice(`Unable to create deal: ${error.message}`)
    }
  }, [loadDeals, setAppNotice])

  const archiveDeal = useCallback(async (dealId) => {
    try {
      const updated = await dealService.update(dealId, { status: 'Archived' })
      useDealStore.getState().patchDeal(updated)
    } catch (error) {
      console.error('Error archiving deal:', error)
      setAppNotice(`Failed to archive deal: ${error.message}`)
    }
  }, [setAppNotice])

  const restoreDeal = useCallback(async (dealId) => {
    try {
      const updated = await dealService.update(dealId, { status: 'Active' })
      useDealStore.getState().patchDeal(updated)
    } catch (error) {
      console.error('Error restoring deal:', error)
      setAppNotice(`Failed to restore deal: ${error.message}`)
    }
  }, [setAppNotice])

  return { deals, loading, appNotice, loadDeals, createDeal, archiveDeal, restoreDeal }
}
