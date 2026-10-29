"""
Load-time data migrations: bring stored deals onto field-index keys.
Idempotent — migrate_deal() returns False when a deal is already current.
"""
import re
from datetime import datetime

from core.shared import field_index as fi
from core.shared.directory import migrate_directory

_DROPPED_FINANCIAL_KEYS = ('_gssm_source',)
_CURRENCY = re.compile(r'^\$?\s*(-?[\d,]*\.?\d+)\s*([kmb])?$', re.IGNORECASE)
_MULTIPLIERS = {'k': 1e3, 'm': 1e6, 'b': 1e9}


def _empty(value):
    return value is None or value == ''


def _ordered(section):
    """Filled values first, then index keys before old names, so a real value wins over an empty one."""
    return sorted(section.items(), key=lambda item: (_empty(item[1]), fi.canonical_key(item[0]) != item[0]))


def _coerce(key, value):
    """Convert deck text to the deal's format for typed fields; None when it can't be read safely."""
    kind = fi.FIELDS[key].get('type')
    text = str(value).strip()
    if kind in ('currency', 'number'):
        match = _CURRENCY.match(text)
        if not match:
            return None
        number = float(match[1].replace(',', '')) * _MULTIPLIERS.get((match[2] or '').lower(), 1)
        return str(int(number)) if number.is_integer() else str(number)
    if kind == 'date':
        try:
            return datetime.fromisoformat(text).date().isoformat()
        except ValueError:
            return None
    return value


def _migrate_section(section, name):
    out, changed = {}, False
    for raw, value in _ordered(section):
        if name == 'financials' and raw in _DROPPED_FINANCIAL_KEYS:
            changed = True
            continue
        key = fi.canonical_key(raw)
        if fi.path_of(key) != f'{name}.{key}':
            out[raw] = value
            continue
        new_value = fi.legacy_value(key, value)
        if key != raw or new_value != value or key in out:
            changed = True
        out.setdefault(key, new_value)
    return out, changed


def route_isbd_values(deal, values):
    """Split iSBD values by owner. Returns (isbd_only, changed, skipped): iSBD-only
    and unmodelled keys stay; deal-owned values fill empty deal fields (converted
    to the deal's format); everything not applied is listed in skipped with a reason."""
    out, changed, skipped = {}, False, []
    for raw, value in _ordered(values):
        key = fi.canonical_key(raw)
        owner = fi.owner_of(key)
        if raw.startswith('_') or owner is None:
            out[raw] = value
            continue
        if owner == 'isbd':
            changed = changed or key != raw or key in out
            out.setdefault(key, value)
            continue
        changed = True
        if _empty(value):
            continue
        if fi.path_of(key) != key or not fi.deal_editable(key, deal):
            skipped.append({'key': key, 'value': value, 'reason': f'owned by {owner}; the deal record is the source'})
        elif not _empty(deal.get(key)):
            skipped.append({'key': key, 'value': value, 'reason': 'deal already has a value'})
        else:
            coerced = _coerce(key, value)
            if coerced is None:
                skipped.append({'key': key, 'value': value, 'reason': f'not a valid {fi.FIELDS[key]["type"]}'})
            else:
                deal[key] = coerced
    return out, changed, skipped


def _migrate_isbd(deal):
    deal['isbd_data'], changed, _ = route_isbd_values(deal, deal['isbd_data'])
    return changed


def migrate_deal(deal):
    changed = False

    for raw in list(deal):
        key = fi.canonical_key(raw)
        if key != raw and fi.path_of(key) == key:
            if deal.get(key) in (None, ''):
                deal[key] = deal[raw]
            del deal[raw]
            changed = True

    for name in ('financials', 'external_links'):
        if isinstance(deal.get(name), dict):
            deal[name], section_changed = _migrate_section(deal[name], name)
            changed = changed or section_changed

    if isinstance(deal.get('isbd_data'), dict):
        changed = _migrate_isbd(deal) or changed

    if deal.get('resources') == []:
        deal['resources'] = {}
        changed = True

    return changed


def migrate_store(data):
    changed = migrate_directory(data)
    for deal in data.get('deals', []):
        changed = migrate_deal(deal) or changed
    return changed
