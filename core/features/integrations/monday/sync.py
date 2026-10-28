"""
Board rows -> s0L deals. The board wins: monday-owned values are stored exactly
as the board has them. One deal per row, keyed by monday item id.
"""
import re

from core.shared import field_index as fi
from core.shared.state import next_string_id
from core.features.deals.services import build_new_deal
from core.features.integrations.monday import mapping
from core.features.integrations.monday.writer import write_monday_fields

_SALESFORCE_ID = re.compile(r'^006[A-Za-z0-9]{15}$')
_ROW_KEYS = frozenset({'monday_item_id', 'monday_group'})


def _text(value):
    return '' if value is None else str(value)


def _differs(deal, values):
    return any(_text(deal.get(key)) != value for key, value in values.items())


def _replaced(deal, values):
    return [
        {'deal_id': deal.get('id'), 'key': key, 'label': fi.FIELDS[key]['label'], 'old': _text(deal.get(key))}
        for key, value in values.items()
        if key not in _ROW_KEYS and _text(deal.get(key)) and _text(deal.get(key)) != value
    ]


def last_sync(data):
    stamps = [d.get('monday_synced_at') for d in data.get('deals', []) if d.get('monday_synced_at')]
    return max(stamps) if stamps else None


def sync_board(data, board, *, now_iso):
    """Create, update, link and flag deals from a fetched board. Mutates `data`; returns a summary."""
    deals = data.setdefault('deals', [])
    rows = [(str(item.get('id')), mapping.item_values(item)) for item in board.get('items') or []]

    rows_by_name = {}
    for item_id, values in rows:
        rows_by_name.setdefault(values['opportunity_number'], []).append(item_id)

    linked = {str(d['monday_item_id']): d for d in deals if d.get('monday_item_id')}
    unlinked_by_number = {}
    for deal in deals:
        if not deal.get('monday_item_id') and deal.get('opportunity_number'):
            unlinked_by_number.setdefault(deal['opportunity_number'], []).append(deal)

    summary = {
        'created': 0, 'updated': 0, 'linked': 0, 'unchanged': 0, 'gone': 0, 'replaced': [],
        'duplicates': [
            {'opportunity_number': name, 'item_ids': ids}
            for name, ids in rows_by_name.items() if name and len(ids) > 1
        ],
        'plain_text_names': [
            {'item_id': item_id, 'name': values['opportunity_number']}
            for item_id, values in rows if not _SALESFORCE_ID.match(values['opportunity_number'])
        ],
        'unknown_columns': mapping.unknown_columns(board.get('columns') or []),
    }

    next_id = int(next_string_id(deals))
    seen = set()
    for item_id, values in rows:
        seen.add(item_id)
        deal = linked.get(item_id)
        if deal is not None:
            changed = _differs(deal, values) or bool(deal.get('monday_missing_since'))
            write_monday_fields(deal, values, synced_at=now_iso)
            summary['updated' if changed else 'unchanged'] += 1
            continue

        name = values['opportunity_number']
        candidates = unlinked_by_number.get(name, []) if name and len(rows_by_name[name]) == 1 else []
        if len(candidates) == 1:
            deal = candidates[0]
            summary['replaced'].extend(_replaced(deal, values))
            write_monday_fields(deal, values, synced_at=now_iso)
            unlinked_by_number.pop(name)
            linked[item_id] = deal
            summary['linked'] += 1
            continue

        deal = build_new_deal(str(next_id), {}, data=data)
        next_id += 1
        write_monday_fields(deal, values, synced_at=now_iso)
        deals.append(deal)
        linked[item_id] = deal
        summary['created'] += 1

    for item_id, deal in linked.items():
        if item_id not in seen and not deal.get('monday_missing_since'):
            deal['monday_missing_since'] = now_iso
            summary['gone'] += 1
    return summary
