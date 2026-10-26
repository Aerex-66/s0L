#!/usr/bin/env python3
"""
XLSM update using ZIP-level operations to preserve all Excel features.
Does not use openpyxl - directly modifies sheet XML in the ZIP archive.
"""
import json
import sys
import zipfile
import tempfile
import posixpath
import re
from pathlib import Path
from xml.etree import ElementTree as ET

# Excel namespace
NS = {
    'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
}

KNOWN_PREFIX_URIS = {
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'x14ac': 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac',
    'xr': 'http://schemas.microsoft.com/office/spreadsheetml/2014/revision',
    'xr2': 'http://schemas.microsoft.com/office/spreadsheetml/2015/revision2',
    'xr3': 'http://schemas.microsoft.com/office/spreadsheetml/2016/revision3',
}

INVALID_XML_CHAR_PATTERN = re.compile(r'[\x00-\x08\x0B\x0C\x0E-\x1F]')

def sanitize_xml_text(value):
    if value is None:
        return None
    text = str(value)
    return INVALID_XML_CHAR_PATTERN.sub('', text)

def parse_value(value):
    if value is None:
        return None
    if isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, str):
        trimmed = value.strip()
        if trimmed == '':
            return None
        if trimmed.startswith('='):
            return trimmed
        if trimmed.upper() in ('TRUE', 'FALSE'):
            return trimmed.upper() == 'TRUE'
        if re.fullmatch(r'-?\d+(\.\d+)?', trimmed):
            try:
                return float(trimmed) if '.' in trimmed else int(trimmed)
            except ValueError:
                return sanitize_xml_text(trimmed)
        return sanitize_xml_text(trimmed)
    return sanitize_xml_text(value)

def col_to_letter(col_index):
    """Convert 0-based column index to Excel column letter (0 -> A, 25 -> Z, 26 -> AA)"""
    letter = ''
    col_index += 1
    while col_index > 0:
        col_index, remainder = divmod(col_index - 1, 26)
        letter = chr(65 + remainder) + letter
    return letter

def cell_address(row_index, col_index):
    """Convert 0-based row/col to Excel address (0, 0 -> A1)"""
    return f"{col_to_letter(col_index)}{row_index + 1}"

def get_sheet_path(sheet_name, workdir):
    """Find the sheet XML path for a given sheet name"""
    workbook_path = workdir / 'xl' / 'workbook.xml'
    tree = ET.parse(workbook_path)
    root = tree.getroot()
    
    sheets = root.findall('.//main:sheet', NS)
    for sheet in sheets:
        if sheet.get('name') == sheet_name:
            sheet_id = sheet.get('{' + NS['r'] + '}id')
            # Find the relationship
            rels_path = workdir / 'xl' / '_rels' / 'workbook.xml.rels'
            rels_tree = ET.parse(rels_path)
            rels_root = rels_tree.getroot()
            
            for rel in rels_root:
                if rel.get('Id') == sheet_id:
                    target = rel.get('Target')
                    if not target:
                        return None
                    target = target.replace('\\', '/')
                    if target.startswith('/'):
                        normalized = target.lstrip('/')
                    else:
                        normalized = posixpath.normpath(f'xl/{target}')
                    return workdir / normalized
    return None

def col_to_number(col_letters):
    result = 0
    for ch in str(col_letters or '').upper():
        if not ('A' <= ch <= 'Z'):
            continue
        result = result * 26 + (ord(ch) - ord('A') + 1)
    return result

def cell_sort_key(cell_ref):
    match = re.match(r'([A-Z]+)(\d+)', str(cell_ref or '').upper())
    if not match:
        return (10**9, 10**9)
    return (int(match.group(2)), col_to_number(match.group(1)))

def insert_row_sorted(sheet_data, row_elem):
    target_row = int(row_elem.get('r'))
    inserted = False
    for idx, existing in enumerate(sheet_data.findall('main:row', NS)):
        existing_row = int(existing.get('r') or 0)
        if existing_row > target_row:
            sheet_data.insert(idx, row_elem)
            inserted = True
            break
    if not inserted:
        sheet_data.append(row_elem)

def insert_cell_sorted(row_elem, cell_elem):
    target_ref = cell_elem.get('r') or ''
    target_key = cell_sort_key(target_ref)
    inserted = False
    for idx, existing in enumerate(row_elem.findall('main:c', NS)):
        existing_key = cell_sort_key(existing.get('r'))
        if existing_key > target_key:
            row_elem.insert(idx, cell_elem)
            inserted = True
            break
    if not inserted:
        row_elem.append(cell_elem)

