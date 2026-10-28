"""monday GraphQL client for the deal board: reads it whole, changes one status cell at a time, and adds rows."""
import json
import time

from core.features.integrations.monday import config, credentials, oauth

MAX_RETRIES = 3
SIGN_IN_AGAIN = 'Sign in to monday again (Settings → monday).'
_RETRY_CODES = frozenset({'COMPLEXITY_BUDGET_EXHAUSTED', 'RATE_LIMIT_EXCEEDED'})

_ITEM_FIELDS = ('id name created_at group { id title } column_values { id type text '
                '... on TimelineValue { from to } ... on StatusValue { updated_at } }')
_BOARD_QUERY = (
    'query ($board: [ID!]) { boards(ids: $board) { columns { id title type } groups { id title } '
    'items_page(limit: 500) { cursor items { ' + _ITEM_FIELDS + ' } } } }'
)
_NEXT_PAGE_QUERY = (
    'query ($cursor: String!) { next_items_page(cursor: $cursor, limit: 500) { cursor items { '
    + _ITEM_FIELDS + ' } } }'
)
_LABELS_QUERY = 'query ($board: [ID!], $columns: [String!]) { boards(ids: $board) { columns(ids: $columns) { id settings } } }'
_SCHEMA_QUERY = (
    'query ($board: [ID!], $columns: [String!]) { boards(ids: $board) { groups { id title } '
    'columns(ids: $columns) { id type settings } } }'
)
# create_labels_if_missing is true only when a TT Exec adds a new client; everything else must exist.
_CREATE_ITEM_MUTATION = (
    'mutation ($board: ID!, $group: String!, $name: String!, $values: JSON!, $create: Boolean!) { '
    'create_item(board_id: $board, group_id: $group, item_name: $name, column_values: $values, '
    'create_labels_if_missing: $create) { ' + _ITEM_FIELDS + ' } }'
)
# No create_labels_if_missing: monday refuses a label the column doesn't have instead of adding it.
_SET_LABEL_MUTATION = (
    'mutation ($board: ID!, $item: ID!, $column: String!, $values: JSON!) { '
    'change_multiple_column_values(board_id: $board, item_id: $item, column_values: $values) { '
    'id column_values(ids: [$column]) { id text } } }'
)
_NO_BOARD = 'The deal board was not found, or this monday account cannot see it.'


class MondayError(Exception):
    def __init__(self, kind, message):
        super().__init__(message)
        self.kind = kind


def _retry_seconds(status, errors, headers):
    codes = {(e.get('extensions') or {}).get('code') for e in errors if isinstance(e, dict)}
    if status != 429 and not codes & _RETRY_CODES:
        return None
    seconds = next((e['extensions']['retry_in_seconds'] for e in errors
                    if isinstance(e, dict) and (e.get('extensions') or {}).get('retry_in_seconds')), None)
    if seconds is None:
        seconds = next((value for key, value in (headers or {}).items() if key.lower() == 'retry-after'), None)
    try:
        seconds = float(seconds)
    except (TypeError, ValueError):
        seconds = 10.0
    return min(60.0, max(0.0, seconds))


def _call(get_token):
    try:
        return get_token()
    except oauth.NotConnected:
        raise MondayError('not_connected', SIGN_IN_AGAIN) from None
    except oauth.OAuthError:
        raise MondayError('network', 'Could not renew the monday sign-in. Try again in a minute.') from None


