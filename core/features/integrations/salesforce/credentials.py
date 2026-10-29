"""
Local store for s0L's Salesforce app (the org's address and the app's consumer
key, neither of them secret) and the signed-in person's tokens. Tokens are
DPAPI-encrypted for the current Windows user and are never returned by a route
or logged. The packaged app ships the app as a plain file (S0L_SALESFORCE_APP).
"""
import json
import os
import re

from core.shared import vault

SECRETS_DIR = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), 's0L', 'salesforce')

_APP_FILE = 'app.bin'
_TOKEN_FILE = 'token.bin'
_ENTROPY = b's0L/salesforce'
_HOST = re.compile(r'^[a-z0-9-]+(\.[a-z0-9-]+)*\.(salesforce|force)\.com$')


def valid_host(host):
    """A bare host name (no scheme, port or path) on Salesforce's own domains."""
    return bool(_HOST.match(str(host or '').strip().lower()))


def protect(data):
    return vault.protect(data, _ENTROPY)


def unprotect(blob):
    return vault.unprotect(blob, _ENTROPY)


def _clean_app(data):
    if not isinstance(data, dict):
        return None
    host = str(data.get('host') or '').strip().lower()
    client_id = str(data.get('client_id') or '').strip()
    if not valid_host(host) or not client_id:
        return None
    return {'host': host, 'client_id': client_id, 'release': bool(data.get('release'))}


def save_app(host, client_id, release=False):
    """release marks IBM Sales Cloud: only that app is ever bundled into the packaged s0L."""
    vault.write_secret(SECRETS_DIR, _APP_FILE, {'host': host, 'client_id': client_id, 'release': bool(release)}, protect)


def load_app():
    return _bundled_app() or _clean_app(vault.read_secret(SECRETS_DIR, _APP_FILE, unprotect))


def _bundled_app():
    path = os.environ.get('S0L_SALESFORCE_APP')
    if not path:
        return None
    try:
        with open(path, encoding='utf-8') as handle:
            return _clean_app(json.load(handle))
    except (OSError, ValueError):
        return None


def save_token(session):
    """Store the signed-in session: access_token, refresh_token, instance_url, user, connected_at."""
    vault.write_secret(SECRETS_DIR, _TOKEN_FILE, session, protect)


def load_token():
    return vault.read_secret(SECRETS_DIR, _TOKEN_FILE, unprotect)


def clear_token():
    vault.remove_secret(SECRETS_DIR, _TOKEN_FILE)
