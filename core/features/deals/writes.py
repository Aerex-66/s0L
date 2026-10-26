"""
Owner-aware deal writes. Every route that changes a deal passes its payload
through prepare_deal_write(): old names resolve to index keys, unknown fields
are rejected (400) instead of silently dropped, and fields owned by another
source are refused (409). apply_deal_write() merges declared sections
(financials, isbd_data, external_links) and replaces everything else.
"""
from core.shared import field_index as fi


def _join(names):
    return ', '.join(sorted(names))


def is_gssm_linked(deal):
    """Linked once a workbook is recorded or GSSM has synced (mirrors isGssmLinked in fieldIndex.js)."""
    return bool(deal.get('gssm_workbook_id') or deal.get('gssm_synced_at'))


def _writable(key, owners, deal):
    entry = fi.FIELDS[key]
    if entry['owner'] in owners:
        return True
    return 'deal' in owners and bool(entry.get('editable_until_linked')) and not is_gssm_linked(deal)


def prepare_deal_write(deal, payload, *, owners):
    """Return (changes, None) on success or (None, (status, message))."""
    if not isinstance(payload, dict):
        return None, (400, 'Expected a JSON object')

    changes, unknown, refused, seen = {}, [], [], {}
    for raw_key, value in payload.items():
        key = fi.canonical_key(raw_key)
        if key in seen:
            return None, (400, f'Field sent twice under different names: {key} ({seen[key]}, {raw_key})')
        seen[key] = raw_key
        if key in fi.SECTIONS:
            if not isinstance(value, dict):
                return None, (400, f'{key} must be an object')
            section = changes.setdefault(key, {})
            for raw_child, child_value in value.items():
                child = fi.canonical_key(raw_child)
                if fi.path_of(child) != f'{key}.{child}':
                    unknown.append(f'{key}.{raw_child}')
                elif not _writable(child, owners, deal):
                    refused.append(f'{child} ({fi.owner_of(child)})')
                else:
                    section[child] = fi.legacy_value(child, child_value)
        elif fi.path_of(key) == key:
            if not _writable(key, owners, deal):
                refused.append(f'{key} ({fi.owner_of(key)})')
            else:
                changes[key] = fi.legacy_value(key, value)
        else:
            unknown.append(raw_key)

    if unknown:
        return None, (400, f'Unknown field(s): {_join(unknown)}')
    if refused:
        return None, (409, f'Field(s) owned by another source: {_join(refused)}')

    cleared = [k for k in fi.required_keys() if k in changes and not str(changes[k] or '').strip()]
    if cleared:
        return None, (400, f'Cannot clear required field(s): {_join(cleared)}')
    return changes, None


def apply_deal_write(deal, changes):
    for key, value in changes.items():
        if key in fi.SECTIONS:
            current = deal.get(key)
            deal[key] = {**(current if isinstance(current, dict) else {}), **value}
        else:
            deal[key] = value
