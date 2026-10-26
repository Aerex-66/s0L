/**
 * Workbook context — server paths, import manifest, active-workbook
 * tracking, trusted-path resolution, and the workbook-formulas LRU cache.
 */
import path from 'path'
import fs from 'fs/promises'

const serverRoot = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')))

export const SERVER_ROOT = path.resolve(serverRoot, '..')
export const WORKSPACE_ROOT = path.resolve(SERVER_ROOT, '..')
export const ENGINE_IMPORT_ROOT = process.env.ENGINE_IMPORT_ROOT || path.join(SERVER_ROOT, 'engine-imports')

const resolvedEngineImportRoot = path.resolve(ENGINE_IMPORT_ROOT)
const engineManifestPath = path.join(ENGINE_IMPORT_ROOT, 'manifest.json')

/* ── Import manifest ── */

export const readManifest = async () => {
  try {
    const raw = await fs.readFile(engineManifestPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { workbooks: {} }
  }
}

export const writeManifest = async (manifest) => {
  await fs.mkdir(ENGINE_IMPORT_ROOT, { recursive: true })
  await fs.writeFile(engineManifestPath, JSON.stringify(manifest, null, 2))
}

/* ── Active workbook tracking (last imported/reopened) ── */

const latest = {
  metadataDir: null,
  sourcePath: null,
  workbookId: null,
}

export const setLatestWorkbook = ({ metadataDir, sourcePath, workbookId }) => {
  latest.metadataDir = metadataDir
  latest.sourcePath = sourcePath
  latest.workbookId = workbookId
}

export const getLatestWorkbook = () => ({ ...latest })

/* ── Path / id resolution ── */

export const isPathWithinRoot = (candidatePath, rootPath) => {
  const relative = path.relative(rootPath, candidatePath)
  if (relative === '') return true
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

export const resolveTrustedMetadataDir = (requestedMetadataDir) => {
  const candidate = requestedMetadataDir
    ? path.resolve(String(requestedMetadataDir))
    : latest.metadataDir
      ? path.resolve(latest.metadataDir)
      : null

  if (!candidate) return null
  if (!isPathWithinRoot(candidate, resolvedEngineImportRoot)) return null
  return candidate
}

export const parseWorkbookId = (value) => {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number.parseInt(String(value), 10)
  if (!Number.isInteger(numeric) || numeric <= 0) return null
  return numeric
}

export const createWorkbookContextResolver = (store) => ({ workbookId, metadataDir }) => {
  const requestedWorkbookId = parseWorkbookId(workbookId)
  const targetWorkbookId = requestedWorkbookId || latest.workbookId || null

  if (targetWorkbookId) {
    const record = store.getWorkbookById(targetWorkbookId)
    if (record) {
      return {
        workbookId: targetWorkbookId,
        metadataDir: record.metadataDir,
        sourcePath: record.sourcePath,
      }
    }
  }

  const targetDir = resolveTrustedMetadataDir(metadataDir)
  if (!targetDir) return null
  return {
    workbookId: targetWorkbookId,
    metadataDir: targetDir,
    sourcePath: latest.sourcePath,
  }
}

/* ── workbook-formulas response cache (LRU) ── */

export const workbookFormulasCache = new Map()
const FORMULAS_CACHE_MAX = 10

export function formulasCacheSet(key, value) {
  // LRU eviction: remove oldest entry when at capacity
  if (workbookFormulasCache.size >= FORMULAS_CACHE_MAX && !workbookFormulasCache.has(key)) {
    const oldest = workbookFormulasCache.keys().next().value
    workbookFormulasCache.delete(oldest)
  }
  workbookFormulasCache.set(key, value)
}