def split_root_xml_parts(xml_text):
    if xml_text is None:
        return None, None, None

    text = str(xml_text)
    text = re.sub(r'^\s*<\?xml[^>]*\?>\s*', '', text)
    open_start = text.find('<')
    if open_start < 0:
        return None, None, None
    open_end = text.find('>', open_start)
    if open_end < 0:
        return None, None, None

    close_start = text.rfind('</')
    close_end = text.rfind('>')
    if close_start < 0 or close_end < 0 or close_end <= close_start:
        return None, None, None

    opening_tag = text[open_start:open_end + 1]
    inner_xml = text[open_end + 1:close_start]
    closing_tag = text[close_start:close_end + 1]
    return opening_tag, inner_xml, closing_tag

def xmlns_declarations_from_opening_tag(opening_tag):
    if not opening_tag:
        return {}
    declarations = {}
    for prefix, uri in re.findall(r'\sxmlns:([A-Za-z_][\w\-.]*)\s*=\s*"([^"]+)"', opening_tag):
        declarations[f'xmlns:{prefix}'] = uri
    default_match = re.search(r'\sxmlns\s*=\s*"([^"]+)"', opening_tag)
    if default_match:
        declarations['xmlns'] = default_match.group(1)
    return declarations

def preserve_root_xmlns(serialized_xml_text, original_opening_tag):
    new_open, inner_xml, close_tag = split_root_xml_parts(serialized_xml_text)
    if not new_open or inner_xml is None or not close_tag:
        return serialized_xml_text

    original_xmlns = xmlns_declarations_from_opening_tag(original_opening_tag)
    if not original_xmlns:
        return serialized_xml_text

    merged_open = new_open
    for attr_name, attr_value in original_xmlns.items():
        if re.search(rf'\s{re.escape(attr_name)}\s*=\s*"', merged_open):
            continue
        merged_open = merged_open[:-1] + f' {attr_name}="{attr_value}">' if merged_open.endswith('>') else merged_open

    if merged_open == new_open:
        return serialized_xml_text

    return "<?xml version='1.0' encoding='utf-8'?>\n" + merged_open + inner_xml + close_tag

def declared_prefixes_from_opening_tag(opening_tag):
    if not opening_tag:
        return set()
    prefixes = set(re.findall(r'\sxmlns:([A-Za-z_][\w\-.]*)\s*=\s*"[^"]*"', opening_tag))
    return prefixes

def namespace_map_from_opening_tag(opening_tag):
    if not opening_tag:
        return {}
    pairs = re.findall(r'\sxmlns:([A-Za-z_][\w\-.]*)\s*=\s*"([^"]+)"', opening_tag)
    return {prefix: uri for prefix, uri in pairs}

def ignorable_prefixes_from_opening_tag(opening_tag):
    if not opening_tag:
        return set()
    match = re.search(r'\b(?:[A-Za-z_][\w\-.]*:)?Ignorable\s*=\s*"([^"]+)"', opening_tag)
    if not match:
        return set()
    return set(token for token in match.group(1).split() if token)

def inject_missing_namespace_declarations(xml_text):
    opening_tag, _inner, closing_tag = split_root_xml_parts(xml_text)
    if not opening_tag or not closing_tag:
        return xml_text

    declared = declared_prefixes_from_opening_tag(opening_tag)
    ignorable = ignorable_prefixes_from_opening_tag(opening_tag)
    missing = sorted(p for p in (ignorable - declared) if p not in {'xml', 'xmlns'})
    if not missing:
        return xml_text

    unknown = [prefix for prefix in missing if prefix not in KNOWN_PREFIX_URIS]
    if unknown:
        raise ValueError(f"Unknown unbound namespace prefixes: {', '.join(unknown)}")

    ns_fragment = ''.join([f' xmlns:{prefix}="{KNOWN_PREFIX_URIS[prefix]}"' for prefix in missing])
    patched_opening = re.sub(r'\s*>\s*$', f'{ns_fragment}>', opening_tag)
    if patched_opening == opening_tag:
        patched_opening = opening_tag[:-1] + ns_fragment + '>' if opening_tag.endswith('>') else opening_tag

    return xml_text.replace(opening_tag, patched_opening, 1)

