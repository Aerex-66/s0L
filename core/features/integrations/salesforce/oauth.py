"""
Sign-in with s0L's Salesforce app: the OAuth 2.0 web server flow with PKCE and
no client secret, set up like Salesforce's own Data Loader. request() is the
only function in s0L that makes an HTTP call to Salesforce.
"""
import base64
import hashlib
import json
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from core.features.integrations.salesforce import config, credentials

STATE_TTL_SECONDS = 600
NO_API_CODES = frozenset({'API_DISABLED_FOR_ORG', 'API_CURRENTLY_DISABLED'})
_USER_ID = re.compile(r'005[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?')

_pending_states = {}
_states_lock = threading.Lock()
_refresh_lock = threading.Lock()


class OAuthError(Exception):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


class NotConnected(Exception):
    pass


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def _body(raw):
    try:
        return json.loads((raw or b'').decode('utf-8') or '{}')
    except ValueError:
        return {}


def request(method, url, *, form=None, headers=None, timeout=30):
    """Call Salesforce; (status, parsed JSON body, headers). Status 0 means Salesforce couldn't be reached."""
    if urllib.parse.urlsplit(url).scheme != 'https':
        return 0, {}, {}
    send = {'Accept': 'application/json', **(headers or {})}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode('ascii')
        send['Content-Type'] = 'application/x-www-form-urlencoded'
    try:
        with _opener.open(urllib.request.Request(url, data=data, method=method, headers=send), timeout=timeout) as response:
            return response.status, _body(response.read()), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, _body(error.read()), dict(error.headers or {})
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, {}, {}


def error_codes(body):
    """The errorCode values in a Salesforce REST error answer (a list of {errorCode, message})."""
    items = body if isinstance(body, list) else [body]
    return {item.get('errorCode') for item in items if isinstance(item, dict) and item.get('errorCode')}


def salesforce_origin(url):
    """https://host for an https URL on a Salesforce host, else None."""
    try:
        parts = urllib.parse.urlsplit(str(url or ''))
        port = parts.port
    except ValueError:
        return None
    if parts.scheme != 'https' or port not in (None, 443) or not credentials.valid_host(parts.hostname or ''):
        return None
    return f'https://{parts.hostname}'


def _pkce_pair():
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    return verifier, base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')


def begin():
    """Salesforce's sign-in URL with a fresh single-use state and PKCE challenge."""
    app = credentials.load_app()
    if not app:
        raise OAuthError('not_configured')
    state = secrets.token_urlsafe(24)
    verifier, challenge = _pkce_pair()
    now = time.monotonic()
    with _states_lock:
        for stale in [key for key, (created, _) in _pending_states.items() if now - created > STATE_TTL_SECONDS]:
            del _pending_states[stale]
        _pending_states[state] = (now, verifier)
    query = urllib.parse.urlencode({
        'response_type': 'code',
        'client_id': app['client_id'],
        'redirect_uri': config.REDIRECT_URI,
        'scope': config.SCOPES,
        'state': state,
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
    })
    return f"https://{app['host']}{config.AUTHORIZE_PATH}?{query}"


def _who(instance, token, identity_url):
    """{id, name, email} of the signed-in person, read with the api scope; raises OAuthError."""
    user_id = str(identity_url or '').rstrip('/').rsplit('/', 1)[-1]
    if not _USER_ID.fullmatch(user_id):
        raise OAuthError('exchange_failed')
    soql = f"SELECT Name, Email FROM User WHERE Id = '{user_id}'"
    url = f'{instance}/services/data/v{config.API_VERSION}/query?{urllib.parse.urlencode({"q": soql})}'
    status, body, _ = request('GET', url, headers={'Authorization': f'Bearer {token}'})
    if status == 403 and error_codes(body) & NO_API_CODES:
        raise OAuthError('no_api')
    records = body.get('records') if status == 200 and isinstance(body, dict) else None
    if not records:
        raise OAuthError('exchange_failed')
    return {'id': user_id, 'name': records[0].get('Name') or '', 'email': records[0].get('Email') or ''}


