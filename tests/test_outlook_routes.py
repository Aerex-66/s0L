import contextlib

import pytest

from core.shared import outlook_app, state


@pytest.fixture
def here(monkeypatch):
    """This computer's Outlook as the test sets it; no real COM."""
    facts = {'usable': True, 'running': False}
    monkeypatch.setattr(outlook_app, 'usable', lambda: facts['usable'])
    monkeypatch.setattr(outlook_app, 'running_app', lambda: object() if facts['running'] else None)
    monkeypatch.setattr(outlook_app, 'com_thread', contextlib.nullcontext)
    return facts


def test_status_starts_from_detection(tmp_store, here):
    assert tmp_store.get('/api/outlook/status').get_json() == {
        'app': {'found': True, 'running': False}, 'mode': None, 'effective': 'app'}
    here['running'] = True
    assert tmp_store.get('/api/outlook/status').get_json()['app']['running'] is True


def test_without_the_app_the_browser_is_the_start(tmp_store, here):
    here['usable'] = False
    here['running'] = True
    assert tmp_store.get('/api/outlook/status').get_json() == {
        'app': {'found': False, 'running': False}, 'mode': None, 'effective': 'web'}


def test_choosing_the_browser_is_kept(tmp_store, here):
    body = tmp_store.put('/api/outlook/mode', json={'mode': 'web'}).get_json()
    assert body['mode'] == 'web' and body['effective'] == 'web'
    assert state.load_data()['preferences']['outlook_mode'] == 'web'
    tmp_store.put('/api/preferences', json={'scope': 'mine'})
    assert state.load_data()['preferences']['outlook_mode'] == 'web'


def test_mode_choices_are_checked(tmp_store, here):
    assert tmp_store.put('/api/outlook/mode', json={'mode': 'desktop'}).status_code == 400
    assert tmp_store.put('/api/outlook/mode', data='web').status_code == 415
    here['usable'] = False
    response = tmp_store.put('/api/outlook/mode', json={'mode': 'app'})
    assert response.status_code == 409 and 'Outlook app' in response.get_json()['error']


def test_foreign_host_is_refused(tmp_store):
    assert tmp_store.get('/api/outlook/status', headers={'Host': 'evil.example.com'}).status_code == 403
