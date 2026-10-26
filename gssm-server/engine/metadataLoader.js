import fs from 'fs/promises';
import path from 'path';

const readWorkbookMeta = async (metadataDir) => {
  const content = await fs.readFile(path.join(metadataDir, 'workbook.json'), 'utf8');
  return JSON.parse(content);
};

const colNumberToLabel = (num) => {
  let n = num;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label || 'A';
};

const parseNdjsonSheet = (content) => {
  const lines = content.split('\n');
  if (lines.length === 0 || !lines[0]) throw new Error('Empty NDJSON sheet file');
  const header = JSON.parse(lines[0]);
  const cells = [];
  const sparseRows = [];
  const formulas = [];
  let maxRow = 0;
  let maxCol = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = JSON.parse(lines[i]);
    const row = c.r;
    const col = c.c;
    const value = c.v ?? null;
    const formula = c.f || null;
    const address = `${colNumberToLabel(col)}${row}`;

    cells.push({ row, col, value, formula, address });

    // Pre-build sparse row data for workbook-formulas endpoint
    const rowIdx = row - 1;
    const colIdx = col - 1;
    if (rowIdx > maxRow) maxRow = rowIdx;
    if (colIdx > maxCol) maxCol = colIdx;
    if (!sparseRows[rowIdx]) sparseRows[rowIdx] = {};
    sparseRows[rowIdx][`c${colIdx}`] = value == null ? '' : String(value);

    if (formula) {
      formulas.push({ sheet: header.name, address, row, col, formula });
    }
  }

  const rows = (header.hiddenRows || []).map(index => ({ index, hidden: true }));

  return {
    name: header.name,
    id: header.id,
    state: header.state,
    dimensions: header.dimensions,
    dataValidations: header.dataValidations || [],
    rows,
    cols: header.cols || [],
    merges: header.merges || [],
    tableParts: header.tableParts || [],
    tables: header.tables || [],
    cells,
    _sparseRows: sparseRows,
    _formulas: formulas,
    _maxRow: maxRow,
    _maxCol: maxCol,
  };
};

const readSheetMeta = async (metadataDir, sheetFile) => {
  const content = await fs.readFile(path.join(metadataDir, 'sheets', sheetFile), 'utf8');
  if (sheetFile.endsWith('.ndjson')) {
    return parseNdjsonSheet(content);
  }
  return JSON.parse(content);
};

const getSheetFiles = async (metadataDir) => {
  const sheetsDir = path.join(metadataDir, 'sheets');
  const entries = await fs.readdir(sheetsDir, { withFileTypes: true });
  const ndjsonSet = new Set();
  const jsonFiles = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.ndjson')) {
      ndjsonSet.add(entry.name);
    } else if (entry.name.endsWith('.json') && entry.name !== 'workbook.json') {
      jsonFiles.push(entry.name);
    }
  }

  // Prefer .ndjson; fall back to .json when no .ndjson counterpart exists
  const result = [...ndjsonSet];
  for (const jf of jsonFiles) {
    const base = jf.slice(0, -5);
    if (!ndjsonSet.has(`${base}.ndjson`)) {
      result.push(jf);
    }
  }
  return result;
};

const metadataCache = new Map();

/**
 * Lightweight metadata-only session — reads JSON files from disk,
 * builds sheetMetaMap and workbookMeta from NDJSON files on disk.
 * Used for sheet snapshots, edit validation, and save normalization.
 */
export const getMetadataSession = async (metadataDir) => {
  if (metadataCache.has(metadataDir)) {
    return metadataCache.get(metadataDir);
  }

  const workbookMeta = await readWorkbookMeta(metadataDir);
  const sheetFiles = await getSheetFiles(metadataDir);
  const sheetMetaMap = new Map();

  // Parallel I/O — read all sheet files concurrently
  const sheetMetas = await Promise.all(
    sheetFiles.map((sheetFile) => readSheetMeta(metadataDir, sheetFile))
  );
  for (const sheetMeta of sheetMetas) {
    sheetMetaMap.set(sheetMeta.name, sheetMeta);
  }

  const session = { workbookMeta, sheetMetaMap };
  metadataCache.set(metadataDir, session);
  return session;
};
