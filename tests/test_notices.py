import pytest

from core.features.integrations.monday import client, identity


@pytest.fixture
def anna(monkeypatch):
    monkeypatch.setattr(identity, 'me', lambda preferences: {'name': 'Anna Exec', 'is_exec': True})


def _post(test_client, text):
    return test_client.post('/api/notices', json={'text': text})


def test_there_are_no_notices_at_first(tmp_store):
    assert tmp_store.get('/api/notices').get_json() == {'notices': []}


def test_a_tt_exec_posts_notices_newest_first(tmp_store, anna):
    first = _post(tmp_store, '  RFP week: all hands  ')
    assert first.status_code == 201
    notice = first.get_json()
    assert (notice['text'], notice['author']) == ('RFP week: all hands', 'Anna Exec')
    assert notice['created_at'].startswith('20') and notice['id']
    _post(tmp_store, 'Pipeline review Friday')
    assert [n['text'] for n in tmp_store.get('/api/notices').get_json()['notices']] == ['Pipeline review Friday', 'RFP week: all hands']


def test_a_notice_needs_short_text(tmp_store, anna):
    assert _post(tmp_store, '   ').status_code == 400
    assert _post(tmp_store, 'x' * 501).status_code == 400
    assert tmp_store.post('/api/notices', data='text=hi').status_code == 415
    assert tmp_store.get('/api/notices').get_json() == {'notices': []}


def test_a_tt_exec_removes_a_notice(tmp_store, anna):
    notice_id = _post(tmp_store, 'Old reminder').get_json()['id']
    assert tmp_store.delete(f'/api/notices/{notice_id}').status_code == 200
    assert tmp_store.get('/api/notices').get_json() == {'notices': []}
    assert tmp_store.delete(f'/api/notices/{notice_id}').status_code == 404


def test_only_tt_execs_post_or_remove(tmp_store, anna, monkeypatch):
    notice_id = _post(tmp_store, 'Keep this').get_json()['id']
    monkeypatch.setattr(identity, 'me', lambda preferences: {'name': 'Abi', 'is_exec': False})
    assert _post(tmp_store, 'Hi team').status_code == 403
    assert tmp_store.delete(f'/api/notices/{notice_id}').status_code == 403
    assert len(tmp_store.get('/api/notices').get_json()['notices']) == 1


def test_posting_needs_a_monday_sign_in(tmp_store, monkeypatch):
    def signed_out(preferences):
        raise client.MondayError('not_connected', client.SIGN_IN_AGAIN)
    monkeypatch.setattr(identity, 'me', signed_out)
    response = _post(tmp_store, 'Hi team')
    assert response.status_code == 401 and response.get_json()['kind'] == 'not_connected'
