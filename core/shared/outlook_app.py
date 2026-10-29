"""
The classic Outlook app on this computer, reached through its own local
connection (COM automation). Shared by the calendar reader and the Outlook
integration's drafts and invites. The new Outlook for Windows has no such
connection, so for s0L it counts as Outlook in the browser.
"""
import contextlib
import sys

MODES = frozenset({'app', 'web'})
_PROFILES_KEY = r'Software\Microsoft\Office\16.0\Outlook\Profiles'
_RPC_E_CHANGED_MODE = -2147417850  # 0x80010106: this thread's COM mode is already set


class OutlookUnavailable(Exception):
    pass


def _comtypes_ok():
    try:
        import comtypes.client  # noqa: F401
    except ImportError:
        return False
    return True


def _registered():
    if sys.platform != 'win32':
        return False
    import winreg
    try:
        winreg.CloseKey(winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, r'Outlook.Application\CLSID'))
    except OSError:
        return False
    return True


def _has_profile():
    if sys.platform != 'win32':
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _PROFILES_KEY) as key:
            return winreg.QueryInfoKey(key)[0] > 0
    except OSError:
        return False


def usable():
    """Classic Outlook is installed, set up for this Windows user, and reachable from Python."""
    return _registered() and _has_profile() and _comtypes_ok()


def effective_mode(preferences):
    """'app' or 'web': the person's choice, else the app when it's usable here."""
    chosen = (preferences or {}).get('outlook_mode')
    if chosen in MODES:
        return chosen
    return 'app' if usable() else 'web'


@contextlib.contextmanager
def com_thread():
    """COM on this thread, multithreaded so a thread that never pumps window messages can't hold other apps up.
    The thread that first imported comtypes is already set up by comtypes, which also undoes it; that one keeps its mode."""
    import comtypes
    owned = True
    try:
        comtypes.CoInitializeEx(comtypes.COINIT_MULTITHREADED)
    except OSError as error:
        if getattr(error, 'winerror', None) != _RPC_E_CHANGED_MODE:
            raise
        owned = False
    try:
        yield
    finally:
        if owned:
            comtypes.CoUninitialize()


def running_app():
    """The Outlook that's open now, or None; never starts Outlook."""
    import comtypes.client
    try:
        return comtypes.client.GetActiveObject('Outlook.Application', dynamic=True)
    except (OSError, ValueError):
        return None


def _create():
    import comtypes.client
    return comtypes.client.CreateObject('Outlook.Application', dynamic=True)


def open_app():
    """The open Outlook, or a freshly started one; only a person's click should call this."""
    if not usable():
        raise OutlookUnavailable()
    return running_app() or _create()
