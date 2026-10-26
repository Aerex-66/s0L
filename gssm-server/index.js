/**
 * GSSM Express server — app wiring only.
 *
 * Structure:
 *   lib/workbookContext.js — paths, manifest, active-workbook state, caches
 *   lib/cellRefs.js        — A1 / range reference helpers
 *   lib/edits.js           — edit normalization + validation gating
 *   lib/validations.js     — data-validation range/list expansion
 *   routes/engine.js       — workbook catalog, import/reimport, edits, formulas
 *   routes/spreadsheet.js  — export via Python patcher, download, cleanup
 *   engine/                — XLSM parsers (workbookParser, metadataLoader, openxmlTool)
 *   storage.js             — SQLite store (workbooks + edits)
 */
import express from 'express'
import compression from 'compression'
import path from 'path'
import fsSync from 'fs'

import { createStore } from './storage.js'
import { WORKSPACE_ROOT, createWorkbookContextResolver } from './lib/workbookContext.js'
import { createEngineRouter } from './routes/engine.js'
import { createSpreadsheetRouter } from './routes/spreadsheet.js'

const app = express()

app.use(express.json({ limit: '5mb' }))
app.use(compression())

// Security: restrict to localhost only
app.use((req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || ''
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next()
  return res.status(403).json({ error: 'Forbidden: localhost only' })
})

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

const store = await createStore()
const resolveWorkbookContext = createWorkbookContextResolver(store)

app.use(createSpreadsheetRouter({ resolveWorkbookContext }))
app.use(createEngineRouter({ store, resolveWorkbookContext }))

// Serve built frontend in production (when vite-react/dist exists)
// In packaged Electron, dist is inside app.asar while server runs from app.asar.unpacked
let distPath = path.join(WORKSPACE_ROOT, 'vite-react', 'dist')
if (!fsSync.existsSync(distPath)) {
  distPath = distPath.replace('app.asar.unpacked', 'app.asar')
}
if (fsSync.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

const PORT = process.env.API_PORT || 5175
const HOST = process.env.API_HOST || '127.0.0.1'
const server = app.listen(PORT, HOST, () => {
  console.log(`Spreadsheet server listening on ${HOST}:${PORT}`)
})
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the existing process and retry.`)
    process.exit(1)
  }
  throw err
})
