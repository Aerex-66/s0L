import path from 'path';
import fs from 'fs/promises';
import { parseWorkbook } from './openxmlTool.js';

const safeName = (name) => name.replace(/[^a-z0-9_\-\(\) ]/gi, '_');

const buildUniqueSheetFileName = (sheetName, usedNames) => {
  const baseName = safeName(sheetName) || 'Sheet';
  let candidate = `${baseName}.ndjson`;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName}__${suffix}.ndjson`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
};

export const parseWorkbookMetadata = async (filePath, outputDir) => {
  const content = await fs.readFile(filePath);
  const parsed = await parseWorkbook(content);

  const metadataDir = path.join(outputDir, 'metadata');
  const sheetsDir = path.join(metadataDir, 'sheets');
  await fs.mkdir(sheetsDir, { recursive: true });

  const workbookMeta = {
    source: path.basename(filePath),
    createdAt: new Date().toISOString(),
    sheetNames: parsed.workbook.sheetNames,
    definedNames: parsed.workbook.definedNames,
    sheetFiles: [],
  };

  // Build NDJSON content for each sheet, then write all files in parallel
  const usedFileNames = new Set();
  const writeOps = [];
  for (const sheet of parsed.sheets) {
    const fileName = buildUniqueSheetFileName(sheet.name, usedFileNames);

    // NDJSON format: compact header line + one cell per line
    const hiddenRows = (sheet.rows || []).filter(r => r.hidden).map(r => r.index);
    const header = {
      name: sheet.name,
      id: sheet.id,
      state: sheet.state,
      dimensions: sheet.dimensions,
      dataValidations: sheet.dataValidations || [],
      hiddenRows,
      cols: sheet.cols || [],
      merges: sheet.merges || [],
      tableParts: sheet.tableParts || [],
      tables: sheet.tables || [],
    };

    const lines = [JSON.stringify(header)];
    for (const cell of sheet.cells || []) {
      const compact = { r: cell.row, c: cell.col };
      if (cell.value != null) compact.v = cell.value;
      if (cell.formula) compact.f = cell.formula;
      lines.push(JSON.stringify(compact));
    }

    writeOps.push(fs.writeFile(path.join(sheetsDir, fileName), lines.join('\n')));
    workbookMeta.sheetFiles.push({ name: sheet.name, fileName });
  }
  await Promise.all(writeOps);

  await fs.writeFile(
    path.join(metadataDir, 'workbook.json'),
    JSON.stringify(workbookMeta, null, 2)
  );

  return workbookMeta;
};
