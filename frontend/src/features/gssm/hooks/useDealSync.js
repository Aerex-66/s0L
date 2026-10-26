/**
 * useDealSync.js — GSSM ↔ deal sync for the s0L shell.
 *
 * GSSM → Deal: after workbook load or edit, extracts the GSSM-owned fields
 *               and writes them through PUT /api/deals/:id/gssm-sync, the only
 *               route allowed to write them. Every sync also records which
 *               workbook the deal is linked to (gssm_workbook_id).
 * Deal → GSSM: on workbook load, a Home-drawn timeline seeds empty Imp TL cells.
 *
 * This hook is INTERNAL to the GSSM module. It imports from shared/ only.
 */
import { useCallback, useEffect, useRef } from 'react'
import { dealService } from '../../../shared/services/dealService'
import useDealStore from '../../../shared/dealStore'
import { extractAllFromWorkbook, mapDealToGssmEdits } from '../../../shared/utils/gssmBridge'

const DATA_KEYS = ['timelines', 'financials', 'staffing', 'bid_metrics', 'gssm_ricefw']

function buildPayload(rowDataBySheet, workbookId) {
  const payload = extractAllFromWorkbook(rowDataBySheet)
  if (!DATA_KEYS.some((key) => key in payload)) return null
  if (workbookId) payload.gssm_workbook_id = workbookId
  return payload
}

// Timestamps change on every extraction; compare content only.
const contentHash = (payload) =>
  JSON.stringify(payload, (key, value) => (key === 'synced_at' || key === 'gssm_synced_at' ? undefined : value))

/**
 * @param {object} params
 * @param {object}   params.deal              — Active s0L deal (from GssmModule props)
 * @param {object}   params.workbookDataRef   — Ref to GSSM workbook data
 * @param {object}   params.workbookRef       — Ref to the import/reimport result ({ workbookId, ... })
 * @param {number}   params.metricsVersion    — Bumped on every edit (sync trigger)
 * @param {Function} params.handleCellEdit    — GssmModule's cell edit handler
 * @param {Function} params.onDealUpdated     — Called after deal is updated (e.g. onUpdate prop)
 */
export function useDealSync({ deal, workbookDataRef, workbookRef, metricsVersion, handleCellEdit, onDealUpdated }) {
  const lastSyncHashRef = useRef(null)
  const debounceRef = useRef(null)
  const initialSeedDoneRef = useRef(false)

  /* ── GSSM → Deal: extract and push ── */
  const syncToDeal = useCallback(async () => {
    const dealId = deal?.id
    if (!dealId) return

    const wd = workbookDataRef.current
    if (!wd?.rowDataBySheet) return

    try {
      const payload = buildPayload(wd.rowDataBySheet, workbookRef.current?.workbookId)
      if (!payload) return

      const hash = contentHash(payload)
      if (hash === lastSyncHashRef.current) return
      lastSyncHashRef.current = hash

      useDealStore.getState().setSyncStatus('syncing')
      const updated = await dealService.syncFromGssm(dealId, payload)
      // Merge the server response into the shared deal cache so Home,
      // iSBD, and Metrics reflect the GSSM edit immediately.
      useDealStore.getState().patchDeal(updated)
      useDealStore.getState().setSyncStatus('ok')
      onDealUpdated?.()
    } catch (err) {
      console.error('[useDealSync] sync to deal failed:', err)
      // Allow retry on next edit and surface the failure to the UI.
      lastSyncHashRef.current = null
      useDealStore.getState().setSyncStatus('error', err?.message || 'Sync failed')
    }
  }, [deal?.id, workbookDataRef, workbookRef, onDealUpdated])

  /* ── Debounced sync on edit (metricsVersion changes) ── */
  useEffect(() => {
    if (!deal?.id || !workbookDataRef.current) return
    // Don't sync on initial mount; only after first explicit trigger
    if (metricsVersion === 0) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(syncToDeal, 2000)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [metricsVersion, syncToDeal, deal?.id, workbookDataRef])

  /* ── Flush pending sync on tab close ── */
  useEffect(() => {
    const handleUnload = () => {
      if (!debounceRef.current || !deal?.id) return
      clearTimeout(debounceRef.current)
      debounceRef.current = null
      // Best-effort: fire sync via keepalive fetch
      try {
        const wd = workbookDataRef.current
        if (!wd?.rowDataBySheet) return
        const payload = buildPayload(wd.rowDataBySheet, workbookRef.current?.workbookId)
        if (!payload) return
        fetch(`/api/deals/${deal.id}/gssm-sync`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        })
      } catch { /* best effort */ }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [deal?.id, workbookDataRef, workbookRef])

  /* ── Deal → GSSM: seed empty Imp TL cells from a Home-drawn timeline on load ── */
  const seedFromDeal = useCallback(() => {
    if (!deal || initialSeedDoneRef.current) return
    const wd = workbookDataRef.current
    if (!wd?.rowDataBySheet) return

    const edits = mapDealToGssmEdits(deal)
    if (edits.length === 0) return

    // Only apply if target GSSM cell is currently empty
    const cellEdits = []
    for (const edit of edits) {
      const sheetData = wd.rowDataBySheet[edit.sheet]
      if (!sheetData) continue
      const currentVal = sheetData[edit.row]?.[`c${edit.col}`]
      if (currentVal == null || currentVal === '') {
        cellEdits.push({
          rowIndex: edit.row,
          colIndex: edit.col,
          value: edit.value,
          sheetName: edit.sheet,
        })
      }
    }

    if (cellEdits.length > 0 && handleCellEdit) {
      handleCellEdit(cellEdits)
    }
    initialSeedDoneRef.current = true
  }, [deal, workbookDataRef, handleCellEdit])

  /* ── Called after workbook load completes ── */
  const syncOnLoad = useCallback(() => {
    initialSeedDoneRef.current = false
    // Seed deal → GSSM first (empty cells only)
    setTimeout(() => {
      seedFromDeal()
      // Then sync GSSM → deal
      setTimeout(syncToDeal, 500)
    }, 300)
  }, [seedFromDeal, syncToDeal])

  return { syncToDeal, syncOnLoad }
}
