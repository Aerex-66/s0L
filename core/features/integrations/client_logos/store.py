"""
Local cache of client logos, next to deals_data.json (gitignored): one image per client, named
after the client as on its deals, plus index.json recording what was found, missed, hidden or
overridden. Nothing here is fetched at request time; the worker fills it and the routes only read it.
"""
import json
import os
import re
import tempfile
import threading
from datetime import datetime, timezone

from core.shared import state
from core.features.integrations.client_logos.resolver import normalize

IMAGE_EXTS = frozenset({'svg', 'png', 'ico', 'jpg', 'webp'})
_UNSAFE = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')  # not allowed in Windows file names
_RESERVED = frozenset({'con', 'prn', 'aux', 'nul', *(f'com{n}' for n in range(1, 10)), *(f'lpt{n}' for n in range(1, 10))})
_lock = threading.Lock()


def cache_dir():
    return os.path.join(os.path.dirname(os.path.abspath(state.DATA_FILE)), 'client_logos')


def _index_path():
    return os.path.join(cache_dir(), 'index.json')


def load_index():
    try:
        with open(_index_path(), encoding='utf-8') as handle:
            index = json.load(handle)
        return index if isinstance(index, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_index(index):
    os.makedirs(cache_dir(), exist_ok=True)
    fd, temp_path = tempfile.mkstemp(dir=cache_dir(), suffix='.json')
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(index, handle, indent=1)
    os.replace(temp_path, _index_path())


def _on_disk(file_name):
    """Path of a file directly in the cache folder, or None (never anything outside it)."""
    name = str(file_name or '')
    if not name or name != os.path.basename(name) or name in ('.', '..'):
        return None
    path = os.path.join(cache_dir(), name)
    return path if os.path.isfile(path) else None


def has_file(entry):
    return bool(entry.get('file') and _on_disk(entry['file']))


def file_path(file_name):
    """Absolute path of a cached logo the index lists, or None for anything else."""
    name = str(file_name or '')
    if name.rsplit('.', 1)[-1].lower() not in IMAGE_EXTS:
        return None
    if not any(entry.get('file') == name for entry in load_index().values()):
        return None
    return _on_disk(name)


def _file_name(client_name, ext, index, key):
    """A logo's file name: the client's name as on its deals, made safe for Windows and unique in the cache."""
    base = ' '.join(_UNSAFE.sub(' ', str(client_name)).split())[:80].strip(' .') or 'client'
    if base.lower() in _RESERVED:
        base += ' logo'
    taken = {str(entry.get('file') or '').lower() for other, entry in index.items() if other != key}
    name, count = f'{base}.{ext}', 2
    while name.lower() in taken:
        name, count = f'{base} ({count}).{ext}', count + 1
    return name


def record(client_name, status, logo=None, keep_reviewed=False, **extra):
    """Store a lookup outcome for a client ('found' with its image, 'missing' or 'error'), replacing the last one.
    With keep_reviewed, a client a person has settled (approved, hidden, set by hand) is left as it is."""
    key = normalize(client_name)
    if not key:
        return None
    with _lock:
        index = load_index()
        old = index.get(key) or {}
        if keep_reviewed and (old.get('manual') or old.get('validated') or old.get('status') == 'hidden'):
            return old
        entry = {'name': str(client_name).strip(), 'status': status,
                 'checked_at': datetime.now(timezone.utc).isoformat(),
                 **{name: value for name, value in extra.items() if value not in (None, '')}}
        if logo:
            os.makedirs(cache_dir(), exist_ok=True)
            entry['file'] = _file_name(entry['name'], logo['ext'], index, key)
            with open(os.path.join(cache_dir(), entry['file']), 'wb') as handle:
                handle.write(logo['body'])
            entry.update({k: logo.get(k) for k in ('source', 'entity', 'website') if logo.get(k)})
        # Compared ignoring case: on Windows a case-only change is the same file.
        if old.get('file') and old['file'].lower() != str(entry.get('file') or '').lower():
            stale = _on_disk(old['file'])
            if stale:
                os.remove(stale)
        index[key] = entry
        _write_index(index)
        return entry


def name_files_after_clients():
    """Rename cached logos to their clients' names (the cache used hashed names before); how many were renamed."""
    with _lock:
        index = load_index()
        renamed = 0
        for key, entry in index.items():
            current = entry.get('file')
            path = _on_disk(current)
            if not path:
                continue
            wanted = _file_name(entry.get('name') or key, current.rsplit('.', 1)[-1].lower(), index, key)
            if wanted != current:
                os.replace(path, os.path.join(cache_dir(), wanted))
                entry['file'] = wanted
                renamed += 1
        if renamed:
            _write_index(index)
        return renamed


def set_hidden(client_name, hidden):
    """Hide a wrong logo (the file is kept), or show it again; with no file the client is looked up afresh.
    Either way a person has now reviewed it."""
    key = normalize(client_name)
    with _lock:
        index = load_index()
        entry = dict(index.get(key) or {'name': str(client_name).strip()})
        if hidden:
            entry.update(status='hidden', validated=True)
            index[key] = entry
        elif entry.get('file') and _on_disk(entry['file']):
            entry.update(status='found', validated=True)
            index[key] = entry
        else:
            index.pop(key, None)
            entry = None
        _write_index(index)
        return entry


def set_validated(client_name, validated):
    """Mark a client's logo (or its having none) as checked by a person, or undo that."""
    key = normalize(client_name)
    with _lock:
        index = load_index()
        entry = index.get(key)
        if entry is None or entry.get('status') not in ('found', 'missing', 'error'):
            return None
        if validated and entry['status'] == 'error':
            entry['status'] = 'missing'  # confirming a failed lookup means: no logo for this client
        entry['validated'] = bool(validated)
        _write_index(index)
        return entry
