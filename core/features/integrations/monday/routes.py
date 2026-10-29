"""
monday blueprint: sign-in, status, syncing the deal board into s0L, changing
the people columns s0L may write, and fixing a cell where Salesforce shows the
board is wrong. Localhost-only; no response ever contains a token or the app secret.
"""
import webbrowser
from datetime import datetime, timezone
from urllib.parse import urlencode

from flask import Blueprint, jsonify, redirect, request

from core.shared import field_index as fi
from core.shared import reconcile
from core.shared.security import is_local_host, parse_frontend_origins
from core.shared.state import SYNC_LOCK, get_deal_by_id, load_data, next_string_id, save_data
from core.features.deals.services import build_new_deal
from core.features.deals.writes import prepare_deal_write
from core.features.integrations.monday import client, config, identity, mapping, newdeal, oauth, sync
from core.features.integrations.monday.writer import write_monday_fields

monday_blueprint = Blueprint('monday', __name__)

_ERROR_STATUS = {'not_connected': 401, 'rate_limited': 429}
_NEEDS_WRITE = 'This monday sign-in may not change the board. Click the monday icon at the top to connect again.'
_sync_lock = SYNC_LOCK


@monday_blueprint.before_request
def _only_local_hosts():
    if not is_local_host(request.host):
        return jsonify({'error': 'Forbidden host'}), 403
    return None


def _frontend(**params):
    return f'{parse_frontend_origins()[0]}/?{urlencode(params)}'


def _json_only():
    # JSON bodies force a CORS preflight, so other sites can't trigger these routes.
    if not request.is_json:
        return jsonify({'error': 'Expected a JSON request'}), 415
    return None


def _unless_board_writable():
    state = oauth.status()
    if not state['connected']:
        return jsonify({'error': client.SIGN_IN_AGAIN, 'kind': 'not_connected'}), 401
    if not state['can_write']:
        return jsonify({'error': _NEEDS_WRITE, 'kind': 'needs_write'}), 403
    return None


def _monday_failed(error):
    return jsonify({'error': str(error), 'kind': error.kind}), _ERROR_STATUS.get(error.kind, 502)


def _unless_connected():
    if not oauth.status()['connected']:
        return jsonify({'error': client.SIGN_IN_AGAIN, 'kind': 'not_connected'}), 401
    return None


def _name_labels(extra_columns=()):
    """({field key: names} for the name columns, {column id: {label: label id}} for those plus any extra columns)."""
    columns = identity.name_columns()
    labels = client.status_labels(sorted(set(columns.values()) | set(extra_columns)))
    return {key: list(labels.get(column_id, {})) for key, column_id in columns.items()}, labels


@monday_blueprint.route('/api/monday/me', methods=['GET'])
def who_am_i():
    """The signed-in person's board name (picked once), whether they are a TT Exec, and the names to pick from."""
    refused = _unless_connected()
    if refused:
        return refused
    try:
        email = identity.signed_in_email()
        by_key, _ = _name_labels()
    except client.MondayError as error:
        return _monday_failed(error)
    return jsonify(identity.who(load_data().get('preferences'), email, by_key))


@monday_blueprint.route('/api/monday/me', methods=['PUT'])
def remember_me():
    refused = _json_only() or _unless_connected()
    if refused:
        return refused
    name = str((request.get_json(silent=True) or {}).get('name') or '').strip()
    try:
        email = identity.signed_in_email()
        by_key, _ = _name_labels()
    except client.MondayError as error:
        return _monday_failed(error)
    if name not in identity.board_names(by_key):
        return jsonify({'error': 'Pick your name from the names on the board.'}), 400
    with _sync_lock:
        data = load_data()
        data['preferences'] = identity.remember(data.get('preferences'), email, name)
        save_data(data)
    return jsonify(identity.who(data['preferences'], email, by_key))


@monday_blueprint.route('/api/monday/status', methods=['GET'])
def monday_status():
    return jsonify({**oauth.status(), 'last_sync': sync.last_sync(load_data()), 'board_url': config.BOARD_URL})


@monday_blueprint.route('/api/monday/connect', methods=['GET'])
def connect():
    try:
        return redirect(oauth.begin())
    except oauth.OAuthError as error:
        return redirect(_frontend(monday='error', reason=error.reason))