def parse_sheet_tree_with_namespace_recovery(sheet_path):
    raw_xml = sheet_path.read_text(encoding='utf-8')
    opening_tag, _inner, _close = split_root_xml_parts(raw_xml)
    for prefix, uri in namespace_map_from_opening_tag(opening_tag).items():
        ET.register_namespace(prefix, uri)
    try:
        tree = ET.ElementTree(ET.fromstring(raw_xml))
        return tree, raw_xml
    except ET.ParseError as error:
        if 'unbound prefix' not in str(error):
            raise
        patched_xml = inject_missing_namespace_declarations(raw_xml)
        tree = ET.ElementTree(ET.fromstring(patched_xml))
        return tree, patched_xml

def apply_cell_to_tree(root, row_index, col_index, value):
    """Apply a single cell edit to an already-parsed XML tree (no I/O)."""
    sheetData = root.find('.//main:sheetData', NS)
    if sheetData is None:
        sheetData = ET.SubElement(root, '{' + NS['main'] + '}sheetData')

    addr = cell_address(row_index, col_index)
    target_row = row_index + 1

    # Find or create row
    row_elem = None
    for r in sheetData.findall('main:row', NS):
        if int(r.get('r')) == target_row:
            row_elem = r
            break

    if row_elem is None:
        row_elem = ET.SubElement(sheetData, '{' + NS['main'] + '}row')
        row_elem.set('r', str(target_row))
        sheetData.remove(row_elem)
        insert_row_sorted(sheetData, row_elem)

    # Find or create cell
    cell_elem = None
    for c in row_elem.findall('main:c', NS):
        if c.get('r') == addr:
            cell_elem = c
            break

    if cell_elem is None:
        cell_elem = ET.SubElement(row_elem, '{' + NS['main'] + '}c')
        cell_elem.set('r', addr)
        row_elem.remove(cell_elem)
        insert_cell_sorted(row_elem, cell_elem)

    # Remove existing value/formula/inline string nodes
    for child in list(cell_elem):
        if child.tag in ['{' + NS['main'] + '}v', '{' + NS['main'] + '}f', '{' + NS['main'] + '}is']:
            cell_elem.remove(child)

    parsed = parse_value(value)

    if parsed is None:
        if 't' in cell_elem.attrib:
            del cell_elem.attrib['t']
    elif isinstance(parsed, str) and parsed.startswith('='):
        if 't' in cell_elem.attrib:
            del cell_elem.attrib['t']
        formula_elem = ET.SubElement(cell_elem, '{' + NS['main'] + '}f')
        formula_elem.text = sanitize_xml_text(parsed[1:])
    elif isinstance(parsed, bool):
        cell_elem.set('t', 'b')
        v_elem = ET.SubElement(cell_elem, '{' + NS['main'] + '}v')
        v_elem.text = '1' if parsed else '0'
    elif isinstance(parsed, (int, float)):
        if 't' in cell_elem.attrib:
            del cell_elem.attrib['t']
        v_elem = ET.SubElement(cell_elem, '{' + NS['main'] + '}v')
        v_elem.text = str(parsed)
    else:
        cell_elem.set('t', 'inlineStr')
        is_elem = ET.SubElement(cell_elem, '{' + NS['main'] + '}is')
        t_elem = ET.SubElement(is_elem, '{' + NS['main'] + '}t')
        t_elem.text = sanitize_xml_text(parsed)


def update_sheet_cells(sheet_path, cell_edits):
    """Apply multiple cell edits to one sheet XML — single parse/serialize cycle."""
    ET.register_namespace('', NS['main'])
    ET.register_namespace('r', NS['r'])

    original_xml_text = sheet_path.read_text(encoding='utf-8')
    original_open, _original_inner, _original_close = split_root_xml_parts(original_xml_text)
    for prefix, uri in namespace_map_from_opening_tag(original_open).items():
        ET.register_namespace(prefix, uri)

    try:
        tree, _parsed_source_xml = parse_sheet_tree_with_namespace_recovery(sheet_path)
    except Exception as error:
        raise RuntimeError(f"Failed parsing worksheet XML '{sheet_path}': {error}") from error

    root = tree.getroot()
    for row_index, col_index, value in cell_edits:
        apply_cell_to_tree(root, row_index, col_index, value)

    serialized = ET.tostring(root, encoding='utf-8', xml_declaration=True).decode('utf-8')
    serialized = preserve_root_xmlns(serialized, original_open)
    sheet_path.write_text(serialized, encoding='utf-8')

