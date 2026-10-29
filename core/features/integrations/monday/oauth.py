"""
Sign-in with s0L's own monday app (monday's OAuth 2.1 flow: PKCE, expiring
access tokens, rotating refresh tokens). post_json() makes every JSON call s0L
sends to monday; releases.py makes the file upload and the update download.
"""
import base64
import hashlib
import json
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from core.features.integrations.monday import config, credentials

STATE_TTL_SECONDS = 600
REFRESH_MARGIN_SECONDS = 300

_pending_states = {}
_states_lock = threading.Lock()
_refresh_lock = threading.Lock()


class OAuthError(Exception):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


class NotConnected(Exception):
    pass


def _json_body(raw):
    try:
        body = json.loads((raw or b'').decode('utf-8') or '{}')
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def post_json(url, payload, headers=None, timeout=30):
    """POST JSON and return (status, body, headers); status 0 means monday couldn't be reached."""
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        method='POST',
        headers={'Content-Type': 'application/json', 'Accept': 'application/json', **(headers or {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, _json_body(response.read()), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, _json_body(error.read()), dict(error.headers or {})
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, {}, {}


def api_headers(token):
    return {'Authorization': token, 'API-Version': config.API_VERSION}


def _claims(token):
    try:
        payload = token.split('.')[1]
        payload += '=' * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
    except (AttributeError, IndexError, TypeError, ValueError):
        return {}
    return claims if isinstance(claims, dict) else {}


def jwt_exp(token):
    """Expiry (epoch seconds) read from the access token's JWT payload; None when it can't be read."""
    try:
        return float(_claims(token)['exp'])
    except (KeyError, TypeError, ValueError):
        return None


def granted_scopes(token):
    """The scopes monday granted, read from the access token's `per` claim ('me:read,boards:read')."""
    per = _claims(token).get('per')
    return frozenset(scope.strip() for scope in per.split(',') if scope.strip()) if isinstance(per, str) else frozenset()


def _pkce_pair():
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    return verifier, base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')


def begin():
    """Build monday's sign-in URL with a fresh single-use state and PKCE challenge."""
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
        'client_id': app['client_id'],
        'redirect_uri': config.REDIRECT_URI,
        'scope': config.SCOPES,
        'state': state,
        'subdomain': config.ACCOUNT_SLUG,
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
    })
    return f'{config.AUTHORIZE_URL}?{query}'


def finish(state, code):
    """Exchange the code monday sent back for tokens, check they work, and store them."""
    with _states_lock:
        pending = _pending_states.pop(state, None) if state else None
    if pending is None or time.monotonic() - pending[0] > STATE_TTL_SECONDS:
        raise OAuthError('bad_state')
    app = credentials.load_app()
    if not app:
        raise OAuthError('not_configured')
    if not code:
        raise OAuthError('exchange_failed')

    status, body, _ = post_json(config.TOKEN_URL, {
        'grant_type': 'authorization_code',
        'client_id': app['client_id'],
        'client_secret': app['client_secret'],
        'code': code,
        'redirect_uri': config.REDIRECT_URI,
        'code_verifier': pending[1],
    })
    token = body.get('access_token') if status == 200 else None
    if not token:
        raise OAuthError('exchange_failed')

    status, me_body, _ = post_json(config.API_URL, {'query': '{ me { id name email } }'}, api_headers(token))
    me = (me_body.get('data') or {}).get('me') if status == 200 else None
    if not me:
        raise OAuthError('exchange_failed')
    user = {'id': str(me.get('id', '')), 'name': me.get('name', '')}
    if me.get('email'):
        user['email'] = me['email']
    credentials.save_token({
        'access_token': token,
        'refresh_token': body.get('refresh_token'),
        'expires_at': jwt_exp(token),
        'user': user,
        'connected_at': datetime.now(timezone.utc).isoformat(),
    })
    return user


def access_token():
    saved = credentials.load_token()
    if not saved or not saved.get('access_token'):
        raise NotConnected()
    expires_at = saved.get('expires_at')
    if expires_at and expires_at - time.time() < REFRESH_MARGIN_SECONDS:
        return refresh(stale_token=saved['access_token'])
    return saved['access_token']


def refresh(stale_token=None):
    """Swap the refresh token for a new access token. monday rotates refresh tokens, so only one refresh runs at a time."""
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
        status, body, _ = post_json(config.TOKEN_URL, {
            'grant_type': 'refresh_token',
            'client_id': app['client_id'],
            'client_secret': app['client_secret'],
            'refresh_token': saved['refresh_token'],
        })
        if status in (400, 401):
            credentials.clear_token()
            raise NotConnected()
        token = body.get('access_token') if status == 200 else None
        if not token:
            raise OAuthError('refresh_failed')
        saved.update(
            access_token=token,
            refresh_token=body.get('refresh_token') or saved['refresh_token'],
            expires_at=jwt_exp(token),
        )
        credentials.save_token(saved)
        return token


def sign_out():
    """Revoke the refresh token at monday (best effort), then forget the session."""
    saved = credentials.load_token() or {}
    app = credentials.load_app()
    if app and saved.get('refresh_token'):
        post_json(config.REVOKE_URL, {
            'token': saved['refresh_token'],
            'client_id': app['client_id'],
            'client_secret': app['client_secret'],
            'token_type_hint': 'refresh_token',
        })
    credentials.clear_token()


def status():
    saved = credentials.load_token() or {}
    return {
        'app_configured': credentials.load_app() is not None,
        'connected': bool(saved.get('access_token')),
        'can_write': 'boards:write' in granted_scopes(saved.get('access_token')),
        'user': saved.get('user'),
    }
