/**
 * Spreadsheet routes — export via the Python ZIP patcher, temp-file
 * download, and export cleanup.
 */
import express from 'express'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import fsSync from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'

import { SERVER_ROOT, WORKSPACE_ROOT } from '../lib/workbookContext.js'
import { normalizeEditsShallow } from '../lib/edits.js'

const execFileAsync = promisify(execFile)

const runSpreadsheetSave = async ({ sourcePath, payload }) => {
  const extension = path.extname(sourcePath || '').toLowerCase()
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xlsm-'))
  const payloadPath = path.join(tempRoot, 'payload.json')
  const outputPath = path.join(tempRoot, `output${extension || '.xlsx'}`)

  try {
    await fs.writeFile(payloadPath, JSON.stringify(payload), 'utf-8')

    const defaultPythonPath = process.platform === 'win32'
      ? path.join(WORKSPACE_ROOT, '.venv', 'Scripts', 'python.exe')
      : path.join(WORKSPACE_ROOT, '.venv', 'bin', 'python')
    const resolvedDefaultPythonPath = fsSync.existsSync(defaultPythonPath) ? defaultPythonPath : 'python'
    const pythonPath = process.env.PYTHON_PATH || resolvedDefaultPythonPath
    const scriptPath = path.join(SERVER_ROOT, 'xlsm_update_zip.py')

    await execFileAsync(pythonPath, [scriptPath, sourcePath, payloadPath, outputPath], {
      timeout: 120000,
    })

    return { outputPath, extension, tempRoot }
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true })
    throw error
  }
}

export function createSpreadsheetRouter({ resolveWorkbookContext }) {
  const router = express.Router()

  const handleSpreadsheetExport = async (req, res) => {
    const { workbookId, edits: rawEdits, cellFills: rawFills, generatedSheets: rawGenSheets } = req.body || {}
    const context = resolveWorkbookContext({ workbookId })
    if (!context?.sourcePath) {
      return res.status(400).json({ error: 'No workbook imported. Open a workbook first.' })
    }

    if (!fsSync.existsSync(context.sourcePath)) {
      return res.status(400).json({ error: 'Source file no longer on disk. Re-import the workbook.' })
    }

    const shallow = normalizeEditsShallow(rawEdits || [])
    const cellFills = Array.isArray(rawFills) ? rawFills.filter(f =>
      f && typeof f.sheet === 'string' && Number.isInteger(f.row) && Number.isInteger(f.col) && typeof f.fill === 'string'
    ) : []
    // Pass generated sheets (from PivotMaker) to the Python patcher for injection
    const generatedSheets = Array.isArray(rawGenSheets) ? rawGenSheets.filter(s =>
      s && typeof s.name === 'string' && Array.isArray(s.grid)
    ) : []
    const payload = { edits: shallow.validEdits, cellFills, generatedSheets }

    let result
    try {
      result = await runSpreadsheetSave({ sourcePath: context.sourcePath, payload })
    } catch (error) {
      console.error(error)
      const detail = error?.stderr || error?.message || ''
      return res.status(500).json({
        error: 'Failed to save spreadsheet. Ensure Python and dependencies are installed.',
        detail: String(detail).slice(0, 2000),
      })
    }

    return res.json({
      outputPath: result.outputPath,
      tempRoot: result.tempRoot,
      rejectedCount: shallow.rejected.length,
    })
  }

  router.post('/api/spreadsheet/export', express.json({ limit: '50mb' }), handleSpreadsheetExport)

  router.get('/api/spreadsheet/download', async (req, res) => {
    const filePath = req.query.path
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'Missing path parameter' })
    }
    // Security: only allow serving files from OS temp xlsm- directories
    const normalized = path.resolve(filePath)
    const tmpDir = path.resolve(os.tmpdir())
    if (!normalized.startsWith(tmpDir + path.sep) || !path.basename(path.dirname(normalized)).startsWith('xlsm-')) {
      return res.status(403).json({ error: 'Invalid file path' })
    }
    try {
      await fs.access(normalized)
    } catch {
      return res.status(404).json({ error: 'File not found' })
    }
    const ext = path.extname(normalized).toLowerCase()
    const mimeTypes = {
      '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
    }
    const contentType = mimeTypes[ext] || 'application/octet-stream'
    const filename = path.basename(normalized)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    fsSync.createReadStream(normalized).pipe(res)
  })

  router.post('/api/spreadsheet/export/cleanup', express.json(), async (req, res) => {
    const { tempRoot } = req.body || {}
    if (tempRoot && typeof tempRoot === 'string') {
      const resolved = path.resolve(tempRoot)
      const tmpDir = path.resolve(os.tmpdir())
      if (resolved.startsWith(tmpDir + path.sep) && path.basename(resolved).startsWith('xlsm-')) {
        await fs.rm(resolved, { recursive: true, force: true }).catch(() => {})
      }
    }
    return res.json({ ok: true })
  })

  return router
}
