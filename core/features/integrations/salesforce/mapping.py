"""Salesforce records -> deal values, driven by the salesforce blocks in shared/field_index.json."""
import re
from decimal import Decimal, InvalidOperation

from core.shared import field_index as fi

_PATH = re.compile(r'^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)?$')


def available_fields(describe):
    """The bound Opportunity fields this org lets the signed-in person read ('Account.Name' via the Account relationship)."""
    fields = describe('Opportunity').get('fields') or []
    names = {field.get('name') for field in fields}
    related = {field['relationshipName']: (field.get('referenceTo') or [None])[0]
               for field in fields if field.get('relationshipName')}
    described, available = {}, set()
    for _, block in fi.salesforce_bindings():
        path = block['field']
        if not _PATH.match(path):
            continue
        if '.' not in path:
            if path in names:
                available.add(path)
            continue
        relation, name = path.split('.', 1)
        target = related.get(relation)
        if not target:
            continue
        if target not in described:
            described[target] = {field.get('name') for field in describe(target).get('fields') or []}
        if name in described[target]:
            available.add(path)
    return available


def query_fields(available):
    return [block['field'] for _, block in fi.salesforce_bindings() if block['field'] in available]


def skipped_fields(available):
    """Bound fields this org doesn't have (or doesn't show this person), so the check leaves them out."""
    return [block['field'] for _, block in fi.salesforce_bindings() if block['field'] not in available]


def _text(value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (int, float)):
        try:
            return format(Decimal(str(value)).normalize(), 'f')
        except InvalidOperation:
            return str(value)
    return str(value)


def record_values(record, fields):
    """{key: text} for every bound field that was queried; '' for an empty one."""
    values = {}
    for key, block in fi.salesforce_bindings():
        if block['field'] not in fields:
            continue
        value = record
        for part in block['field'].split('.'):
            value = value.get(part) if isinstance(value, dict) else None
        values[key] = _text(value)
    return values
