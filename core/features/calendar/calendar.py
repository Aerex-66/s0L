import json
import os
import time

from flask import Blueprint, jsonify

from core.shared import state

calendar_blueprint = Blueprint('calendar', __name__)


def cache_file():
    return os.path.join(state.DATA_ROOT, 'outlook_calendar_cache.json')


@calendar_blueprint.route('/api/calendar/outlook', methods=['GET'])
def get_outlook_events():
    """Read Outlook events from the cache written by the Outlook sync (outlook_sync.py or outlook_calendar.ps1)."""
    path = cache_file()
    if not os.path.isfile(path):
        packaged = os.environ.get('S0L_OUTLOOK_SYNC') == '1'
        return jsonify({
            'status': 'no_sync',
            'events': [],
            'message': ('Waiting for Outlook. Your calendar appears while classic Outlook is installed.'
                        if packaged else 'Outlook sync not running. Launch outlook_calendar.ps1 in a terminal.')
        })

    try:
        age = time.time() - os.path.getmtime(path)
        # utf-8-sig: Windows PowerShell 5.1 (outlook_calendar.ps1) writes a BOM that json.loads rejects.
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
