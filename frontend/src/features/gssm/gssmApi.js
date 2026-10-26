/**
 * GSSM API wrappers — adapted from engineApi.js with configurable base URL.
 * All calls go to the GSSM Express server (port 5175 by default).
 * Zero React dependencies.
 */

const GSSM_API_URL = import.meta.env.VITE_GSSM_API_URL || '/gssm-api'

function gssmUrl(path) {
  const base = GSSM_API_URL.replace(/\/$/, '')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalized}`
}

export const importWorkbook = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(gssmUrl('/api/engine/import'), {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'Import failed.')
  }
  return response.json()
}

export const persistEdits = async (workbookId, updates) => {
  if (!workbookId || !Array.isArray(updates) || updates.length === 0) return
  await fetch(gssmUrl('/api/engine/edits'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workbookId, updates }),
  })
}

export const fetchWorkbookData = async (metadataDir, workbookId) => {
  try {
    const response = await fetch(gssmUrl('/api/engine/workbook-formulas'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadataDir, workbookId }),
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

export const fetchCatalog = async () => {
  try {
    const response = await fetch(gssmUrl('/api/engine/workbooks'))
    if (!response.ok) return []
    const data = await response.json()
    return data.workbooks || []
  } catch {
    return []
  }
}

export const updateWorkbookOpportunity = async (workbookId, opportunityNumber) => {
  try {
    await fetch(gssmUrl(`/api/engine/workbooks/${encodeURIComponent(workbookId)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunityNumber }),
    })
  } catch { /* ignore */ }
}

export const reimportWorkbook = async (workbookId) => {
  const response = await fetch(gssmUrl('/api/engine/reimport'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workbookId }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to reopen workbook.')
  }
  return response.json()
}

export const exportWorkbook = async (workbookId, edits, cellFills, generatedSheets) => {
  const response = await fetch(gssmUrl('/api/spreadsheet/export'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workbookId, edits, cellFills, generatedSheets }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to save spreadsheet.')
  }
  return response.json()
}

export const cleanupExport = async (tempRoot) => {
  fetch(gssmUrl('/api/spreadsheet/export/cleanup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tempRoot }),
  }).catch(() => {})
}

export const fetchPersistedEdits = async (workbookId) => {
  try {
    const response = await fetch(gssmUrl(`/api/engine/edits?workbookId=${encodeURIComponent(workbookId)}`))
    if (!response.ok) return []
    const { edits } = await response.json()
    return edits || []
  } catch {
    return []
  }
}
