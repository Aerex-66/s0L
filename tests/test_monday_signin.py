import base64
import hashlib
import json
import logging
import sys
import threading
import time
from urllib.parse import parse_qs, urlparse

import pytest

from core.shared.security import parse_frontend_origins
from core.features.integrations.monday import config, credentials, oauth, provision


def _jwt(exp):
    def part(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b'=').decode()
    return f"{part({'alg': 'none'})}.{part({'exp': exp})}.sig"


def _challenge(verifier):
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()


def _connect(client):
    location = client.get('/api/monday/connect').headers['Location']
    return parse_qs(urlparse(location).query), location


def _sign_in(client, fake_monday, token='tok-1', refresh='ref-1'):
    credentials.save_app('cid', 'sec-XYZ')
    query, _ = _connect(client)
    fake_monday.queue(config.TOKEN_URL, 200, {'access_token': token, 'refresh_token': refresh, 'token_type': 'Bearer'})
    fake_monday.queue(config.API_URL, 200, {'data': {'me': {'id': 7, 'name': 'Abide'}}})
    return client.get(f"/api/monday/oauth/callback?state={query['state'][0]}&code=x"), query


def _session(access='tok-old', refresh='r1', expires_in=60):
    credentials.save_app('cid', 'sec-XYZ')
    credentials.save_token({
        'access_token': access, 'refresh_token': refresh, 'expires_at': time.time() + expires_in,
        'user': {'id': '7', 'name': 'Abide'},
    })


def test_app_credentials_roundtrip_without_plaintext(vault):
    credentials.save_app('cid-1', 'sek-ret-2')
    assert credentials.load_app() == {'client_id': 'cid-1', 'client_secret': 'sek-ret-2'}
    assert b'sek-ret-2' not in (vault / 'app.bin').read_bytes()


@pytest.mark.skipif(sys.platform != 'win32', reason='DPAPI is Windows-only')
def test_real_dpapi_roundtrip():
    assert credentials.unprotect(credentials.protect(b'x' * 40)) == b'x' * 40


def test_import_saves_then_deletes_the_file(vault, tmp_path, capsys):
    source = tmp_path / 'monday-app.json'
    source.write_text(json.dumps({'client_id': 'cid', 'client_secret': 'shh-secret'}), encoding='utf-8')
    assert provision.main(['--import', str(source)]) == 0
    assert credentials.load_app() == {'client_id': 'cid', 'client_secret': 'shh-secret'}
    assert not source.exists()
    assert 'shh-secret' not in capsys.readouterr().out


def test_import_missing_file_skips(vault, tmp_path):
    assert provision.main(['--import', str(tmp_path / 'none.json')]) == 0
    assert credentials.load_app() is None


def test_import_bad_file_is_kept(vault, tmp_path):
    source = tmp_path / 'monday-app.json'
    source.write_text('{"client_id": ""}', encoding='utf-8')
    assert provision.main(['--import', str(source)]) == 2
    assert source.exists() and credentials.load_app() is None


def test_prompt_mode_hides_the_secret(vault, monkeypatch):
    monkeypatch.setattr('builtins.input', lambda prompt: 'cid')
    monkeypatch.setattr(provision.getpass, 'getpass', lambda prompt: 'shh')
    assert provision.main([]) == 0
    assert credentials.load_app() == {'client_id': 'cid', 'client_secret': 'shh'}


def test_connect_redirects_to_monday(tmp_store, vault):
    credentials.save_app('cid', 'sec-XYZ')
    query, location = _connect(tmp_store)
    assert location.startswith(config.AUTHORIZE_URL)
    assert query['client_id'] == ['cid'] and query['redirect_uri'] == [config.REDIRECT_URI]
    assert query['scope'] == ['me:read boards:read boards:write'] and query['subdomain'] == ['ibm'] and query['state']
    assert query['code_challenge_method'] == ['S256'] and len(query['code_challenge'][0]) == 43
    assert 'sec-XYZ' not in location


