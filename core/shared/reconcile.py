"""
Where the monday board and Salesforce disagree about a deal, and the board value
an approved fix writes. Works only on stored deal values, so the Salesforce
differences list and monday's fix route always agree.
"""
from core.shared import field_index as fi
from core.shared.opportunity_ids import parse_cell

_NUMBER = 'opportunity_number'


def _same(a, b):
    return ' '.join(str(a or '').split()).casefold() == ' '.join(str(b or '').split()).casefold()


def _writable_on_board(key):
    block = (fi.FIELDS.get(key) or {}).get('monday') or {}
    return bool(block.get('column_id')) and not block.get('scale') and not block.get('part')


def _row(deal, kind, key, board, salesforce, fix=None):
    return {'deal_id': deal.get('id'), 'kind': kind, 'key': key, 'label': fi.FIELDS[key]['label'],
            'board': board, 'salesforce': salesforce, 'fix': fix, 'fixable': fix is not None}


def _value_rows(deal):
    rows = []
    for pair in fi.compare_pairs():
        theirs = str(deal.get(pair['key']) or '').strip()
        if not theirs:
            continue
        ours = str(deal.get(pair['with']) or '').strip()
        # The translation table is the opt-in: without the board's own word, a difference is investigate-only.
        word = (pair.get('labels') or {}).get(theirs)
        if _same(word or theirs, ours):
            continue
        fix = word if word and _writable_on_board(pair['with']) else None
        rows.append(_row(deal, 'value', pair['with'], ours, theirs, fix))
    return rows


def differences(deal):
    """Rows {deal_id, kind, key, label, board, salesforce, fix, fixable} for a checked deal still on the board."""
    lookup = deal.get('salesforce_lookup')
    if not lookup or not deal.get('monday_item_id') or deal.get('monday_missing_since'):
        return []
    cell = str(deal.get(_NUMBER) or '').strip()
    kind, canonical = parse_cell(cell)
    if kind in ('not_an_id', 'two_ids'):
        return [_row(deal, kind, _NUMBER, cell, '')]
    rows = []
    if kind == 'id_with_text':
        rows.append(_row(deal, 'extra_text', _NUMBER, cell, canonical))
    if lookup == 'not_returned':
        rows.append(_row(deal, 'not_returned', _NUMBER, cell, ''))
    elif lookup == 'found' and deal.get('salesforce_id') == canonical:
        if kind == 'id' and cell != canonical:
            rows.append(_row(deal, 'full_id', _NUMBER, cell, canonical, canonical))
        rows.extend(_value_rows(deal))
    return rows


def board_fix(deal, key):
    """The board value an approved fix writes for this deal's field; None when s0L can't fix it from Salesforce."""
    return next((row['fix'] for row in differences(deal) if row['key'] == key and row['fix']), None)