def find_cell(sheet_root, row_index, col_index):
    addr = cell_address(row_index, col_index)
    for row_elem in sheet_root.findall('.//main:row', NS):
        if int(row_elem.get('r') or 0) != row_index + 1:
            continue
        for cell_elem in row_elem.findall('main:c', NS):
            if cell_elem.get('r') == addr:
                return cell_elem
        break
    return None

def assert_cell_matches_value(sheet_path, row_index, col_index, value):
    tree, _ = parse_sheet_tree_with_namespace_recovery(sheet_path)
    root = tree.getroot()
    cell_elem = find_cell(root, row_index, col_index)
    expected = parse_value(value)

    if expected is None:
        if cell_elem is None:
            return
        for child in list(cell_elem):
            if child.tag in ['{' + NS['main'] + '}v', '{' + NS['main'] + '}f', '{' + NS['main'] + '}is']:
                raise RuntimeError(f"Cell {cell_address(row_index, col_index)} expected blank but has value/formula nodes")
        return

    if cell_elem is None:
        raise RuntimeError(f"Cell {cell_address(row_index, col_index)} missing after update")

    if isinstance(expected, str) and expected.startswith('='):
        formula_elem = cell_elem.find('main:f', NS)
        if formula_elem is None:
            raise RuntimeError(f"Cell {cell_address(row_index, col_index)} expected formula node")
        actual = formula_elem.text or ''
        expected_formula = sanitize_xml_text(expected[1:])
        if actual != expected_formula:
            raise RuntimeError(f"Cell {cell_address(row_index, col_index)} formula mismatch: '{actual}' != '{expected_formula}'")
        return

    if isinstance(expected, bool):
        if cell_elem.get('t') != 'b':
            raise RuntimeError(f"Cell {cell_address(row_index, col_index)} expected boolean type")
        value_elem = cell_elem.find('main:v', NS)
        actual = (value_elem.text if value_elem is not None else None)
        expected_text = '1' if expected else '0'
        if actual != expected_text:
            raise RuntimeError(f"Cell {cell_address(row_index, col_index)} boolean mismatch: '{actual}' != '{expected_text}'")
        return

    if isinstance(expected, (int, float)):
        value_elem = cell_elem.find('main:v', NS)
        actual = (value_elem.text if value_elem is not None else None)
        expected_text = str(expected)
        if actual != expected_text:
            raise RuntimeError(f"Cell {cell_address(row_index, col_index)} numeric mismatch: '{actual}' != '{expected_text}'")
        return

    # String inline value
    if cell_elem.get('t') != 'inlineStr':
        raise RuntimeError(f"Cell {cell_address(row_index, col_index)} expected inlineStr type")
    is_elem = cell_elem.find('main:is', NS)
    text_elem = is_elem.find('main:t', NS) if is_elem is not None else None
    actual = text_elem.text if text_elem is not None else ''
    expected_text = sanitize_xml_text(expected)
    if actual != expected_text:
        raise RuntimeError(f"Cell {cell_address(row_index, col_index)} text mismatch: '{actual}' != '{expected_text}'")

def clone_zip_info(info):
    cloned = zipfile.ZipInfo(filename=info.filename, date_time=info.date_time)
    cloned.compress_type = info.compress_type
    cloned.comment = info.comment
    cloned.extra = info.extra
    cloned.internal_attr = info.internal_attr
    cloned.external_attr = info.external_attr
    cloned.create_system = info.create_system
    cloned.create_version = info.create_version
    cloned.extract_version = info.extract_version
    cloned.flag_bits = info.flag_bits
    cloned.volume = info.volume
    return cloned

def write_output_preserving_entries(input_path, output_path, workdir, modified_arcnames, new_arcnames=None):
    modified = set(modified_arcnames)
    new_files = set(new_arcnames or [])

    with zipfile.ZipFile(input_path, 'r') as zin, zipfile.ZipFile(output_path, 'w') as zout:
        for info in zin.infolist():
            name = info.filename
            if info.is_dir():
                zout.writestr(clone_zip_info(info), b'')
                continue

            if name in modified:
                data = (workdir / name).read_bytes()
            else:
                data = zin.read(name)

            zout.writestr(clone_zip_info(info), data)

        # Write newly created files (generated sheets, etc.)
        for arcname in sorted(new_files):
            file_path = workdir / arcname
            if file_path.exists():
                info = zipfile.ZipInfo(filename=arcname)
                info.compress_type = zipfile.ZIP_DEFLATED
                zout.writestr(info, file_path.read_bytes())

