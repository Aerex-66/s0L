import { useState, useCallback, useMemo } from 'react'
import { get, del, postFormData, buildUrl } from '../../shared/apiClient'
import { useAsyncLoad } from '../../shared/useAsyncLoad'

/* ══════════════════════════════════════════════
   Required document definitions.
   Each slot has:
     id          — stable key used for matching
     label       — display name
     formatLabel — shown as badge text
     formatClass — CSS class for badge color
     keywords    — lowercase substrings used to auto-match uploaded filenames
     formats     — accepted file extensions (for matching, not enforcement)
   ══════════════════════════════════════════════ */
export const REQUIRED_DOCUMENTS = [
  {
    id: 'gfc-ida-approval',
    label: 'GFC-IDA Approval',
    formatLabel: 'Any',
    formatClass: 'any',
    keywords: ['gfc', 'ida', 'approval'],
    formats: [],
  },
  {
    id: 'gfc-ida-request',
    label: 'GFC-IDA Request Form',
    formatLabel: 'XLSX',
    formatClass: 'xlsx',
    keywords: ['gfc', 'ida', 'request'],
    formats: ['xlsx', 'xlsm'],
  },
  {
    id: 'cseg',
    label: 'CSEG File',
    formatLabel: 'Any',
    formatClass: 'any',
    keywords: ['cseg'],
    formats: [],
  },
  {
    id: 'srr-request',
    label: 'SRR Request Form',
    formatLabel: 'XLSX',
    formatClass: 'xlsx',
    keywords: ['srr', 'request'],
    formats: ['xlsx', 'xlsm'],
  },
  {
    id: 'srr-document',
    label: 'SRR Document',
    formatLabel: 'PPTX',
    formatClass: 'pptx',
    keywords: ['srr'],
    formats: ['pptx'],
  },
  {
    id: 'prr-memo',
    label: 'PRR Memo',
    formatLabel: 'Any',
    formatClass: 'any',
    keywords: ['prr', 'memo'],
    formats: [],
  },
  {
    id: 'prr-document',
    label: 'PRR Document',
    formatLabel: 'PPTX',
    formatClass: 'pptx',
    keywords: ['prr'],
    formats: ['pptx'],
  },
]

/**
 * Try to auto-match a document to a required slot based on:
 *   1) doc.module_id (set during upload if user chose a slot)
 *   2) filename keywords
 */
function matchDocToSlot(doc) {
  // Explicit slot assignment via module (set during upload)
  const mod = doc.module_id || doc.module
  if (mod) {
    const slot = REQUIRED_DOCUMENTS.find(r => r.id === mod)
    if (slot) return slot.id
  }

  const name = (doc.name || '').toLowerCase()
  const fmt = (doc.format || '').toLowerCase()

  // Keyword matching — more specific slots first (they appear first in the list)
  for (const slot of REQUIRED_DOCUMENTS) {
    // Every keyword must appear in the filename
    if (slot.keywords.length > 0 && slot.keywords.every(kw => name.includes(kw))) {
      // If the slot requires specific formats, the file must match
      if (slot.formats.length === 0 || slot.formats.includes(fmt)) {
        return slot.id
      }
    }
  }

  return null
}

/**
 * useDocuments — manages document library state for a deal.
 *
 * Exposes the raw document list, required-slot matching, search,
 * upload / download operations.
 *
 * @param {object} deal - current deal object
 * @returns {object} documents API
 */
export default function useDocuments(deal) {
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch documents from deal
  const { data: documents, loading, error, reload } = useAsyncLoad(
    async () => {
      if (!deal?.id) return []
      try {
        const freshDeal = await get(`/api/deals/${deal.id}`)
        return freshDeal?.documents || []
      } catch {
        return deal?.documents || []
      }
    },
    [deal?.id],
    deal?.documents || []
  )

  // ── Required-slot matching ─────────────────
  // Map slotId → best-matching document (most recent wins if multiple match)
  const requiredSlotMap = useMemo(() => {
    const map = {}
    // Sort by ingested_at desc so we prefer the latest upload
    const sorted = [...documents].sort(
      (a, b) => (b.ingested_at || '').localeCompare(a.ingested_at || '')
    )
    for (const doc of sorted) {
      const slotId = matchDocToSlot(doc)
      if (slotId && !map[slotId]) {
        map[slotId] = doc
      }
    }
    return map
  }, [documents])

  // ── Upload ─────────────────────────────────
  const uploadDocument = useCallback(async (file, slotId = '') => {
    if (!deal?.id || !file) throw new Error('Missing deal or file')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('deal_id', deal.id)
    if (slotId) formData.append('module_id', slotId)

    const isPptx = file.name.toLowerCase().endsWith('.pptx')
    const endpoint = isPptx
      ? '/api/documents/powerpoint/read'
      : '/api/documents/ingest'

    const result = await postFormData(endpoint, formData)
    await reload()
    return result
  }, [deal?.id, reload])

  // ── Download ───────────────────────────────
  const downloadDocument = useCallback((doc) => {
    if (!doc?.id) return
    const url = buildUrl(`/api/documents/download/${doc.id}`)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.name || 'document'
    a.click()
  }, [])
  // ── Delete (remove from app, not source) ──
  const deleteDocument = useCallback(async (doc) => {
    if (!doc?.id) return
    await del(`/api/documents/${doc.id}`)
    await reload()
  }, [reload])
  return {
    documents,
    loading,
    error,
    reload,

    searchQuery,
    setSearchQuery,

    requiredSlotMap,

    uploadDocument,
    downloadDocument,
    deleteDocument,
  }
}