@monday_blueprint.route('/api/monday/connect', methods=['POST'])
def connect_in_browser():
    """Open monday's sign-in in the default browser (monday blocks VS Code's built-in browser)."""
    refused = _json_only()
    if refused:
        return refused
    try:
        url = oauth.begin()
    except oauth.OAuthError as error:
        return jsonify({'error': 'monday is not set up on this computer yet.', 'reason': error.reason}), 409
    return jsonify({'opened': bool(webbrowser.open(url)), 'url': url})


@monday_blueprint.route('/api/monday/oauth/callback', methods=['GET'])
def oauth_callback():
    if request.args.get('error'):
        return redirect(_frontend(monday='error', reason='denied'))
    try:
        oauth.finish(request.args.get('state', ''), request.args.get('code', ''))
    except oauth.OAuthError as error:
        return redirect(_frontend(monday='error', reason=error.reason))
    return redirect(_frontend(monday='connected'))


@monday_blueprint.route('/api/monday/disconnect', methods=['POST'])
def disconnect():
    refused = _json_only()
    if refused:
        return refused
    oauth.sign_out()
    return jsonify({'connected': False})


@monday_blueprint.route('/api/monday/sync', methods=['POST'])
def sync_now():
    refused = _json_only()
    if refused:
        return refused
    dry_run = bool((request.get_json(silent=True) or {}).get('dry_run'))
    with _sync_lock:
        try:
            board = client.fetch_board()
        except client.MondayError as error:
            return _monday_failed(error)
        data = load_data()
        summary = sync.sync_board(data, board, now_iso=datetime.now(timezone.utc).isoformat())
        if not dry_run:
            save_data(data)
    return jsonify({**summary, 'dry_run': dry_run})


@monday_blueprint.route('/api/monday/people', methods=['GET'])
def people():
    """The names each column s0L may change offers on the board."""
    refused = _unless_board_writable()
    if refused:
        return refused
    columns = mapping.writable_columns()
    try:
        labels = client.status_labels(columns.values())
    except client.MondayError as error:
        return _monday_failed(error)
    return jsonify({'columns': {key: list(labels.get(column_id, {})) for key, column_id in columns.items()}})


@monday_blueprint.route('/api/monday/assign', methods=['POST'])
def assign():
    """Put a name the column already has into a deal's board row, then store what the board shows."""
    refused = _json_only() or _unless_board_writable()
    if refused:
        return refused
    body = request.get_json(silent=True) or {}
    key, name = body.get('key'), str(body.get('name') or '')
    column_id = mapping.writable_columns().get(key)
    if not column_id:
        return jsonify({'error': 'That column cannot be changed from s0L.'}), 400
    if not name.strip():
        return jsonify({'error': 'Pick a name.'}), 400
    with _sync_lock:
        data = load_data()
        deal = get_deal_by_id(data, body.get('deal_id'))
        if deal is None:
            return jsonify({'error': 'Deal not found'}), 404
        if not deal.get('monday_item_id'):
            return jsonify({'error': 'This deal is not on the monday board.'}), 409
        try:
            email = identity.signed_in_email()
            by_key, labels = _name_labels()
            if not identity.who(data.get('preferences'), email, by_key)['is_exec']:
                return jsonify({'error': 'Only TT Execs can assign people to deals.', 'kind': 'not_exec'}), 403
            label_id = labels.get(column_id, {}).get(name)
            if label_id is None:
                return jsonify({'error': f'{name} is not one of the names in that board column.'}), 400
            text = client.set_status_label(deal['monday_item_id'], column_id, label_id)
        except client.MondayError as error:
            return _monday_failed(error)
        write_monday_fields(deal, {key: text})
        save_data(data)
    return jsonify(deal)