def finish(state, code):
    """Exchange the code Salesforce sent back, learn who signed in, and store the session."""
    with _states_lock:
        pending = _pending_states.pop(state, None) if state else None
    if pending is None or time.monotonic() - pending[0] > STATE_TTL_SECONDS:
        raise OAuthError('bad_state')
    app = credentials.load_app()
    if not app:
        raise OAuthError('not_configured')
    if not code:
        raise OAuthError('exchange_failed')

    status, body, _ = request('POST', f"https://{app['host']}{config.TOKEN_PATH}", form={
        'grant_type': 'authorization_code',
        'code': code,
        'client_id': app['client_id'],
        'redirect_uri': config.REDIRECT_URI,
        'code_verifier': pending[1],
    })
    token = body.get('access_token') if status == 200 and isinstance(body, dict) else None
    instance = salesforce_origin(body.get('instance_url')) if token else None
    if not instance:
        raise OAuthError('exchange_failed')

    try:
        user = _who(instance, token, body.get('id'))
    except OAuthError:
        # Salesforce issued tokens s0L won't keep: revoke them rather than leave them live.
        request('POST', f"https://{app['host']}{config.REVOKE_PATH}", form={'token': body.get('refresh_token') or token})
        raise
    credentials.save_token({
        'access_token': token,
        'refresh_token': body.get('refresh_token'),
        'instance_url': instance,
        'user': user,
        'connected_at': datetime.now(timezone.utc).isoformat(),
    })
    return user


def callback_reason(error):
    """Why Salesforce's sign-in page sent the person back: they cancelled, or the org didn't let s0L in."""
    return 'denied' if error == 'access_denied' else 'not_allowed'


def access_token():
    saved = credentials.load_token()
    if not saved or not saved.get('access_token'):
        raise NotConnected()
    return saved['access_token']


def instance_url():
    origin = salesforce_origin((credentials.load_token() or {}).get('instance_url'))
    if not origin:
        raise NotConnected()
    return origin


def refresh(stale_token=None):
    """Swap the refresh token for a new access token; only one refresh runs at a time."""
    with _refresh_lock:
        saved = credentials.load_token()
        if not saved or not saved.get('access_token'):
            raise NotConnected()
        if stale_token is not None and saved['access_token'] != stale_token:
            return saved['access_token']
        app = credentials.load_app()
        if not app or not saved.get('refresh_token'):
            credentials.clear_token()
            raise NotConnected()
        status, body, _ = request('POST', f"https://{app['host']}{config.TOKEN_PATH}", form={
            'grant_type': 'refresh_token',
            'client_id': app['client_id'],
            'refresh_token': saved['refresh_token'],
        })
        if status in (400, 401):
            credentials.clear_token()
            raise NotConnected()
        token = body.get('access_token') if status == 200 and isinstance(body, dict) else None
        if not token:
            raise OAuthError('refresh_failed')
        saved.update(
            access_token=token,
            refresh_token=body.get('refresh_token') or saved['refresh_token'],
            instance_url=salesforce_origin(body.get('instance_url')) or saved.get('instance_url'),
        )
        credentials.save_token(saved)
        return token


def sign_out():
    """Revoke the session at Salesforce (best effort), then forget it."""
    saved = credentials.load_token() or {}
    app = credentials.load_app()
    token = saved.get('refresh_token') or saved.get('access_token')
    if app and token:
        request('POST', f"https://{app['host']}{config.REVOKE_PATH}", form={'token': token})
    credentials.clear_token()


def status():
    saved = credentials.load_token() or {}
    app = credentials.load_app()
    return {
        'app_configured': app is not None,
        'connected': bool(saved.get('access_token')),
        'user': saved.get('user'),
        'host': app['host'] if app else None,
    }
