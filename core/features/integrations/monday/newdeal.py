"""
A deal from s0L's New Deal form becomes one row on the monday board, then the linked s0L deal.
Every option must already be on the board, except a new client added by a TT Exec; people
who aren't TT Execs are the row's Lead SSC and assign nobody else.
"""
from core.shared import field_index as fi
from core.features.integrations.monday import identity, mapping

BOARD_KEYS = ('client_name', 'project_name', 'implementation_type', 'sector', 'industry', 'deal_type', 'currency')
PEOPLE_KEYS = ('lead_ssc', 'tt_executive', 'solution_consultant_2', 'solution_consultant_3')
REQUIRED = ('opportunity_number', 'client_name', 'project_name')
BOUND_KEYS = frozenset(key for key, _ in fi.monday_bindings())
_CLIENT, _LEAD = 'client_name', 'lead_ssc'
_LISTED = frozenset({'status', 'dropdown'})


class Refused(Exception):
    def __init__(self, status, message, kind='refused'):
        super().__init__(message)
        self.status = status
        self.kind = kind


def _column_ids(keys):
    bindings = dict(fi.monday_bindings())
    return {key: bindings[key]['column_id'] for key in keys}


def _label(text, labels):
    wanted = text.casefold()
    return next((label for label in labels if label.strip().casefold() == wanted), None)


def _title(key):
    return fi.FIELDS[key]['label']


def schema_columns():
    """The columns the form reads options from or writes, plus the name columns that say who's filling it in."""
    return sorted(set(_column_ids(BOARD_KEYS).values()) | set(identity.name_columns().values()))


def name_labels(schema):
    return {key: schema['columns'].get(column_id, {}).get('labels', [])
            for key, column_id in identity.name_columns().items()}


def options(schema):
    """{field key: the board's labels} for the form's list fields and the people it may assign."""
    keys = {**_column_ids(BOARD_KEYS), **_column_ids(PEOPLE_KEYS)}
    return {key: schema['columns'][column_id]['labels'] for key, column_id in keys.items()
            if schema['columns'].get(column_id, {}).get('type') in _LISTED}


def missing_required(values):
    return [key for key in REQUIRED if not str(values.get(key) or '').strip()]


def group_id(schema, title):
    found = next((group['id'] for group in schema['groups'] if group.get('title') == title), None)
    if not found:
        raise Refused(400, 'Pick a practice from the board.')
    return found


def plan_row(values, people, me, schema):
    """(column values for create_item, whether the new client may be added as a label). Raises Refused."""
    cells, add_client = {}, False
    for key, column_id in _column_ids(BOARD_KEYS).items():
        text = str(values.get(key) or '').strip()
        column = schema['columns'].get(column_id)
        if not text or column is None:
            continue
        if column['type'] in _LISTED:
            label = _label(text, column['labels'])
            if label is None and key != _CLIENT:
                raise Refused(400, f'"{text}" is not one of the board\'s {_title(key)} options.')
            if label is None and not me['is_exec']:
                raise Refused(400, f'"{text}" is not on the board\'s client list. Pick a client from the list; '
                                   'only TT Execs can add a new one.')
            if label is None:
                label, add_client = text, True
            text = label
        cells[column_id] = mapping.column_value(column['type'], text)

    chosen = ({key: str(people.get(key) or '').strip() for key in PEOPLE_KEYS}
              if me['is_exec'] else {_LEAD: me['name']})
    for key, column_id in _column_ids(PEOPLE_KEYS).items():
        text = chosen.get(key, '')
        if not text:
            continue
        column = schema['columns'].get(column_id) or {'type': 'status', 'labels': []}
        label = _label(text, column['labels'])
        if label is None and not me['is_exec']:
            raise Refused(409, f'"{text}" is not in the board\'s Lead SSC list, so s0L can\'t add you as Lead SSC. '
                               'Ask a TT Exec to add this deal.')
        if label is None:
            raise Refused(400, f'"{text}" is not one of the names in the board\'s {_title(key)} column.')
        cells[column_id] = mapping.column_value(column['type'], label)
    return cells, add_client