def test_connect_without_app_credentials_returns_with_error(tmp_store, vault):
    location = tmp_store.get('/api/monday/connect').headers['Location']
    assert location == f'{parse_frontend_origins()[0]}/?monday=error&reason=not_configured'


def test_callback_with_unknown_state_never_exchanges(tmp_store, vault, fake_monday):
    credentials.save_app('cid', 'sec-XYZ')
    location = tmp_store.get('/api/monday/oauth/callback?state=nope&code=x').headers['Location']
    assert location.endswith('monday=error&reason=bad_state')
    assert fake_monday.calls == []


def test_callback_exchanges_code_with_verifier_and_saves_session(tmp_store, vault, fake_monday):
    expires = time.time() + 3600
    response, query = _sign_in(tmp_store, fake_monday, token=_jwt(expires))
    assert response.headers['Location'].endswith('/?monday=connected')
    token_url, payload, _ = fake_monday.calls[0]
    assert token_url == config.TOKEN_URL
    verifier = payload.pop('code_verifier')
    assert _challenge(verifier) == query['code_challenge'][0]
    assert payload == {'grant_type': 'authorization_code', 'client_id': 'cid', 'client_secret': 'sec-XYZ',
                       'code': 'x', 'redirect_uri': config.REDIRECT_URI}
    api_url, _, headers = fake_monday.calls[1]
    assert api_url == config.API_URL and headers['API-Version'] == '2026-07'
    saved = credentials.load_token()
    assert saved['refresh_token'] == 'ref-1' and saved['user'] == {'id': '7', 'name': 'Abide'}
    assert abs(saved['expires_at'] - expires) < 1


def test_state_is_single_use(tmp_store, vault, fake_monday):
    credentials.save_app('cid', 'sec-XYZ')
    query, _ = _connect(tmp_store)
    fake_monday.queue(config.TOKEN_URL, 200, {'access_token': 'tok-1'})
    fake_monday.queue(config.API_URL, 200, {'data': {'me': {'id': 7, 'name': 'Abide'}}})
    url = f"/api/monday/oauth/callback?state={query['state'][0]}&code=x"
    assert tmp_store.get(url).headers['Location'].endswith('monday=connected')
    assert tmp_store.get(url).headers['Location'].endswith('reason=bad_state')


def test_rejected_code_is_reported(tmp_store, vault, fake_monday):
    credentials.save_app('cid', 'sec-XYZ')
    query, _ = _connect(tmp_store)
    fake_monday.queue(config.TOKEN_URL, 400, {'error': 'invalid_grant'})
    location = tmp_store.get(f"/api/monday/oauth/callback?state={query['state'][0]}&code=x").headers['Location']
    assert location.endswith('reason=exchange_failed') and credentials.load_token() is None


def test_denied_sign_in(tmp_store, vault):
    location = tmp_store.get('/api/monday/oauth/callback?error=access_denied&state=s').headers['Location']
    assert location.endswith('monday=error&reason=denied')


def test_status_never_contains_secrets(tmp_store, vault, fake_monday):
    _sign_in(tmp_store, fake_monday, token='tok-SECRET-1', refresh='ref-SECRET-1')
    response = tmp_store.get('/api/monday/status')
    body = response.get_json()
    assert body['connected'] is True and body['app_configured'] is True and body['user']['name'] == 'Abide'
    for secret in (b'tok-SECRET-1', b'ref-SECRET-1', b'sec-XYZ'):
        assert secret not in response.data


def test_disconnect_revokes_and_forgets(tmp_store, vault, fake_monday):
    _sign_in(tmp_store, fake_monday)
    fake_monday.queue(config.REVOKE_URL, 200, {'success': True})
    assert tmp_store.post('/api/monday/disconnect', json={}).get_json() == {'connected': False}
    revoke_url, payload, _ = fake_monday.calls[-1]
    assert revoke_url == config.REVOKE_URL
    assert payload == {'token': 'ref-1', 'client_id': 'cid', 'client_secret': 'sec-XYZ', 'token_type_hint': 'refresh_token'}
    assert credentials.load_token() is None
    assert tmp_store.get('/api/monday/status').get_json()['connected'] is False


