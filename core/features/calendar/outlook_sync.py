"""
Outlook calendar sync, in development and the packaged app alike: every minute it
reads the default calendar of the classic Outlook app that's already open (never
starting Outlook) and writes the cache the calendar route reads. Nothing is read
in browser mode.
"""
import json
import logging
import os
import tempfile
import threading
import time
from datetime import datetime, timedelta

from core.shared import outlook_app
from core.shared.state import load_data

_logger = logging.getLogger(__name__)

_OL_FOLDER_CALENDAR = 9
_MAX_EVENTS = 5000
_TIME_FORMAT = '%Y-%m-%dT%H:%M:%S'


def _restrict_filter(now, days_before, days_after):
    start = (now - timedelta(days=days_before)).strftime('%m/%d/%Y %H:%M')
    end = (now + timedelta(days=days_after)).strftime('%m/%d/%Y %H:%M')
    return f"[Start] >= '{start}' AND [Start] <= '{end}'"


def read_outlook_events(outlook, now, days_before=7, days_after=60):
    items = outlook.GetNamespace('MAPI').GetDefaultFolder(_OL_FOLDER_CALENDAR).Items
    items.Sort('[Start]')
    items.IncludeRecurrences = True
    found = items.Restrict(_restrict_filter(now, days_before, days_after))
    events = []
    item = found.GetFirst()
    while item is not None and len(events) < _MAX_EVENTS:
        try:
            if item.Subject is not None:
                events.append({
                    'subject': str(item.Subject),
                    'start': item.Start.strftime(_TIME_FORMAT),
                    'end': item.End.strftime(_TIME_FORMAT),
                    'location': str(item.Location or ''),
                    'isAllDay': bool(item.AllDayEvent),
                    'categories': str(item.Categories or ''),
                    'organizer': str(item.Organizer or ''),
                    'busyStatus': int(item.BusyStatus),
                })
        except Exception:  # one unreadable item (e.g. a damaged meeting) doesn't stop the read
            pass
        item = found.GetNext()
    return events


def write_cache(events, path):
    folder = os.path.dirname(os.path.abspath(path))
    os.makedirs(folder, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(suffix='.json', dir=folder)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(events, handle)
        os.replace(temp_path, path)
    except Exception:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        raise


def start_outlook_sync(cache_file, interval=60):
    thread = threading.Thread(target=_sync_forever, args=(cache_file, interval), name='outlook-sync', daemon=True)
    thread.start()
    return thread


def _preferences():
    return load_data().get('preferences') or {}


def sync_once(cache_file):
    """One read: 'web' (the person uses Outlook in the browser), 'closed' (Outlook isn't open) or 'ok'."""
    if outlook_app.effective_mode(_preferences()) != 'app':
        return 'web'
    outlook = outlook_app.running_app()
    if outlook is None:
        return 'closed'
    write_cache(read_outlook_events(outlook, datetime.now()), cache_file)
    return 'ok'


def _sync_forever(cache_file, interval):
    with outlook_app.com_thread():
        failing = False
        while True:
            try:
                sync_once(cache_file)
                failing = False
            except Exception as exc:
                if not failing:
                    _logger.warning('Outlook calendar read failed: %s', exc)
                failing = True
            time.sleep(interval)
