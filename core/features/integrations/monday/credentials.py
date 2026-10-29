"""
Local store for the monday app credentials and the user's access token.
Everything is encrypted with Windows DPAPI for the current user and lives
outside the repo; nothing here is ever returned by a route or logged.
The packaged app also ships the app's own ID and secret in a plain file
(S0L_MONDAY_APP), so colleagues only sign in.
"""
import json
import os

from core.shared import vault

SECRETS_DIR = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), 's0L', 'monday')

_APP_FILE = 'app.bin'
_TOKEN_FILE = 'token.bin'
_ENTROPY = b's0L/monday'


def protect(data):
    return vault.protect(data, _ENTROPY)


def unprotect(blob):
    return vault.unprotect(blob, _ENTROPY)


def _write(name, payload):
    vault.write_secret(SECRETS_DIR, name, payload, protect)


def _read(name):
    return vault.read_secret(SECRETS_DIR, name, unprotect)


def _remove(name):
    vault.remove_secret(SECRETS_DIR, name)


def save_app(client_id, client_secret):
    _write(_APP_FILE, {'client_id': client_id, 'client_secret': client_secret})


def load_app():
    return _bundled_app() or _read(_APP_FILE)


def _bundled_app():
    path = os.environ.get('S0L_MONDAY_APP')
    if not path:
        return None
    try:
        with open(path, encoding='utf-8') as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    client_id = str(data.get('client_id') or '').strip()
    client_secret = str(data.get('client_secret') or '').strip()
    if not client_id or not client_secret:
        return None
    return {'client_id': client_id, 'client_secret': client_secret}


def save_token(session):
    """Store the signed-in session: access_token, refresh_token, expires_at, user, connected_at."""
    _write(_TOKEN_FILE, session)


def load_token():
    return _read(_TOKEN_FILE)


def clear_token():
    _remove(_TOKEN_FILE)
