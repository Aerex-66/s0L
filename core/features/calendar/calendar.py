import json
import os
import time

from flask import Blueprint, jsonify

calendar_blueprint = Blueprint('calendar', __name__)

_CACHE_FILE = os.path.join(
    os.path.dirname(__file__), '..', '..', '..', 'outlook_calendar_cache.json'
)
_CACHE_FILE = os.path.normpath(_CACHE_FILE)


@calendar_blueprint.route('/api/calendar/outlook', methods=['GET'])
def get_outlook_events():
    """Read Outlook events from the cache file written by outlook_calendar.ps1."""
    if not os.path.isfile(_CACHE_FILE):
        return jsonify({
            'status': 'no_sync',
            'events': [],
            'message': 'Outlook sync not running. Launch outlook_calendar.ps1 in a terminal.'
        })

    try:
        age = time.time() - os.path.getmtime(_CACHE_FILE)
        with open(_CACHE_FILE, 'r', encoding='utf-8') as f:
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
