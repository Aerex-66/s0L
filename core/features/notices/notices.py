"""
Notices: short reminders a TT Exec posts for the team, shown as the banner at the top of s0L.
For now they live in this computer's deals_data.json (newest first).
"""
import secrets
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from core.shared.security import is_local_host
from core.shared.state import load_data, save_data
from core.features.integrations.monday import client, identity

notices_blueprint = Blueprint('notices', __name__)

MAX_LENGTH = 500
_ERROR_STATUS = {'not_connected': 401, 'rate_limited': 429}


@notices_blueprint.before_request
def _only_local_hosts():
    if not is_local_host(request.host):
        return jsonify({'error': 'Forbidden host'}), 403
    return None


def _unless_exec():
    """(me, None) when the signed-in monday person is a TT Exec, else (None, the refusal to send back)."""
    try:
        me = identity.me(load_data().get('preferences'))
    except client.MondayError as error:
        return None, (jsonify({'error': str(error), 'kind': error.kind}), _ERROR_STATUS.get(error.kind, 502))
    if not me.get('is_exec'):
        return None, (jsonify({'error': 'Only TT Execs post notices.', 'kind': 'not_exec'}), 403)
    return me, None


@notices_blueprint.route('/api/notices', methods=['GET'])
def list_notices():
    return jsonify({'notices': load_data().get('notices', [])})


@notices_blueprint.route('/api/notices', methods=['POST'])
def post_notice():
    # JSON bodies force a CORS preflight, so other sites can't post here.
    if not request.is_json:
        return jsonify({'error': 'Expected a JSON request'}), 415
    text = str((request.get_json(silent=True) or {}).get('text') or '').strip()
    if not text:
        return jsonify({'error': 'Write the notice first.'}), 400
    if len(text) > MAX_LENGTH:
        return jsonify({'error': f'Keep a notice to {MAX_LENGTH} characters.'}), 400
    me, refused = _unless_exec()
    if refused:
        return refused
    notice = {'id': secrets.token_hex(6), 'text': text, 'author': me.get('name') or '',
              'created_at': datetime.now(timezone.utc).isoformat()}
    data = load_data()
    data['notices'] = [notice, *data.get('notices', [])]
    save_data(data)
    return jsonify(notice), 201


@notices_blueprint.route('/api/notices/<notice_id>', methods=['DELETE'])
def remove_notice(notice_id):
    _, refused = _unless_exec()
    if refused:
        return refused
    data = load_data()
    notices = data.get('notices', [])
    kept = [notice for notice in notices if notice.get('id') != notice_id]
    if len(kept) == len(notices):
        return jsonify({'error': 'Notice not found'}), 404
    data['notices'] = kept
    save_data(data)
    return jsonify({'removed': notice_id})
