import pytest

from core.shared import outlook_app


@pytest.fixture
def machine(monkeypatch):
    """A computer whose Outlook facts the test sets: COM class registered, a mail profile, comtypes."""
    facts = {'registered': True, 'profile': True, 'comtypes': True}
    monkeypatch.setattr(outlook_app, '_registered', lambda: facts['registered'])
    monkeypatch.setattr(outlook_app, '_has_profile', lambda: facts['profile'])
    monkeypatch.setattr(outlook_app, '_comtypes_ok', lambda: facts['comtypes'])
    return facts


def test_usable_needs_the_app_a_profile_and_comtypes(machine):
    assert outlook_app.usable()
    machine['comtypes'] = False
    assert not outlook_app.usable()


def test_installed_without_a_profile_is_not_usable(machine):
    machine['profile'] = False
    assert not outlook_app.usable()


def test_not_installed_is_not_usable(machine):
    machine['registered'] = False
    assert not outlook_app.usable()


@pytest.mark.parametrize('stored,usable,expected', [
    ('app', True, 'app'), ('web', True, 'web'), ('app', False, 'app'),
    (None, True, 'app'), (None, False, 'web'), ('junk', True, 'app'), ('junk', False, 'web'),
])
def test_effective_mode(machine, stored, usable, expected):
    machine['registered'] = usable
    preferences = {'outlook_mode': stored} if stored else {}
    assert outlook_app.effective_mode(preferences) == expected


def test_open_app_refuses_when_not_usable(machine):
    machine['registered'] = False
    with pytest.raises(outlook_app.OutlookUnavailable):
        outlook_app.open_app()


def test_open_app_reuses_the_open_outlook(machine, monkeypatch):
    running = object()
    monkeypatch.setattr(outlook_app, 'running_app', lambda: running)
    monkeypatch.setattr(outlook_app, '_create', lambda: pytest.fail('Outlook was already open'))
    assert outlook_app.open_app() is running


def test_open_app_starts_outlook_when_closed(machine, monkeypatch):
    started = object()
    monkeypatch.setattr(outlook_app, 'running_app', lambda: None)
    monkeypatch.setattr(outlook_app, '_create', lambda: started)
    assert outlook_app.open_app() is started


def test_com_thread_balances_its_own_setup(monkeypatch):
    comtypes = pytest.importorskip('comtypes')
    calls = []
    monkeypatch.setattr(comtypes, 'CoInitializeEx', lambda flags: calls.append(('init', flags)))
    monkeypatch.setattr(comtypes, 'CoUninitialize', lambda: calls.append('uninit'))
    with outlook_app.com_thread():
        calls.append('work')
    assert calls == [('init', comtypes.COINIT_MULTITHREADED), 'work', 'uninit']


def test_com_thread_keeps_the_setup_comtypes_already_made(monkeypatch):
    comtypes = pytest.importorskip('comtypes')
    calls = []

    def already_set(flags):
        raise OSError(None, 'Cannot change thread mode after it is set', None, -2147417850)

    monkeypatch.setattr(comtypes, 'CoInitializeEx', already_set)
    monkeypatch.setattr(comtypes, 'CoUninitialize', lambda: calls.append('uninit'))
    with outlook_app.com_thread():
        calls.append('work')
    assert calls == ['work']


def test_com_thread_reports_other_setup_failures(monkeypatch):
    comtypes = pytest.importorskip('comtypes')

    def broken(flags):
        raise OSError(None, 'Out of memory', None, -2147024882)

    monkeypatch.setattr(comtypes, 'CoInitializeEx', broken)
    with pytest.raises(OSError):
        with outlook_app.com_thread():
            pass