# ===========================================================================
#  Generated-sheet injection — creates brand-new worksheet XML files inside
#  the XLSM ZIP and wires them into workbook.xml, .rels, [Content_Types].xml
# ===========================================================================

WORKSHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
RELS_NS      = 'http://schemas.openxmlformats.org/package/2006/relationships'
CONTENT_NS   = 'http://schemas.openxmlformats.org/package/2006/content-types'
SHEET_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet'
WORKSHEET_CT   = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'


def _next_sheet_number(workdir):
    """Find the highest sheetN.xml number in xl/worksheets/ and return N+1."""
    ws_dir = workdir / 'xl' / 'worksheets'
    if not ws_dir.exists():
        ws_dir.mkdir(parents=True)
    highest = 0
    for f in ws_dir.iterdir():
        m = re.match(r'sheet(\d+)\.xml', f.name, re.IGNORECASE)
        if m:
            highest = max(highest, int(m.group(1)))
    return highest + 1


def _next_sheet_id(workdir):
    """Find the highest sheetId in workbook.xml and return sheetId+1."""
    wb_path = workdir / 'xl' / 'workbook.xml'
    raw = wb_path.read_text(encoding='utf-8')
    ids = [int(m) for m in re.findall(r'sheetId="(\d+)"', raw)]
    return max(ids) + 1 if ids else 1


def _build_worksheet_xml(grid):
    """Build a minimal worksheet XML string from a 2-D grid (list of lists)."""
    ns = WORKSHEET_NS
    ET.register_namespace('', ns)
    ET.register_namespace('r', NS['r'])

    root = ET.Element(f'{{{ns}}}worksheet')
    root.set('xmlns', ns)
    root.set('xmlns:r', NS['r'])

    sheet_data = ET.SubElement(root, f'{{{ns}}}sheetData')

    for ri, row_cells in enumerate(grid):
        if row_cells is None:
            continue
        row_num = ri + 1  # 1-based

        row_elem = ET.SubElement(sheet_data, f'{{{ns}}}row')
        row_elem.set('r', str(row_num))

        for ci, value in enumerate(row_cells):
            if value is None:
                continue
            addr = cell_address(ri, ci)
            cell_elem = ET.SubElement(row_elem, f'{{{ns}}}c')
            cell_elem.set('r', addr)

            parsed = parse_value(value)
            if parsed is None:
                continue
            elif isinstance(parsed, bool):
                cell_elem.set('t', 'b')
                v = ET.SubElement(cell_elem, f'{{{ns}}}v')
                v.text = '1' if parsed else '0'
            elif isinstance(parsed, (int, float)):
                v = ET.SubElement(cell_elem, f'{{{ns}}}v')
                v.text = str(parsed)
            elif isinstance(parsed, str) and parsed.startswith('='):
                f_elem = ET.SubElement(cell_elem, f'{{{ns}}}f')
                f_elem.text = sanitize_xml_text(parsed[1:])
            else:
                cell_elem.set('t', 'inlineStr')
                is_elem = ET.SubElement(cell_elem, f'{{{ns}}}is')
                t_elem = ET.SubElement(is_elem, f'{{{ns}}}t')
                t_elem.text = sanitize_xml_text(parsed)

    return ET.tostring(root, encoding='utf-8', xml_declaration=True).decode('utf-8')


