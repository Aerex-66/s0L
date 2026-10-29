import json
import os
import shutil
import tempfile
import threading
from datetime import datetime

from core.shared.defaults import DEFAULT_APPROVERS, APPROVER_KEY_META
from core.shared.migrations import migrate_store


def resolve_data_root(environ):
    """Where deals, documents and caches live: S0L_DATA_DIR in the packaged app, else the repo root."""
    configured = (environ.get('S0L_DATA_DIR') or '').strip()
    if configured:
        return os.path.abspath(configured)
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


DATA_ROOT = resolve_data_root(os.environ)
DATA_FILE = os.path.join(DATA_ROOT, 'deals_data.json')
DOCUMENTS_ROOT = os.path.join(DATA_ROOT, 'documents')
_data_lock = threading.Lock()
# Held by every route that reloads, changes and saves deals from an outside source (monday, Salesforce).
SYNC_LOCK = threading.Lock()
_migrated = False


def _migrate_approvers_to_directory(data):
    """One-time migration: merge default_approvers into master_contacts as unified directory entries."""
    old = data.get('default_approvers', {})
    if not old:
        old = DEFAULT_APPROVERS

    directory = data.get('master_contacts', [])
    # Index existing directory by approver_key to avoid duplicates
    existing_keys = {c.get('approver_key') for c in directory if c.get('approver_key')}

    next_id = max((int(c.get('id', 0)) for c in directory), default=0)
    for key, info in old.items():
        if key in existing_keys:
            continue
        name = info.get('name', '') if isinstance(info, dict) else str(info)
        if not name.strip():
            continue
        meta = APPROVER_KEY_META.get(key, {})
        next_id += 1
        directory.append({
            'id': str(next_id),
            'name': name,
            'email': info.get('email', '') if isinstance(info, dict) else '',
            'role': meta.get('role', ''),          # SAL or PAL
            'area': meta.get('area', ''),           # e.g. RTR
            'company': '',
            'phone': info.get('phone', '') if isinstance(info, dict) else '',
            'slack': info.get('slack', '') if isinstance(info, dict) else '',
            'notes': '',
            'approver_key': key,                    # links back to the original role key
        })

    data['master_contacts'] = directory
    # Keep default_approvers around for backward compat but mark migrated
    data['_contacts_migrated'] = True


def load_data():
    global _migrated
    with _data_lock:
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r') as file:
                data = json.load(file)
        else:
            data = {'deals': []}

        if not _migrated:
            changed = False
            if not data.get('_contacts_migrated'):
                _migrate_approvers_to_directory(data)
                changed = True
            changed = migrate_store(data) or changed
            if changed:
                _backup_unlocked()
                _save_data_unlocked(data)
            _migrated = True

        return data


def _backup_unlocked():
    """Copy the data file aside before the first migrated save (caller holds the lock)."""
    if not os.path.exists(DATA_FILE):
        return
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    base_dir = os.path.dirname(os.path.abspath(DATA_FILE))
    shutil.copy2(DATA_FILE, os.path.join(base_dir, f'deals_data.backup-{stamp}.json'))


def _save_data_unlocked(data):
    """Write to disk without acquiring the lock (caller must hold it)."""
    dir_name = os.path.dirname(os.path.abspath(DATA_FILE))
    os.makedirs(dir_name, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(suffix='.json', dir=dir_name)
    try:
        with os.fdopen(fd, 'w') as tmp:
            json.dump(data, tmp, indent=2)
        os.replace(temp_path, DATA_FILE)
    except Exception:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        raise


def save_data(data):
    """Atomic write: write to temp file then replace original."""
    with _data_lock:
        _save_data_unlocked(data)


def next_string_id(items):
    max_id = 0
    for item in items:
        try:
            item_id = item.get('id', 0) if isinstance(item, dict) else 0
            max_id = max(max_id, int(item_id))
        except (ValueError, TypeError, AttributeError):
            continue
    return str(max_id + 1)


def get_deal_by_id(data, deal_id):
    return next((d for d in data.get('deals', []) if str(d.get('id')) == str(deal_id)), None)
