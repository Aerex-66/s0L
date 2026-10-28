"""
Local store for the monday app credentials and the user's access token.
Everything is encrypted with Windows DPAPI for the current user and lives
outside the repo; nothing here is ever returned by a route or logged.
The packaged app also ships the app's own ID and secret in a plain file
(S0L_MONDAY_APP), so colleagues only sign in.
"""
import ctypes
import json
import os
import sys
import tempfile

SECRETS_DIR = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), 's0L', 'monday')

_APP_FILE = 'app.bin'
_TOKEN_FILE = 'token.bin'
_ENTROPY = b's0L/monday'
_CRYPTPROTECT_UI_FORBIDDEN = 0x1

if sys.platform == 'win32':
    from ctypes import wintypes

    class _Blob(ctypes.Structure):
        _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]

    _crypt32 = ctypes.WinDLL('crypt32', use_last_error=True)
    _kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    for _fn in (_crypt32.CryptProtectData, _crypt32.CryptUnprotectData):
        _fn.argtypes = [ctypes.POINTER(_Blob), ctypes.c_void_p, ctypes.POINTER(_Blob), ctypes.c_void_p,
                        ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(_Blob)]
        _fn.restype = wintypes.BOOL
    _kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    _kernel32.LocalFree.restype = ctypes.c_void_p


def _dpapi(name, data):
    if sys.platform != 'win32':
        raise RuntimeError('DPAPI needs Windows')
    source = ctypes.create_string_buffer(data, len(data))
    entropy = ctypes.create_string_buffer(_ENTROPY, len(_ENTROPY))
    blob_in = _Blob(len(data), ctypes.cast(source, ctypes.POINTER(ctypes.c_char)))
    blob_entropy = _Blob(len(_ENTROPY), ctypes.cast(entropy, ctypes.POINTER(ctypes.c_char)))
    blob_out = _Blob()
    call = getattr(_crypt32, name)
    if not call(ctypes.byref(blob_in), None, ctypes.byref(blob_entropy), None, None,
                _CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(blob_out)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        _kernel32.LocalFree(ctypes.cast(blob_out.pbData, ctypes.c_void_p))


def protect(data):
    return _dpapi('CryptProtectData', data)


def unprotect(blob):
    return _dpapi('CryptUnprotectData', blob)


def _write(name, payload):
    os.makedirs(SECRETS_DIR, exist_ok=True)
    blob = protect(json.dumps(payload).encode('utf-8'))
    fd, temp_path = tempfile.mkstemp(dir=SECRETS_DIR)
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(blob)
        os.replace(temp_path, os.path.join(SECRETS_DIR, name))
    except Exception:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        raise


def _read(name):
    try:
        with open(os.path.join(SECRETS_DIR, name), 'rb') as handle:
            blob = handle.read()
        return json.loads(unprotect(blob).decode('utf-8'))
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        # Unreadable (another Windows user, or damaged): treat as not set up.
        return None


def _remove(name):
    try:
        os.remove(os.path.join(SECRETS_DIR, name))
    except FileNotFoundError:
        pass


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