def test_access_token_refreshes_when_close_to_expiry(vault, fake_monday):
    _session(expires_in=60)
    new = _jwt(time.time() + 3600)
    fake_monday.queue(config.TOKEN_URL, 200, {'access_token': new, 'refresh_token': 'r2'})
    assert oauth.access_token() == new
    assert fake_monday.calls[0][1] == {'grant_type': 'refresh_token', 'client_id': 'cid',
                                       'client_secret': 'sec-XYZ', 'refresh_token': 'r1'}
    saved = credentials.load_token()
    assert saved['refresh_token'] == 'r2' and saved['expires_at'] > time.time() + 3000


def test_fresh_token_is_not_refreshed(vault, fake_monday):
    _session(expires_in=3600)
    assert oauth.access_token() == 'tok-old' and fake_monday.calls == []


def test_concurrent_access_token_refreshes_once(vault, monkeypatch):
    _session(expires_in=60)
    new, calls = _jwt(time.time() + 3600), []

    def slow_token_endpoint(url, payload, headers=None, timeout=30):
        calls.append(url)
        time.sleep(0.05)
        return 200, {'access_token': new, 'refresh_token': 'r2'}, {}

    monkeypatch.setattr(oauth, 'post_json', slow_token_endpoint)
    results = []
    threads = [threading.Thread(target=lambda: results.append(oauth.access_token())) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert results == [new, new] and calls == [config.TOKEN_URL]


def test_rejected_refresh_signs_out(vault, fake_monday):
    _session(expires_in=60)
    fake_monday.queue(config.TOKEN_URL, 400, {'error': 'invalid_grant'})
    with pytest.raises(oauth.NotConnected):
        oauth.access_token()
    assert credentials.load_token() is None


def test_network_error_during_refresh_keeps_session(vault, fake_monday):
    _session(expires_in=60)
    fake_monday.queue(config.TOKEN_URL, 0, {})
    with pytest.raises(oauth.OAuthError):
        oauth.access_token()
    assert credentials.load_token()['refresh_token'] == 'r1'


def test_state_changing_routes_need_json(tmp_store, vault):
    assert tmp_store.post('/api/monday/disconnect', data='x').status_code == 415
    assert tmp_store.post('/api/monday/sync', data='x').status_code == 415
    assert tmp_store.post('/api/monday/connect', data='x').status_code == 415


def test_connect_post_opens_the_default_browser(tmp_store, vault, monkeypatch):
    from core.features.integrations.monday import routes
    opened = []
    monkeypatch.setattr(routes.webbrowser, 'open', lambda url: opened.append(url) or True)
    credentials.save_app('cid', 'sec-XYZ')
    body = tmp_store.post('/api/monday/connect', json={}).get_json()
    assert body['opened'] is True and opened == [body['url']] and body['url'].startswith(config.AUTHORIZE_URL)
    assert 'sec-XYZ' not in body['url']


def test_foreign_host_is_refused(tmp_store, vault):
    assert tmp_store.get('/api/monday/status', base_url='http://evil.example:5121').status_code == 403


def test_token_never_logged(tmp_store, vault, fake_monday, caplog, capsys):
    caplog.set_level(logging.DEBUG)
    _sign_in(tmp_store, fake_monday, token='tok-SECRET-2', refresh='ref-SECRET-2')
    tmp_store.get('/api/monday/status')
    captured = capsys.readouterr()
    for secret in ('tok-SECRET-2', 'ref-SECRET-2', 'sec-XYZ'):
        assert secret not in caplog.text + captured.out + captured.err
