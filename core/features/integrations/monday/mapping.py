"""Board row -> deal values, driven by the monday blocks in shared/field_index.json."""
import re
from decimal import Decimal, InvalidOperation

from core.shared import field_index as fi

IGNORED_COLUMN_TYPES = frozenset({'subtasks', 'doc', 'direct_doc'})
_NUMBER_NOISE = re.compile(r'[^0-9.\-]')


def _scaled(text, scale):
    cleaned = _NUMBER_NOISE.sub('', text)
    try:
        value = Decimal(cleaned) * Decimal(scale)
    except InvalidOperation:
        return text
    return format(value.normalize(), 'f')


def _cell_value(cell, block):
    if not cell:
        return ''
    part = block.get('part')
    if part:
        return str(cell.get(part) or '')[:10]
    text = cell.get('text') or ''
    if text and block.get('scale'):
        return _scaled(text, block['scale'])
    return text


def item_values(item):
    """Every bound field for one board row, as the board has it ('' for an empty cell)."""
    cells = {cell.get('id'): cell for cell in item.get('column_values') or []}
    values = {}
    for key, block in fi.monday_bindings():
        source = block.get('source')
        if source == 'item_id':
            values[key] = str(item.get('id') or '')
        elif source == 'created_at':
            values[key] = str(item.get('created_at') or '')[:10]
        elif source == 'group':
            values[key] = (item.get('group') or {}).get('title') or ''
        elif block.get('column_id') == 'name':
            values[key] = item.get('name') or ''
        else:
            values[key] = _cell_value(cells.get(block.get('column_id')), block)
    return values


def unknown_columns(columns):
    """Board columns the field index doesn't bind yet (a developer adds them to the index)."""
    bound = {block.get('column_id') for _, block in fi.monday_bindings()}
    return [
        {'id': column.get('id'), 'title': column.get('title'), 'type': column.get('type')}
        for column in columns
        if column.get('id') not in bound and column.get('type') not in IGNORED_COLUMN_TYPES
    ]


def column_value(column_type, text):
    """A cell for a new row, written by label text (monday refuses a label it doesn't have unless asked to add it)."""
    if column_type == 'status':
        return {'label': text}
    if column_type == 'dropdown':
        return {'labels': [text]}
    if column_type == 'long_text':
        return {'text': text}
    return text


def writable_columns():
    """{field key: board column id} for the columns s0L may change (marked writable in the index)."""
    return {key: block['column_id'] for key, block in fi.monday_bindings() if block.get('writable')}
