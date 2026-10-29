"""
Field index loader — shared/field_index.json is the single declaration of
every field that crosses a module or runtime boundary. Everything Flask
needs (write schema, alias resolution, iSBD label lookup, GSSM cells) is
derived here; nothing else may hardcode those facts.
"""
import json
import os
import re
import unicodedata

_INDEX_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'shared', 'field_index.json')

with open(_INDEX_PATH, 'r', encoding='utf-8') as _fh:
    _INDEX = json.load(_fh)

FIELDS = _INDEX['fields']
RECORDS = _INDEX['records']
VOCABULARIES = _INDEX['vocabularies']
OWNERS = frozenset(_INDEX['owners'])

_PUNCTUATION = str.maketrans({
    '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2013': '-', '\u2014': '-',
})
_A1 = re.compile(r'^(?P<sheet>.+)!(?P<col>[A-Z]+)(?P<row>[0-9]+)$')


def normalize_label(label):
    """Canonical form of a human label; must match normalizeLabel() in fieldIndex.js."""
    if not label:
        return ''
    text = unicodedata.normalize('NFKC', str(label)).translate(_PUNCTUATION)
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r'\s*/\s*', '/', text)
    text = re.sub(r'[\s:*]+$', '', text)
    return text.lower()


def _parse_a1(ref):
    match = _A1.match(ref)
    if not match:
        raise ValueError(f'bad GSSM cell reference {ref!r}')
    col = 0
    for ch in match['col']:
        col = col * 26 + (ord(ch) - 64)
    return match['sheet'], int(match['row']) - 1, col - 1


def _claim(table, slot, key):
    if slot in table and table[slot] != key:
        raise ValueError(f'iSBD label {slot!r} claimed by both {table[slot]} and {key}')
    table[slot] = key


def _build():
    names, global_labels, scoped_labels, cells = {}, {}, {}, {}
    for key, entry in FIELDS.items():
        if entry.get('owner') not in OWNERS:
            raise ValueError(f'field {key}: unknown owner {entry.get("owner")!r}')
        for name in (key, *entry.get('aliases', ())):
            if name in names:
                raise ValueError(f'name {name!r} claimed by both {names[name]} and {key}')
            names[name] = key
        isbd = entry.get('isbd') or {}
        for label in isbd.get('labels', ()):
            _claim(global_labels, normalize_label(label), key)
        for slide, labels in (isbd.get('scoped') or {}).items():
            for label in labels:
                _claim(scoped_labels, (slide, normalize_label(label)), key)
        if entry.get('gssm'):
            cells[key] = _parse_a1(entry['gssm'])
    return names, global_labels, scoped_labels, cells


_NAMES, _GLOBAL_LABELS, _SCOPED_LABELS, _CELLS = _build()


def _build_monday_bindings():
    bindings, slots = [], {}
    for key, entry in FIELDS.items():
        block = entry.get('monday')
        if not block:
            continue
        slot = (block.get('column_id') or block.get('source'), block.get('part'))
        if slot in slots:
            raise ValueError(f'monday column {slot} bound to both {slots[slot]} and {key}')
        slots[slot] = key
        bindings.append((key, block))
    return tuple(bindings)


_MONDAY_BINDINGS = _build_monday_bindings()


def _build_salesforce(fields):
    """((key, block) for every Salesforce field read, compare pairs) from a fields mapping."""
    bindings, pairs, seen = [], [], {}
    for key, entry in fields.items():
        block = entry.get('salesforce') or {}
        name = block.get('field')
        if not name:
            continue
        if name in seen:
            raise ValueError(f'Salesforce field {name} bound to both {seen[name]} and {key}')
        seen[name] = key
        bindings.append((key, block))
        compare = block.get('compare')
        if compare:
            target = fields.get(compare.get('with')) or {}
            if target.get('owner') != 'monday' or not (target.get('monday') or {}).get('column_id'):
                raise ValueError(f'{key} must be compared with a monday board column, not {compare.get("with")!r}')
            pairs.append({'key': key, 'with': compare['with'], 'labels': compare.get('labels')})
    return tuple(bindings), tuple(pairs)


_SALESFORCE_BINDINGS, _COMPARE_PAIRS = _build_salesforce(FIELDS)

# Top-level containers whose children are declared individually (financials, isbd_data, external_links).
SECTIONS = frozenset(e['path'].split('.', 1)[0] for e in FIELDS.values() if '.' in e.get('path', ''))


def canonical_key(name):
    """Resolve any old name to its field key; unknown names come back unchanged."""
    return _NAMES.get(name, name)


def owner_of(key):
    entry = FIELDS.get(key)
    return entry['owner'] if entry else None


def path_of(key):
    entry = FIELDS.get(key)
    return entry.get('path') if entry else None


def top_level_keys(*owners):
    return frozenset(
        e['path'].split('.', 1)[0] for e in FIELDS.values()
        if e['owner'] in owners and e.get('path')
    )


def section_keys(section, *owners):
    prefix = section + '.'
    return frozenset(
        e['path'][len(prefix):] for e in FIELDS.values()
        if e['owner'] in owners and e.get('path', '').startswith(prefix)
    )


def required_keys():
    return tuple(k for k, e in FIELDS.items() if e.get('required') == 'always')


def is_linked(deal, owner):
    """Whether a deal is linked to the source that owns a field (mirrors isLinked in fieldIndex.js)."""
    if owner == 'gssm':
        return bool(deal.get('gssm_workbook_id') or deal.get('gssm_synced_at'))
    if owner == 'monday':
        return bool(deal.get('monday_item_id'))
    if owner == 'salesforce':
        return bool(deal.get('salesforce_id'))
    return False


def deal_editable(key, deal):
    """Whether s0L screens may write a field: deal-owned, or editable until its owner takes it over."""
    entry = FIELDS.get(key)
    if not entry:
        return False
    if entry['owner'] == 'deal':
        return True
    if not entry.get('editable_until_linked'):
        return False
    if entry['owner'] == 'salesforce':
        # Salesforce takes a field over only once it supplies a value for it.
        return key not in ((deal or {}).get('salesforce_supplied') or ())
    return not is_linked(deal or {}, entry['owner'])


def monday_bindings():
    """(key, monday block) for every field the board fills, in index order."""
    return _MONDAY_BINDINGS


def salesforce_bindings():
    """(key, salesforce block) for every Opportunity field the Salesforce check reads, in index order."""
    return _SALESFORCE_BINDINGS


def compare_pairs():
    """{'key', 'with', 'labels'} for each Salesforce value compared with a board column."""
    return _COMPARE_PAIRS


def isbd_key_for(label, slide_type=None):
    """Field key for an iSBD label; slide-scoped labels win over global ones."""
    norm = normalize_label(label)
    if slide_type and (slide_type, norm) in _SCOPED_LABELS:
        return _SCOPED_LABELS[(slide_type, norm)]
    return _GLOBAL_LABELS.get(norm)


def gssm_cell(key):
    """(sheet, row, col) 0-based, matching workbook rowData indexing."""
    return _CELLS.get(key)


def legacy_value(key, value):
    """Map a value written under an old vocabulary back to the workbook's verbatim value."""
    if not isinstance(value, str):
        return value
    return (FIELDS.get(key, {}).get('legacy_values') or {}).get(value, value)
