import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
  numberParseOptions: {
    leadingZeros: false,
    hex: false,
    eNotation: false,
  },
});

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const splitDefinedNameRanges = (value) => {
  const text = String(value || '').trim();
  if (!text) return [];

  const parts = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'") {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }

    if (!inSingleQuote) {
      if (ch === '(') depth += 1;
      if (ch === ')' && depth > 0) depth -= 1;
      if (ch === ',' && depth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
        continue;
      }
    }

    current += ch;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
};

const columnToNumber = (col) =>
  col.toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);

const parseAddress = (address) => {
  const match = String(address).match(/([A-Z]+)(\d+)/i);
  if (!match) return { row: null, col: null };
  return { col: columnToNumber(match[1]), row: Number(match[2]) };
};

const resolveXmlSpaceValue = (value) => {
  if (value && typeof value === 'object' && value['xml:space'] === 'preserve') return ' ';
  return value;
};

const extractSharedStrings = async (zip) => {
  const entry = zip.file('xl/sharedStrings.xml');
  if (!entry) return [];
  const content = await entry.async('string');
  const xml = parser.parse(content);
  const items = toArray(xml.sst?.si);
  return items.map((si) => {
    const runs = toArray(si.r);
    if (runs.length) {
      return runs.map((r) => {
        const raw = r.t?.text ?? r.t ?? '';
        return resolveXmlSpaceValue(raw);
      }).join('');
    }
    const raw = si.t?.text ?? si.t ?? '';
    return resolveXmlSpaceValue(raw);
  });
};

const extractWorkbookInfo = async (zip) => {
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!workbookXml || !workbookRelsXml) {
    throw new Error('Invalid workbook structure.');
  }

  const workbook = parser.parse(workbookXml);
  const rels = parser.parse(workbookRelsXml);

  const sheets = toArray(workbook.workbook?.sheets?.sheet).map((sheet) => ({
    name: sheet.name,
    sheetId: sheet.sheetId,
    rId: sheet['r:id'] || sheet['rId'] || sheet.rId,
    state: sheet.state || 'visible',
  }));

  const relItems = toArray(rels.Relationships?.Relationship).map((rel) => ({
    id: rel.Id,
    target: rel.Target,
    type: rel.Type || null,
  }));

  const definedNames = toArray(workbook.workbook?.definedNames?.definedName).map((entry) => ({
    name: entry.name,
    localSheetId: entry.localSheetId ?? null,
    ranges: splitDefinedNameRanges(entry.text || ''),
  }));

  const sheetMap = sheets.map((sheet) => {
    const rel = relItems.find((item) => item.id === sheet.rId);
    return {
      ...sheet,
      target: rel?.target ? `xl/${rel.target.replace(/^\//, '')}` : null,
    };
  });

  return { sheets: sheetMap, definedNames, relItems };
};

const extractDataValidations = (worksheetXml) => {
  const dataValidations = worksheetXml.worksheet?.dataValidations?.dataValidation;
  const validations = toArray(dataValidations).map((entry) => ({
    type: entry.type || null,
    allowBlank: entry.allowBlank || null,
    showInputMessage: entry.showInputMessage || null,
    showErrorMessage: entry.showErrorMessage || null,
    sqref: entry.sqref || null,
    formula1: entry.formula1?.text ?? entry.formula1 ?? null,
    formula2: entry.formula2?.text ?? entry.formula2 ?? null,
  }));
  return validations;
};

const extractColumns = (worksheetXml) => {
  const cols = toArray(worksheetXml.worksheet?.cols?.col).map((col) => ({
    min: Number(col.min),
    max: Number(col.max),
    hidden: col.hidden === '1' || col.hidden === 1 || col.hidden === true,
    width: col.width ?? null,
  }));
  return cols;
};

const extractRows = (worksheetXml) => {
  const rows = toArray(worksheetXml.worksheet?.sheetData?.row).map((row) => ({
    index: Number(row.r),
    hidden: row.hidden === '1' || row.hidden === 1 || row.hidden === true,
  }));
  return rows;
};

const extractMergedCells = (worksheetXml) => {
  const merges = toArray(worksheetXml.worksheet?.mergeCells?.mergeCell).map((item) => item.ref).filter(Boolean);
  return merges;
};

const extractTableParts = (worksheetXml) => {
  const tableParts = toArray(worksheetXml.worksheet?.tableParts?.tablePart).map((part) => ({
    rId: part['r:id'] || part.rId || null,
  }));
  return tableParts;
};

const extractSheetRels = async (zip, sheetTarget) => {
  if (!sheetTarget) return [];
  const relPath = sheetTarget.replace('xl/worksheets/', 'xl/worksheets/_rels/') + '.rels';
  const relXml = await zip.file(relPath)?.async('string');
  if (!relXml) return [];
  const rels = parser.parse(relXml);
  return toArray(rels.Relationships?.Relationship).map((rel) => ({
    id: rel.Id,
    target: rel.Target,
    type: rel.Type || null,
  }));
};