def graphql(query, variables=None, *, sleep=time.sleep):
    token = _call(oauth.access_token)
    payload = {'query': query, 'variables': variables or {}}
    refreshed, retries = False, 0
    while True:
        status, body, headers = oauth.post_json(config.API_URL, payload, oauth.api_headers(token))
        if status == 401:
            if refreshed:
                # Still refused after a fresh token: access was removed, so forget it and offer Connect.
                credentials.clear_token()
                raise MondayError('not_connected', SIGN_IN_AGAIN)
            stale = token
            token = _call(lambda: oauth.refresh(stale_token=stale))
            refreshed = True
            continue
        if status == 0:
            raise MondayError('network', 'Could not reach monday. Check your connection.')
        errors = body.get('errors') or []
        wait = _retry_seconds(status, errors, headers)
        if wait is not None:
            if retries == MAX_RETRIES:
                raise MondayError('rate_limited', 'monday is busy. Try again in a minute.')
            retries += 1
            sleep(wait)
            continue
        if errors:
            first = errors[0] if isinstance(errors[0], dict) else {}
            raise MondayError('api', first.get('message') or 'monday rejected the request.')
        if status != 200 or 'data' not in body:
            raise MondayError('api', f'monday answered with HTTP {status}.')
        return body['data'] or {}


def fetch_board():
    """Columns, groups and every row of the deal board, following monday's page cursor."""
    data = graphql(_BOARD_QUERY, {'board': [config.BOARD_ID]})
    boards = data.get('boards') or []
    if not boards:
        raise MondayError('api', _NO_BOARD)
    board = boards[0]
    page = board.get('items_page') or {}
    items = list(page.get('items') or [])
    cursor = page.get('cursor')
    while cursor:
        page = graphql(_NEXT_PAGE_QUERY, {'cursor': cursor}).get('next_items_page') or {}
        items.extend(page.get('items') or [])
        cursor = page.get('cursor')
    return {'columns': board.get('columns') or [], 'groups': board.get('groups') or [], 'items': items}


def _active_labels(column):
    labels = [label for label in (column.get('settings') or {}).get('labels') or []
              if str(label.get('label') or '').strip() and not label.get('is_deactivated')]
    return sorted(labels, key=lambda label: label['label'].casefold())


def status_labels(column_ids):
    """{column id: {label: label id}} for status and dropdown columns: their active labels, sorted by name."""
    data = graphql(_LABELS_QUERY, {'board': [config.BOARD_ID], 'columns': list(column_ids)})
    boards = data.get('boards') or []
    if not boards:
        raise MondayError('api', _NO_BOARD)
    return {column['id']: {label['label']: label['id'] for label in _active_labels(column)}
            for column in boards[0].get('columns') or []}


def board_schema(column_ids):
    """{'groups': [{id, title}], 'columns': {id: {'type', 'labels': [active labels, sorted]}}} for the given columns."""
    data = graphql(_SCHEMA_QUERY, {'board': [config.BOARD_ID], 'columns': list(column_ids)})
    boards = data.get('boards') or []
    if not boards:
        raise MondayError('api', _NO_BOARD)
    board = boards[0]
    # A name the board holds twice (people add duplicate clients) is offered once.
    columns = {column['id']: {'type': column.get('type'),
                              'labels': list(dict.fromkeys(label['label'] for label in _active_labels(column)))}
               for column in board.get('columns') or []}
    return {'groups': board.get('groups') or [], 'columns': columns}


def create_item(group_id, name, column_values, *, create_labels=False):
    """Add a row to the board; returns it shaped like a row from fetch_board."""
    data = graphql(_CREATE_ITEM_MUTATION, {
        'board': config.BOARD_ID, 'group': group_id, 'name': name,
        'values': json.dumps(column_values), 'create': bool(create_labels),
    })
    item = data.get('create_item')
    if not item or not item.get('id'):
        raise MondayError('api', 'monday did not confirm the new row.')
    return item


def set_status_label(item_id, column_id, label_id):
    """Set one row's status cell to an existing label (by its id); returns the cell's text as monday now has it."""
    data = graphql(_SET_LABEL_MUTATION, {
        'board': config.BOARD_ID, 'item': str(item_id), 'column': column_id,
        'values': json.dumps({column_id: {'index': label_id}}),
    })
    cells = (data.get('change_multiple_column_values') or {}).get('column_values') or []
    cell = next((c for c in cells if c.get('id') == column_id), None)
    if cell is None:
        raise MondayError('api', 'monday did not confirm the change.')
    return cell.get('text') or ''