def inject_generated_sheets(workdir, generated_sheets, modified_arcnames):
    """
    For each generated sheet definition, create a new worksheet XML,
    register it in workbook.xml, workbook.xml.rels, and [Content_Types].xml.

    generated_sheets: list of {"name": str, "grid": list[list[any]]}
    Returns set of newly created arcnames.
    """
    if not generated_sheets:
        return set()

    new_arcnames = set()
    wb_path = workdir / 'xl' / 'workbook.xml'
    rels_path = workdir / 'xl' / '_rels' / 'workbook.xml.rels'
    ct_path = workdir / '[Content_Types].xml'

    # ── Parse workbook.xml ──
    ET.register_namespace('', NS['main'])
    ET.register_namespace('r', NS['r'])
    wb_raw = wb_path.read_text(encoding='utf-8')
    wb_open, _, _ = split_root_xml_parts(wb_raw)
    for prefix, uri in namespace_map_from_opening_tag(wb_open).items():
        ET.register_namespace(prefix, uri)
    wb_root = ET.fromstring(wb_raw)
    ns = '{' + NS['main'] + '}'
    sheets_elem = wb_root.find(f'{ns}sheets')
    if sheets_elem is None:
        sheets_elem = ET.SubElement(wb_root, f'{ns}sheets')

    # ── Parse workbook.xml.rels ──
    ET.register_namespace('', RELS_NS)
    rels_raw = rels_path.read_text(encoding='utf-8')
    rels_open, _, _ = split_root_xml_parts(rels_raw)
    for prefix, uri in namespace_map_from_opening_tag(rels_open).items():
        ET.register_namespace(prefix, uri)
    rels_root = ET.fromstring(rels_raw)

    # ── Parse [Content_Types].xml ──
    ET.register_namespace('', CONTENT_NS)
    ct_raw = ct_path.read_text(encoding='utf-8')
    ct_open, _, _ = split_root_xml_parts(ct_raw)
    for prefix, uri in namespace_map_from_opening_tag(ct_open).items():
        ET.register_namespace(prefix, uri)
    ct_root = ET.fromstring(ct_raw)

    # Track current max values
    sheet_num = _next_sheet_number(workdir)
    sheet_id = _next_sheet_id(workdir)
    # Collect existing rId numbers so we can increment
    rid_nums = [int(m) for m in re.findall(r'Id="rId(\d+)"', rels_raw)]
    next_rid_num = (max(rid_nums) + 1) if rid_nums else 100

    for gen_sheet in generated_sheets:
        name = gen_sheet.get('name', f'Sheet{sheet_num}')
        grid = gen_sheet.get('grid', [])
        if not grid:
            continue

        # Check if a sheet with this name already exists — skip if so
        existing = sheets_elem.findall(f'{ns}sheet')
        already_exists = any(s.get('name') == name for s in existing)
        if already_exists:
            # If it already exists, just update the cells in-place
            sheet_path = get_sheet_path(name, workdir)
            if sheet_path and sheet_path.exists():
                cell_edits = []
                for ri, row_cells in enumerate(grid):
                    if row_cells is None:
                        continue
                    for ci, val in enumerate(row_cells):
                        if val is not None:
                            cell_edits.append((ri, ci, val))
                if cell_edits:
                    update_sheet_cells(sheet_path, cell_edits)
                    modified_arcnames.add(sheet_path.relative_to(workdir).as_posix())
            continue

        # ── Create worksheet XML ──
        ws_filename = f'sheet{sheet_num}.xml'
        ws_arcname = f'xl/worksheets/{ws_filename}'
        ws_path = workdir / 'xl' / 'worksheets' / ws_filename
        ws_path.parent.mkdir(parents=True, exist_ok=True)
        ws_xml = _build_worksheet_xml(grid)
        ws_path.write_text(ws_xml, encoding='utf-8')
        new_arcnames.add(ws_arcname)

        # ── Add to workbook.xml ──
        rid = f'rId{next_rid_num}'
        sheet_elem = ET.SubElement(sheets_elem, f'{ns}sheet')
        sheet_elem.set('name', name)
        sheet_elem.set('sheetId', str(sheet_id))
        sheet_elem.set('{' + NS['r'] + '}id', rid)

        # ── Add relationship ──
        rel_elem = ET.SubElement(rels_root, f'{{{RELS_NS}}}Relationship')
        rel_elem.set('Id', rid)
        rel_elem.set('Type', SHEET_REL_TYPE)
        rel_elem.set('Target', f'worksheets/{ws_filename}')

        # ── Add content type ──
        override = ET.SubElement(ct_root, f'{{{CONTENT_NS}}}Override')
        override.set('PartName', f'/{ws_arcname}')
        override.set('ContentType', WORKSHEET_CT)

        sheet_num += 1
        sheet_id += 1
        next_rid_num += 1

    # ── Write back modified XML files ──
    if new_arcnames:
        wb_out = ET.tostring(wb_root, encoding='utf-8', xml_declaration=True).decode('utf-8')
        wb_out = preserve_root_xmlns(wb_out, wb_open)
        wb_path.write_text(wb_out, encoding='utf-8')
        modified_arcnames.add('xl/workbook.xml')

        rels_out = ET.tostring(rels_root, encoding='utf-8', xml_declaration=True).decode('utf-8')
        rels_out = preserve_root_xmlns(rels_out, rels_open)
        rels_path.write_text(rels_out, encoding='utf-8')
        modified_arcnames.add('xl/_rels/workbook.xml.rels')

        ct_out = ET.tostring(ct_root, encoding='utf-8', xml_declaration=True).decode('utf-8')
        ct_out = preserve_root_xmlns(ct_out, ct_open)
        ct_path.write_text(ct_out, encoding='utf-8')
        modified_arcnames.add('[Content_Types].xml')

    return new_arcnames


