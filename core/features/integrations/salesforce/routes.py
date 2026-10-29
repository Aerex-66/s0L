"""
Salesforce blueprint: sign-in, status, the check of the board's deals against
their opportunities, and the differences the TT Exec view lists. Localhost-only;
no response ever contains a token.
"""
import webbrowser
from datetime import datetime, timezone
from urllib.parse import urlencode

from flask import Blueprint, jsonify, redirect, request

from core.shared import reconcile
from core.shared.opportunity_ids import parse_cell
from core.shared.security import is_local_host, parse_frontend_origins
from core.shared.state import SYNC_LOCK, load_data, save_data
from core.features.integrations.salesforce import check, client, mapping, oauth

salesforce_blueprint = Blueprint('salesforce', __name__)

_ERROR_STATUS = {'not_connected': 401, 'no_api': 403, 'rate_limited': 429}


@salesforce_blueprint.before_request
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


def _failed(error):
    return jsonify({'error': str(error), 'kind': error.kind}), _ERROR_STATUS.get(error.kind, 502)


@salesforce_blueprint.route('/api/salesforce/status', methods=['GET'])
def salesforce_status():
    return jsonify({**oauth.status(), 'last_check': check.last_check(load_data())})


@salesforce_blueprint.route('/api/salesforce/connect', methods=['GET'])
def connect():
    try:
        return redirect(oauth.begin())
    except oauth.OAuthError as error:
        return redirect(_frontend(salesforce='error', reason=error.reason))


@salesforce_blueprint.route('/api/salesforce/connect', methods=['POST'])
def connect_in_browser():
    """Open Salesforce's sign-in in the default browser."""
    refused = _json_only()
    if refused:
        return refused
    try:
        url = oauth.begin()
    except oauth.OAuthError as error:
        return jsonify({'error': "Salesforce isn't set up on this computer yet.", 'reason': error.reason}), 409
    return jsonify({'opened': bool(webbrowser.open(url)), 'url': url})


@salesforce_blueprint.route('/api/salesforce/oauth/callback', methods=['GET'])
def oauth_callback():
    if request.args.get('error'):
        return redirect(_frontend(salesforce='error', reason=oauth.callback_reason(request.args['error'])))
    try:
        oauth.finish(request.args.get('state', ''), request.args.get('code', ''))
    except oauth.OAuthError as error:
        return redirect(_frontend(salesforce='error', reason=error.reason))
    return redirect(_frontend(salesforce='connected'))


@salesforce_blueprint.route('/api/salesforce/disconnect', methods=['POST'])
def disconnect():
    refused = _json_only()
    if refused:
        return refused
    oauth.sign_out()
    return jsonify({'connected': False})


@salesforce_blueprint.route('/api/salesforce/check', methods=['POST'])
def check_now():
    """Look every board deal up in Salesforce and store what it says."""
    refused = _json_only()
    if refused:
        return refused
    with SYNC_LOCK:
        try:
            available = mapping.available_fields(client.describe)
            fields = mapping.query_fields(available)
            ids = check.board_ids(load_data())
            found = {record.get('Id'): mapping.record_values(record, fields)
                     for record in (client.opportunities(ids, fields) if ids else [])}
        except client.SalesforceError as error:
            return _failed(error)
        # Reload after Salesforce answers, so deal edits saved meanwhile are kept.
        data = load_data()
        summary = check.check_deals(data, found, now_iso=datetime.now(timezone.utc).isoformat())
        save_data(data)
    return jsonify({**summary, 'skipped_fields': mapping.skipped_fields(available)})


@salesforce_blueprint.route('/api/salesforce/differences', methods=['GET'])
def list_differences():
    """Where the board and Salesforce disagree, worked out from the stored values (never stored itself)."""
    data = load_data()
    try:
        origin = oauth.instance_url()
    except oauth.NotConnected:
        origin = None
    rows = []
    for deal in data.get('deals', []):
        _, current = parse_cell(deal.get('opportunity_number'))
        # Link only the opportunity the board's cell names now, never an earlier one.
        found = deal.get('salesforce_id') if deal.get('salesforce_lookup') == 'found' else None
        url = f'{origin}/{found}' if origin and found and found == current else None
        rows.extend({**row, 'record_url': url} for row in reconcile.differences(deal))
    return jsonify({'differences': rows, 'last_check': check.last_check(data)})