@monday_blueprint.route('/api/monday/fix', methods=['POST'])
def fix_from_salesforce():
    """A TT Exec approves a Salesforce difference: the board takes the value, then s0L stores what the board shows."""
    refused = _json_only() or _unless_board_writable()
    if refused:
        return refused
    body = request.get_json(silent=True) or {}
    key = str(body.get('key') or '')
    with _sync_lock:
        data = load_data()
        deal = get_deal_by_id(data, body.get('deal_id'))
        if deal is None:
            return jsonify({'error': 'Deal not found'}), 404
        if not deal.get('monday_item_id'):
            return jsonify({'error': 'This deal is not on the monday board.'}), 409
        value = reconcile.board_fix(deal, key)
        if value is None:
            return jsonify({'error': "s0L can't fix this one from Salesforce. Look into it on the board."}), 409
        column_id = fi.FIELDS[key]['monday']['column_id']
        try:
            email = identity.signed_in_email()
            by_key, _ = _name_labels()
            if not identity.who(data.get('preferences'), email, by_key)['is_exec']:
                return jsonify({'error': 'Only TT Execs can change the board from Salesforce.', 'kind': 'not_exec'}), 403
            if column_id == 'name':
                text = client.set_cell(deal['monday_item_id'], 'name', value)
            else:
                column = client.board_schema([column_id])['columns'].get(column_id) or {}
                if column.get('type') in ('status', 'dropdown') and value not in column.get('labels', []):
                    return jsonify({'error': f'The board has no “{value}” option in that column. Look into it on the board.'}), 409
                text = client.set_cell(deal['monday_item_id'], column_id, mapping.column_value(column.get('type'), value))
        except client.MondayError as error:
            return _monday_failed(error)
        write_monday_fields(deal, {key: text})
        save_data(data)
    return jsonify(deal)


@monday_blueprint.route('/api/monday/new-deal', methods=['GET'])
def new_deal_options():
    """The board's practices and option lists for the New Deal form, and who is filling it in."""
    refused = _unless_connected()
    if refused:
        return refused
    try:
        email = identity.signed_in_email()
        schema = client.board_schema(newdeal.schema_columns())
    except client.MondayError as error:
        return _monday_failed(error)
    me = identity.who(load_data().get('preferences'), email, newdeal.name_labels(schema))
    return jsonify({'groups': [group['title'] for group in schema['groups']],
                    'options': newdeal.options(schema), 'me': me})


@monday_blueprint.route('/api/monday/deals', methods=['POST'])
def add_deal():
    """Add a deal to the board as a new row, then to s0L, linked to that row."""
    refused = _json_only() or _unless_board_writable()
    if refused:
        return refused
    body = request.get_json(silent=True) or {}
    values, people, extras = (body.get(part) if isinstance(body.get(part), dict) else {}
                              for part in ('values', 'people', 'deal'))
    if any(fi.canonical_key(key) in newdeal.BOUND_KEYS for key in extras):
        return jsonify({'error': 'Board fields belong in values.'}), 400
    changes, error = prepare_deal_write({}, extras, owners={'deal'})
    if error:
        return jsonify({'error': error[1]}), error[0]
    missing = newdeal.missing_required(values)
    if missing:
        return jsonify({'error': f'Missing required fields: {", ".join(missing)}'}), 400
    number = str(values['opportunity_number']).strip()
    if any(deal.get('opportunity_number') == number for deal in load_data()['deals']):
        return jsonify({'error': f'Opportunity number {number} already exists'}), 409

    try:
        email = identity.signed_in_email()
        schema = client.board_schema(newdeal.schema_columns())
        me = identity.who(load_data().get('preferences'), email, newdeal.name_labels(schema))
        if not me['name']:
            raise newdeal.Refused(409, 'Pick your name on the board first.', 'needs_name')
        group_id = newdeal.group_id(schema, str(body.get('group') or ''))
        cells, add_client = newdeal.plan_row(values, people, me, schema)
        item = client.create_item(group_id, number, cells, create_labels=add_client)
    except newdeal.Refused as refusal:
        return jsonify({'error': str(refusal), 'kind': refusal.kind}), refusal.status
    except client.MondayError as error:
        return _monday_failed(error)

    with _sync_lock:
        data = load_data()
        deal = build_new_deal(next_string_id(data['deals']), changes, data=data)
        write_monday_fields(deal, mapping.item_values(item), synced_at=datetime.now(timezone.utc).isoformat())
        data['deals'].append(deal)
        save_data(data)
    return jsonify(deal)
