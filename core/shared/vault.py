"""
Encrypted files for integration secrets (app credentials and sign-in tokens):
Windows DPAPI for the current user, written atomically. Each integration keeps
its own folder and entropy and passes its own protect/unprotect.
"""
import ctypes
import json
import os
import sys
import tempfile

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


def _dpapi(name, data, entropy):
    if sys.platform != 'win32':
        raise RuntimeError('DPAPI needs Windows')
    source = ctypes.create_string_buffer(data, len(data))
    salt = ctypes.create_string_buffer(entropy, len(entropy))
    blob_in = _Blob(len(data), ctypes.cast(source, ctypes.POINTER(ctypes.c_char)))
    blob_entropy = _Blob(len(entropy), ctypes.cast(salt, ctypes.POINTER(ctypes.c_char)))
    blob_out = _Blob()
    call = getattr(_crypt32, name)
    if not call(ctypes.byref(blob_in), None, ctypes.byref(blob_entropy), None, None,
                _CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(blob_out)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        _kernel32.LocalFree(ctypes.cast(blob_out.pbData, ctypes.c_void_p))


def protect(data, entropy):
    return _dpapi('CryptProtectData', data, entropy)


def unprotect(blob, entropy):
    return _dpapi('CryptUnprotectData', blob, entropy)


def write_secret(folder, name, payload, protect):
    os.makedirs(folder, exist_ok=True)
    blob = protect(json.dumps(payload).encode('utf-8'))
    fd, temp_path = tempfile.mkstemp(dir=folder)
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(blob)
        os.replace(temp_path, os.path.join(folder, name))
    except Exception:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        raise


def read_secret(folder, name, unprotect):
    try:
        with open(os.path.join(folder, name), 'rb') as handle:
            blob = handle.read()
        return json.loads(unprotect(blob).decode('utf-8'))
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        # Unreadable (another Windows user, or damaged): treat as not set up.
        return None


def remove_secret(folder, name):
    try:
        os.remove(os.path.join(folder, name))
    except FileNotFoundError:
        pass
