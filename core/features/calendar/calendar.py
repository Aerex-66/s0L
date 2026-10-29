import json
import os
import time

from flask import Blueprint, jsonify

from core.shared import outlook_app, state

calendar_blueprint = Blueprint('calendar', __name__)

_MESSAGES = {
    'web': "You use Outlook in the browser, so s0L can't show your Outlook calendar here.",
    'no_app': ("s0L can't find the Outlook app on this computer. Pick Outlook in the browser from "
               'the Outlook icon at the top.'),
    'waiting': 'Open Outlook and your calendar appears here within a minute.',
}


def cache_file():
    return os.path.join(state.DATA_ROOT, 'outlook_calendar_cache.json')


def _empty(status):
    return jsonify({'status': status, 'events': [], 'message': _MESSAGES[status]})


@calendar_blueprint.route('/api/calendar/outlook', methods=['GET'])
def get_outlook_events():
    """Outlook events from the cache the calendar reader writes (core/features/calendar/outlook_sync.py)."""
    if outlook_app.effective_mode(state.load_data().get('preferences')) == 'web':
        return _empty('web')
    if not outlook_app.usable():
        return _empty('no_app')
    path = cache_file()
    if not os.path.isfile(path):
        return _empty('waiting')

    try:
        age = time.time() - os.path.getmtime(path)
        # utf-8-sig: a cache left by the old PowerShell reader starts with a BOM that json.loads rejects.
        with open(path, 'r', encoding='utf-8-sig') as f:
            raw = f.read().strip()
    except Exception as e:
        return jsonify({'status': 'error', 'events': [], 'message': str(e)}), 500

    if not raw:
        return jsonify({'status': 'empty', 'events': [], 'message': 'Cache file is empty'})

    try:
        events = json.loads(raw)
    except json.JSONDecodeError:
        return jsonify({'status': 'error', 'events': [], 'message': 'Invalid cache JSON'}), 502

    if isinstance(events, dict):
        events = [events]

    return jsonify({
        'status': 'ok',
        'events': events,
        'age_seconds': round(age),
    })