const extractTables = async (zip, sheetRels, workbookRelItems) => {
  const tables = [];
  const rels = [...(sheetRels || []), ...(workbookRelItems || [])];

  for (const rel of rels) {
    if (!rel.type || !rel.type.includes('/table')) continue;
    const target = rel.target?.replace(/^\//, '') || '';
    const tablePath = target.startsWith('xl/') ? target : `xl/${target}`;
    const tableXml = await zip.file(tablePath)?.async('string');
    if (!tableXml) continue;
    const table = parser.parse(tableXml);
    const tableDef = table.table || {};
    tables.push({
      name: tableDef.name || null,
      displayName: tableDef.displayName || null,
      ref: tableDef.ref || null,
      totalsRowShown: tableDef.totalsRowShown ?? null,
      columns: toArray(tableDef.tableColumns?.tableColumn).map((col) => ({
        id: col.id,
        name: col.name,
      })),
    });
  }

  return tables;
};

const extractCells = (worksheetXml, sharedStrings) => {
  const extractFormulaText = (formulaNode) => {
    if (formulaNode == null) return null;
    if (typeof formulaNode === 'string') {
      const trimmed = formulaNode.trim();
      return trimmed || null;
    }
    if (typeof formulaNode === 'object') {
      const text = formulaNode.text ?? formulaNode['#text'] ?? null;
      if (typeof text === 'string') {
        const trimmed = text.trim();
        return trimmed || null;
      }
      if (typeof text === 'number' || typeof text === 'boolean') {
        return String(text);
      }
    }
    return null;
  };

  const rows = toArray(worksheetXml.worksheet?.sheetData?.row);
  const cells = [];

  rows.forEach((row) => {
    const rowIndex = Number(row.r);
    const rowCells = toArray(row.c);
    rowCells.forEach((cell) => {
      const address = cell.r;
      const { row: cellRow, col } = parseAddress(address);
      const cellType = cell.t || null;
      const formulaNode = cell.f || null;
      const formula = extractFormulaText(formulaNode);
      const sharedFormula = formulaNode && typeof formulaNode === 'object' && formulaNode.t === 'shared' ? {
        type: formulaNode.t || null,
        ref: formulaNode.ref || null,
        si: formulaNode.si ?? null,
      } : null;
      let value = cell.v?.text ?? cell.v ?? null;

      // Handle xml:space="preserve" objects from fast-xml-parser.
      value = resolveXmlSpaceValue(value);

      // Handle inlineStr cells: value is in <is><t>...</t></is>, not <v>.
      if (cellType === 'inlineStr' && value === null) {
        const isNode = cell.is;
        if (isNode) {
          const runs = toArray(isNode.r);
          if (runs.length) {
            value = runs.map((r) => r.t?.text ?? r.t ?? '').join('');
          } else {
            value = isNode.t?.text ?? isNode.t ?? null;
          }
        }
      }

      let resolved = value;

      if (cellType === 's' && value !== null) {
        const index = Number(value);
        resolved = sharedStrings[index] ?? null;
      }

      cells.push({
        address,
        row: cellRow || rowIndex,
        col,
        value: resolved,
        formula,
        sharedFormula,
      });
    });
  });

  return cells;
};

const shiftCellRef = (match, colAbs, colLetters, rowAbs, rowDigits, deltaCol, deltaRow) => {
  const toNumber = columnToNumber;
  const toLetters = (num) => {
    let n = num;
    let letters = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return letters;
  };

  const baseCol = toNumber(colLetters);
  const baseRow = Number(rowDigits);
  const nextCol = colAbs ? baseCol : baseCol + deltaCol;
  const nextRow = rowAbs ? baseRow : baseRow + deltaRow;

  return `${colAbs ? '$' : ''}${toLetters(nextCol)}${rowAbs ? '$' : ''}${nextRow}`;
};

const shiftFormula = (formula, deltaCol, deltaRow) => {
  if (!formula) return formula;
  return String(formula).replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, (match, colAbs, colLetters, rowAbs, rowDigits) =>
    shiftCellRef(match, colAbs, colLetters, rowAbs, rowDigits, deltaCol, deltaRow)
  );
};

const expandSharedFormulas = (cells) => {
  const sharedMap = new Map();
  cells.forEach((cell) => {
    if (cell.sharedFormula?.si != null && cell.formula) {
      sharedMap.set(cell.sharedFormula.si, {
        baseRow: cell.row,
        baseCol: cell.col,
        formula: cell.formula,
      });
    }
  });

  return cells.map((cell) => {
    if (cell.formula || cell.sharedFormula?.si == null) return cell;
    const shared = sharedMap.get(cell.sharedFormula.si);
    if (!shared) return cell;
    const deltaRow = cell.row - shared.baseRow;
    const deltaCol = cell.col - shared.baseCol;
    const shiftedFormula = shiftFormula(shared.formula, deltaCol, deltaRow);
    return { ...cell, formula: shiftedFormula };
  });
};