def apply_cell_fills(workdir, fills_by_sheet, modified_arcnames):
    """Apply cell background fills by patching xl/styles.xml and sheet XMLs."""
    if not fills_by_sheet:
        return

    styles_path = workdir / 'xl' / 'styles.xml'
    if not styles_path.exists():
        return

    ET.register_namespace('', NS['main'])
    raw_xml = styles_path.read_text(encoding='utf-8')
    opening_tag, _inner, _close = split_root_xml_parts(raw_xml)
    for prefix, uri in namespace_map_from_opening_tag(opening_tag).items():
        ET.register_namespace(prefix, uri)

    styles_root = ET.fromstring(raw_xml)
    nsm = NS['main']
    ns = '{' + nsm + '}'

    # ── 1. Find or create <fills> ──
    fills_elem = styles_root.find(f'{ns}fills')
    if fills_elem is None:
        fills_elem = ET.SubElement(styles_root, f'{ns}fills')
        fills_elem.set('count', '0')

    existing_fill_count = int(fills_elem.get('count', '0'))

    # ── 2. Collect unique colors and create fill entries ──
    unique_colors = sorted(set(
        fill_color for fill_list in fills_by_sheet.values() for (_, _, fill_color) in fill_list
    ))
    color_to_fill_index = {}
    for color in unique_colors:
        fill_index = existing_fill_count + len(color_to_fill_index)
        color_to_fill_index[color] = fill_index
        fill_el = ET.SubElement(fills_elem, f'{ns}fill')
        pf = ET.SubElement(fill_el, f'{ns}patternFill')
        pf.set('patternType', 'solid')
        fg = ET.SubElement(pf, f'{ns}fgColor')
        fg.set('rgb', color)
        bg = ET.SubElement(pf, f'{ns}bgColor')
        bg.set('indexed', '64')

    fills_elem.set('count', str(existing_fill_count + len(color_to_fill_index)))

    # ── 3. Find or create <cellXfs> and add style entries ──
    cell_xfs = styles_root.find(f'{ns}cellXfs')
    if cell_xfs is None:
        cell_xfs = ET.SubElement(styles_root, f'{ns}cellXfs')
        cell_xfs.set('count', '0')

    existing_xf_count = int(cell_xfs.get('count', '0'))
    color_to_style_index = {}

    for color in unique_colors:
        style_index = existing_xf_count + len(color_to_style_index)
        color_to_style_index[color] = style_index
        xf = ET.SubElement(cell_xfs, f'{ns}xf')
        xf.set('numFmtId', '0')
        xf.set('fontId', '0')
        xf.set('fillId', str(color_to_fill_index[color]))
        xf.set('borderId', '0')
        xf.set('applyFill', '1')

    cell_xfs.set('count', str(existing_xf_count + len(color_to_style_index)))

    # ── 4. Write updated styles.xml ──
    serialized = ET.tostring(styles_root, encoding='utf-8', xml_declaration=True).decode('utf-8')
    serialized = preserve_root_xmlns(serialized, opening_tag)
    styles_path.write_text(serialized, encoding='utf-8')
    modified_arcnames.add('xl/styles.xml')

    # ── 5. Apply style indices to cells in each sheet ──
    for sheet_name, fill_list in fills_by_sheet.items():
        sheet_path = get_sheet_path(sheet_name, workdir)
        if not sheet_path or not sheet_path.exists():
            continue

        sheet_raw = sheet_path.read_text(encoding='utf-8')
        sheet_open, _, _ = split_root_xml_parts(sheet_raw)
        for prefix, uri in namespace_map_from_opening_tag(sheet_open).items():
            ET.register_namespace(prefix, uri)

        try:
            tree, _ = parse_sheet_tree_with_namespace_recovery(sheet_path)
        except Exception:
            continue

        root = tree.getroot()
        sheet_data = root.find(f'{ns}sheetData')
        if sheet_data is None:
            continue

        for row_index, col_index, fill_color in fill_list:
            addr = cell_address(row_index, col_index)
            target_row = row_index + 1
            style_idx = color_to_style_index.get(fill_color)
            if style_idx is None:
                continue

            # Find or create the row and cell
            row_elem = None
            for r in sheet_data.findall(f'{ns}row'):
                if int(r.get('r', 0)) == target_row:
                    row_elem = r
                    break
            if row_elem is None:
                row_elem = ET.SubElement(sheet_data, f'{ns}row')
                row_elem.set('r', str(target_row))
                sheet_data.remove(row_elem)
                insert_row_sorted(sheet_data, row_elem)

            cell_elem = None
            for c in row_elem.findall(f'{ns}c'):
                if c.get('r') == addr:
                    cell_elem = c
                    break
            if cell_elem is None:
                cell_elem = ET.SubElement(row_elem, f'{ns}c')
                cell_elem.set('r', addr)
                row_elem.remove(cell_elem)
                insert_cell_sorted(row_elem, cell_elem)

            cell_elem.set('s', str(style_idx))

        out_xml = ET.tostring(root, encoding='utf-8', xml_declaration=True).decode('utf-8')
        out_xml = preserve_root_xmlns(out_xml, sheet_open)
        sheet_path.write_text(out_xml, encoding='utf-8')
        modified_arcnames.add(sheet_path.relative_to(workdir).as_posix())


