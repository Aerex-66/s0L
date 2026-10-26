/**
 * Engine routes — workbook catalog, import/reimport, persisted edits,
 * and the workbook-formulas payload builder.
 */
import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import crypto from 'crypto'

import { parseWorkbookMetadata } from '../engine/workbookParser.js'
import { getMetadataSession } from '../engine/metadataLoader.js'
import {
  ENGINE_IMPORT_ROOT,
  readManifest,
  writeManifest,
  setLatestWorkbook,
  getLatestWorkbook,
  parseWorkbookId,
  workbookFormulasCache,
  formulasCacheSet,
} from '../lib/workbookContext.js'
import { normalizeIncomingEdits } from '../lib/edits.js'
import { expandValidationRanges } from '../lib/validations.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
})

export function createEngineRouter({ store, resolveWorkbookContext }) {
  const router = express.Router()

  router.get('/api/engine/workbooks', (_req, res) => {
    try {
      const rows = store.listWorkbooks()
      return res.json({ workbooks: rows })
    } catch (err) {
      console.error('[workbooks] list error:', err)
      return res.status(500).json({ error: 'Failed to list workbooks.' })
    }
  })

  router.patch('/api/engine/workbooks/:id', (req, res) => {
    const id = Number(req.params.id)
    const { opportunityNumber } = req.body || {}
    if (!id || !Number.isInteger(id)) return res.status(400).json({ error: 'Invalid workbook id.' })
    try {
      store.updateOpportunityNumber(id, String(opportunityNumber || '').trim() || null)
      return res.json({ ok: true })
    } catch (err) {
      console.error('[workbooks] update error:', err)
      return res.status(500).json({ error: 'Failed to update workbook.' })
    }
  })

  // Re-open a previously imported workbook from the catalog (no file upload needed)
  router.post('/api/engine/reimport', async (req, res) => {
    const { workbookId } = req.body || {}
    const id = Number(workbookId)
    if (!id || !Number.isInteger(id)) return res.status(400).json({ error: 'Invalid workbook id.' })
    try {
      const record = store.getWorkbookById(id)
      if (!record) return res.status(404).json({ error: 'Workbook not found.' })
      const metadataDir = record.metadataDir
      const metaPath = path.join(metadataDir, 'workbook.json')
      if (!fsSync.existsSync(metaPath)) {
        return res.status(410).json({ error: 'Cached metadata no longer exists. Please re-import the file.' })
      }
      const metaRaw = await fs.readFile(metaPath, 'utf8')
      const workbookMeta = JSON.parse(metaRaw)

      setLatestWorkbook({ metadataDir, sourcePath: record.sourcePath, workbookId: id })

      // Clear stale response cache for this metadata dir
      workbookFormulasCache.delete(metadataDir)

      return res.json({
        workbookId: id,
        metadataDir,
        sheetNames: workbookMeta.sheetNames || [],
      })
    } catch (err) {
      console.error('[reimport] error:', err)
      return res.status(500).json({ error: 'Failed to reopen workbook.' })
    }
  })

  router.post('/api/engine/import', upload.single('file'), async (req, res) => {
    const t0 = Date.now()
    console.log('[import] ▶ received', req.file?.originalname, `(${((req.file?.size || 0) / 1024 / 1024).toFixed(1)} MB)`)
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' })
    }

    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex').slice(0, 16)
    const importDir = path.join(ENGINE_IMPORT_ROOT, `import-${fileHash}`)
    const sourceDir = path.join(importDir, 'source')
    const metadataDir = path.join(importDir, 'metadata')
    const fileName = req.file.originalname || 'workbook.xlsm'
    const sourcePath = path.join(sourceDir, fileName)
    const workbookMetaPath = path.join(metadataDir, 'workbook.json')
    const manifestKey = fileName.toLowerCase()

    try {
      await fs.mkdir(importDir, { recursive: true })
      let cacheHit = false
      let workbookMeta = null

      const manifest = await readManifest()

      if (fsSync.existsSync(workbookMetaPath)) {
        cacheHit = true
        console.log('[import]   cache hit — reading workbook.json')
        const metaRaw = await fs.readFile(workbookMetaPath, 'utf8')
        workbookMeta = JSON.parse(metaRaw)
        if (!fsSync.existsSync(sourcePath)) {
          await fs.mkdir(sourceDir, { recursive: true })
          await fs.writeFile(sourcePath, req.file.buffer)
        }
      } else {
        console.log('[import]   cache miss — parsing workbook from scratch')
        await fs.mkdir(sourceDir, { recursive: true })
        await fs.writeFile(sourcePath, req.file.buffer)
        const tParse = Date.now()
        workbookMeta = await parseWorkbookMetadata(sourcePath, importDir)
        console.log('[import]   parseWorkbookMetadata took', Date.now() - tParse, 'ms')
        // Pre-warm metadata session cache so workbook-formulas doesn't re-read from disk
        getMetadataSession(metadataDir).catch(() => {})
      }

      if (workbookMeta?.sheetNames?.length) {
        const currentSheets = workbookMeta.sheetNames
        manifest.workbooks[manifestKey] = {
          sheetNames: currentSheets,
          lastHash: fileHash,
          lastImportedAt: new Date().toISOString(),
        }
        await writeManifest(manifest)
      }

      const workbookId = store.upsertWorkbook({
        name: fileName,
        sourcePath,
        metadataDir,
        hash: fileHash,
      })
      setLatestWorkbook({ metadataDir, sourcePath, workbookId })

      // Clear stale response cache for this metadata dir
      workbookFormulasCache.delete(metadataDir)

      console.log('[import] ◀ responding in', Date.now() - t0, 'ms  (cacheHit:', cacheHit, ')')
      return res.json({
        workbookId,
        metadataDir,
        sheetNames: workbookMeta.sheetNames || [],
      })
    } catch (error) {
      console.error(error)
      return res.status(500).json({ error: 'Failed to import workbook metadata.' })
    }
  })

  router.post('/api/engine/edits', async (req, res) => {
    const { workbookId, updates } = req.body || {}
    const activeWorkbookId = parseWorkbookId(workbookId) || getLatestWorkbook().workbookId
    if (!activeWorkbookId) {
      return res.status(400).json({ error: 'No workbookId. Import a workbook first.' })
    }

    const workbookRecord = store.getWorkbookById(activeWorkbookId)
    if (!workbookRecord?.metadataDir) {
      return res.status(400).json({ error: 'Unknown workbookId.' })
    }

    let session = null
    try {
      session = await getMetadataSession(workbookRecord.metadataDir)
    } catch {
      session = null
    }

    const incomingEdits = Array.isArray(updates) ? updates : []
    const normalized = normalizeIncomingEdits({ updates: incomingEdits, session: session || null })
    if (normalized.validEdits.length > 0) {
      store.upsertEdits(activeWorkbookId, normalized.validEdits)
    }

    return res.json({
      workbookId: activeWorkbookId,
      saved: normalized.validEdits.length,
      rejectedCount: normalized.rejected.length,
      warningCount: normalized.warnings.length,
      rejectedSample: normalized.rejected.slice(0, 100),
    })
  })

  router.get('/api/engine/edits', (req, res) => {
    const requestedWorkbookId = parseWorkbookId(req.query?.workbookId)
    const activeWorkbookId = requestedWorkbookId || getLatestWorkbook().workbookId
    if (!activeWorkbookId) {
      return res.json({ edits: [] })
    }
    return res.json({ workbookId: activeWorkbookId, edits: store.getEdits(activeWorkbookId) })
  })

  router.post('/api/engine/workbook-formulas', async (req, res) => {
    const t0 = Date.now()
    console.log('[workbook-formulas] ▶ request received')
    const { metadataDir, workbookId } = req.body || {}
    const context = resolveWorkbookContext({ workbookId, metadataDir })
    if (!context?.metadataDir) {
      return res.status(400).json({ error: 'No workbook context. Import a workbook first.' })
    }

    try {
      // Return cached JSON string if available (metadata is immutable after import)
      if (workbookFormulasCache.has(context.metadataDir)) {
        console.log('[workbook-formulas] ◀ serving from cache in', Date.now() - t0, 'ms')
        res.setHeader('Content-Type', 'application/json')
        return res.send(workbookFormulasCache.get(context.metadataDir))
      }

      const tSession = Date.now()
      const session = await getMetadataSession(context.metadataDir)
      console.log('[workbook-formulas]   getMetadataSession took', Date.now() - tSession, 'ms')
      const { workbookMeta, sheetMetaMap } = session

      const formulasBySheet = {}
      const rowDataBySheet = {}
      const validationsBySheet = {}
      const dimensionsBySheet = {}

      for (const [sheetName, sheetMeta] of sheetMetaMap) {
        // Use pre-built data from NDJSON parser when available (single-pass, no re-iteration)
        if (sheetMeta._sparseRows) {
          rowDataBySheet[sheetName] = sheetMeta._sparseRows
          dimensionsBySheet[sheetName] = { startRow: 0, endRow: sheetMeta._maxRow, startCol: 0, endCol: sheetMeta._maxCol }
          if (sheetMeta._formulas && sheetMeta._formulas.length > 0) {
            formulasBySheet[sheetName] = sheetMeta._formulas
          }
        } else {
          // Fallback for legacy JSON sheets
          const cells = sheetMeta?.cells || []
          const formulas = []
          const sparseRows = []
          let maxRow = 0
          let maxCol = 0

          for (const cell of cells) {
            if (cell?.row == null || cell?.col == null) continue
            const rowIdx = cell.row - 1
            const colIdx = cell.col - 1
            if (rowIdx > maxRow) maxRow = rowIdx
            if (colIdx > maxCol) maxCol = colIdx
            if (!sparseRows[rowIdx]) sparseRows[rowIdx] = {}
            sparseRows[rowIdx][`c${colIdx}`] = cell.value == null ? '' : String(cell.value)

            if (cell.formula) {
              formulas.push({
                sheet: sheetName,
                address: cell.address || '',
                row: cell.row,
                col: cell.col,
                formula: cell.formula,
              })
            }
          }

          if (formulas.length > 0) {
            formulasBySheet[sheetName] = formulas
          }
          rowDataBySheet[sheetName] = sparseRows
          dimensionsBySheet[sheetName] = { startRow: 0, endRow: maxRow, startCol: 0, endCol: maxCol }
        }

        const validationRanges = expandValidationRanges(sheetMeta, session)
        if (validationRanges.length > 0) {
          validationsBySheet[sheetName] = validationRanges
        }
      }

      const payload = {
        formulasBySheet,
        rowDataBySheet,
        validationsBySheet,
        dimensionsBySheet,
        definedNames: workbookMeta?.definedNames || [],
        sheetNames: workbookMeta?.sheetNames || [],
      }

      // Cache the serialized JSON so subsequent calls skip all computation + serialization
      const tStr = Date.now()
      const jsonString = JSON.stringify(payload)
      console.log('[workbook-formulas]   JSON.stringify took', Date.now() - tStr, 'ms  (' + (jsonString.length / 1024 / 1024).toFixed(1) + ' MB)')
      formulasCacheSet(context.metadataDir, jsonString)

      console.log('[workbook-formulas] ◀ total', Date.now() - t0, 'ms')
      res.setHeader('Content-Type', 'application/json')
      return res.send(jsonString)
    } catch (error) {
      console.error(error)
      return res.status(500).json({ error: 'Failed to build workbook formula metadata.' })
    }
  })

  /* ── Forex spot-rate endpoint (disabled: air-gapped architecture) ── */
  router.get('/api/forex/spot-rates', (_req, res) => {
    // External network calls are prohibited by architecture policy.
    // Forex rates should be managed via the Forex sheet in the GSSM workbook.
    return res.status(501).json({
      error: 'Spot rate fetching is disabled (air-gapped mode). Use the Forex sheet to set exchange rates manually.',
      rates: {},
    })
  })

  return router
}
