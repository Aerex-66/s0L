import fs from 'fs/promises'
import path from 'path'
import process from 'node:process'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB_PATH = path.join(__dirname, '.gssm', 'store.sqlite')

const ensureDir = async (filePath) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

const initSchema = (db) => {
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS workbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_path TEXT NOT NULL,
      metadata_dir TEXT NOT NULL,
      hash TEXT,
      created_at TEXT NOT NULL
    )
  `)
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS workbooks_source_path_idx ON workbooks(source_path)')
  // Migration: add opportunity_number column if missing
  try {
    db.exec('ALTER TABLE workbooks ADD COLUMN opportunity_number TEXT')
  } catch { /* column already exists */ }
  db.exec(`
    CREATE TABLE IF NOT EXISTS edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workbook_id INTEGER NOT NULL,
      sheet TEXT NOT NULL,
      row INTEGER NOT NULL,
      col INTEGER NOT NULL,
      value TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (workbook_id, sheet, row, col)
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS edits_workbook_idx ON edits(workbook_id)')
}

const withTransaction = (db, fn) => {
  db.exec('BEGIN')
  try {
    fn()
    db.exec('COMMIT')
  } catch (err) {
    try { db.exec('ROLLBACK') } catch { /* ignore */ }
    throw err
  }
}

export const createStore = async (dbPath = DEFAULT_DB_PATH) => {
  await ensureDir(dbPath)
  const db = new Database(dbPath)
  initSchema(db)

  const upsertWorkbook = db.prepare(`
    INSERT INTO workbooks (name, source_path, metadata_dir, hash, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_path) DO UPDATE SET
      name = excluded.name,
      metadata_dir = excluded.metadata_dir,
      hash = excluded.hash
    RETURNING id
  `)

  const upsertEdit = db.prepare(`
    INSERT INTO edits (workbook_id, sheet, row, col, value, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(workbook_id, sheet, row, col) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `)

  const getEdits = db.prepare(`
    SELECT sheet, row, col, value
    FROM edits
    WHERE workbook_id = ?
  `)

  const getWorkbookById = db.prepare(`
    SELECT id, name, source_path as sourcePath, metadata_dir as metadataDir, hash
    FROM workbooks
    WHERE id = ?
  `)

  const listWorkbooks = db.prepare(`
    SELECT id, name, source_path as sourcePath, opportunity_number as opportunityNumber, created_at as createdAt
    FROM workbooks
    ORDER BY created_at DESC
  `)

  const updateOpportunityNumber = db.prepare(`
    UPDATE workbooks SET opportunity_number = ? WHERE id = ?
  `)

  return {
    upsertWorkbook: ({ name, sourcePath, metadataDir, hash }) => {
      const createdAt = new Date().toISOString()
      const result = upsertWorkbook.get(name, sourcePath, metadataDir, hash, createdAt)
      return result?.id
    },
    upsertEdits: (workbookId, edits = []) => {
      const updatedAt = new Date().toISOString()
      withTransaction(db, () => {
        edits.forEach((edit) => {
          upsertEdit.run(
            workbookId,
            edit.sheet,
            edit.row,
            edit.col,
            edit.value == null ? null : JSON.stringify(edit.value),
            updatedAt,
          )
        })
      })
    },
    getEdits: (workbookId) =>
      getEdits.all(workbookId).map((row) => ({
        sheet: row.sheet,
        row: row.row,
        col: row.col,
        value: row.value ? JSON.parse(row.value) : null,
      })),
    getWorkbookById: (workbookId) => getWorkbookById.get(workbookId) || null,
    listWorkbooks: () => listWorkbooks.all(),
    updateOpportunityNumber: (workbookId, oppNum) => updateOpportunityNumber.run(oppNum, workbookId),
  }
}