def main():
    if len(sys.argv) < 4:
        print('Usage: xlsm_update_zip.py <input.xlsm> <payload.json> <output.xlsm>')
        sys.exit(1)
    
    input_path = Path(sys.argv[1])
    payload_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])
    
    with open(payload_path, 'r', encoding='utf-8') as f:
        payload = json.load(f)
    
    edits = payload.get('edits', [])
    cell_fills = payload.get('cellFills', [])
    generated_sheets = payload.get('generatedSheets', [])
    
    with tempfile.TemporaryDirectory() as tmpdir:
        workdir = Path(tmpdir) / 'workbook'
        workdir.mkdir()
        
        with zipfile.ZipFile(input_path, 'r') as zip_ref:
            zip_ref.extractall(workdir)
        
        # Group edits by sheet name for batched processing
        edits_by_sheet = {}
        for edit in edits:
            sheet_name = edit.get('sheet')
            row = edit.get('row')
            col = edit.get('col')
            value = edit.get('value')
            if sheet_name is None or row is None or col is None:
                continue
            edits_by_sheet.setdefault(sheet_name, []).append((row, col, value))

        modified_arcnames = set()
        all_validations = []

        for sheet_name, cell_edits in edits_by_sheet.items():
            sheet_path = get_sheet_path(sheet_name, workdir)
            if not sheet_path or not sheet_path.exists():
                continue
            update_sheet_cells(sheet_path, cell_edits)
            modified_arcnames.add(sheet_path.relative_to(workdir).as_posix())
            for row, col, value in cell_edits:
                all_validations.append((sheet_path, row, col, value))

        # Self-validation
        for sheet_path, row, col, value in all_validations:
            assert_cell_matches_value(sheet_path, row, col, value)

        # Apply cell fill colors (after cell edits so cells already exist)
        fills_by_sheet = {}
        for fill in cell_fills:
            sheet_name = fill.get('sheet')
            row = fill.get('row')
            col = fill.get('col')
            fill_color = fill.get('fill')
            if sheet_name and row is not None and col is not None and fill_color:
                fills_by_sheet.setdefault(sheet_name, []).append((row, col, fill_color))

        apply_cell_fills(workdir, fills_by_sheet, modified_arcnames)

        # Inject generated pivot sheets as new worksheets
        new_arcnames = inject_generated_sheets(workdir, generated_sheets, modified_arcnames)
        
        write_output_preserving_entries(input_path, output_path, workdir, modified_arcnames, new_arcnames)
    
    print(f'Updated: {output_path}')

if __name__ == '__main__':
    main()