const extractDimensions = (worksheetXml) => {
  return worksheetXml.worksheet?.dimension || null;
};

const columnNumberToLetters = (num) => {
  let n = num;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

const parseRangeA1 = (range) => {
  const match = String(range).match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/i);
  if (!match) return null;
  return {
    startCol: columnToNumber(match[1]),
    startRow: Number(match[2]),
    endCol: columnToNumber(match[3]),
    endRow: Number(match[4]),
  };
};

const rangeToA1 = (range) => {
  if (!range) return null;
  return `${columnNumberToLetters(range.startCol)}${range.startRow}:${columnNumberToLetters(range.endCol)}${range.endRow}`;
};

const buildTableRegistry = (sheets) => {
  const registry = {};
  sheets.forEach((sheet) => {
    (sheet.tables || []).forEach((table) => {
      const range = parseRangeA1(table.ref);
      if (!range) return;
      const headerRow = range.startRow;
      const totalsRow = table.totalsRowShown === 1 || table.totalsRowShown === '1' ? range.endRow : null;
      const dataStartRow = headerRow + 1;
      const dataEndRow = totalsRow ? totalsRow - 1 : range.endRow;
      const columns = (table.columns || []).map((col, idx) => ({
        name: col.name,
        index: idx,
        col: range.startCol + idx,
      }));
      registry[table.name || table.displayName] = {
        sheet: sheet.name,
        ref: range,
        headerRow,
        dataStartRow,
        dataEndRow,
        totalsRow,
        columns,
      };
    });
  });
  return registry;
};

const resolveStructuredReference = (formula, tableRegistry) => {
  if (!formula || !tableRegistry) return formula;

  const replaceRef = (match, tableName, refBody) => {
    const table = tableRegistry[tableName];
    if (!table) return match;

    const colNameMatch = refBody.match(/\[(.*?)\]/g) || [];
    const tokens = colNameMatch.map((item) => item.replace(/[\[\]]/g, ''));

    const scopeToken = tokens.find((token) => token.startsWith('#')) || null;
    const columnToken = tokens.find((token) => !token.startsWith('#') && token !== '@') || null;

    const range = { ...table.ref };
    if (scopeToken === '#All') {
      // full range
    } else if (scopeToken === '#Headers') {
      range.startRow = table.headerRow;
      range.endRow = table.headerRow;
    } else if (scopeToken === '#Totals' && table.totalsRow) {
      range.startRow = table.totalsRow;
      range.endRow = table.totalsRow;
    } else {
      range.startRow = table.dataStartRow;
      range.endRow = table.dataEndRow;
    }

    if (columnToken) {
      const col = table.columns.find((entry) => entry.name === columnToken);
      if (col) {
        range.startCol = col.col;
        range.endCol = col.col;
      }
    }

    const a1Range = rangeToA1(range);
    return `${table.sheet}!${a1Range}`;
  };

  return String(formula).replace(/([A-Za-z0-9_]+)\[([^\]]+\])+/g, (match, tableName) => {
    const refBody = match.slice(tableName.length);
    return replaceRef(match, tableName, refBody);
  });
};

export const parseWorkbook = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings = await extractSharedStrings(zip);
  const workbookInfo = await extractWorkbookInfo(zip);

  // Parse all sheets in parallel — each sheet is an independent ZIP entry
  const sheets = (
    await Promise.all(
      workbookInfo.sheets.map(async (sheet) => {
        if (!sheet.target) return null;
        const sheetXml = await zip.file(sheet.target)?.async('string');
        if (!sheetXml) return null;
        const worksheetXml = parser.parse(sheetXml);

        const dataValidations = extractDataValidations(worksheetXml);
        const rows = extractRows(worksheetXml);
        const cols = extractColumns(worksheetXml);
        const merges = extractMergedCells(worksheetXml);
        const tableParts = extractTableParts(worksheetXml);
        const sheetRels = await extractSheetRels(zip, sheet.target);
        const tables = await extractTables(zip, sheetRels, workbookInfo.relItems);

        return {
          name: sheet.name,
          id: sheet.sheetId,
          state: sheet.state,
          dimensions: extractDimensions(worksheetXml),
          dataValidations,
          rows,
          cols,
          merges,
          tableParts,
          tables,
          cells: expandSharedFormulas(extractCells(worksheetXml, sharedStrings)),
        };
      })
    )
  ).filter(Boolean);

  const tableRegistry = buildTableRegistry(sheets);
  sheets.forEach((sheet) => {
    sheet.cells = sheet.cells.map((cell) => ({
      ...cell,
      formula: cell.formula ? resolveStructuredReference(cell.formula, tableRegistry) : cell.formula,
    }));
  });

  return {
    workbook: {
      sheetNames: workbookInfo.sheets.map((sheet) => sheet.name),
      definedNames: workbookInfo.definedNames,
      tableRegistry,
    },
    sheets,
  };
};
