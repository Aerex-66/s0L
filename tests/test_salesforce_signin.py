from urllib.parse import parse_qs, urlsplit

import pytest

from core.features.integrations.salesforce import config, credentials, oauth, provision

HOST = 'acme.my.salesforce.com'
INSTANCE = f'https://{HOST}'
USER_ID = '005A0000001AbCdEFG'
QUERY_PATH = f'/services/data/v{config.API_VERSION}/query'


def _app(release=False):
    credentials.save_app(HOST, 'consumer-key', release=release)


def _token_body(**extra):
    return {'access_token': 'AT1', 'refresh_token': 'RT1', 'instance_url': INSTANCE, 'token_type': 'Bearer',
            'id': f'https://login.salesforce.com/id/00D000000000001EAA/{USER_ID}', **extra}


def _queue_sign_in(fake, **extra):
    fake.queue('POST', config.TOKEN_PATH, 200, _token_body(**extra))
    fake.queue('GET', QUERY_PATH, 200, {'totalSize': 1, 'done': True, 'records': [{'Name': 'Ann Lee', 'Email': 'ann@ibm.com'}]})


def _begin():
    url = oauth.begin()
    return url, parse_qs(urlsplit(url).query)


def _signed_in():
    credentials.save_token({'access_token': 'AT1', 'refresh_token': 'RT1', 'instance_url': INSTANCE,
                            'user': {'id': USER_ID, 'name': 'Ann Lee', 'email': 'ann@ibm.com'}})


def test_authorize_url_uses_pkce_and_no_secret(sf_vault):
    _app()
    url, query = _begin()
    assert url.startswith(f'https://{HOST}{config.AUTHORIZE_PATH}?')
    assert query['client_id'] == ['consumer-key'] and query['response_type'] == ['code']
    assert query['redirect_uri'] == [config.REDIRECT_URI] and query['scope'] == [config.SCOPES]
    assert query['code_challenge_method'] == ['S256'] and query['code_challenge'][0] and query['state'][0]
    assert 'client_secret' not in query


def test_no_app_no_sign_in(sf_vault):
    with pytest.raises(oauth.OAuthError) as error:
        oauth.begin()
    assert error.value.reason == 'not_configured'


def test_sign_in_exchanges_the_code_without_a_secret(sf_vault, fake_salesforce):
    _app()
    _, query = _begin()
    _queue_sign_in(fake_salesforce)
    assert oauth.finish(query['state'][0], 'the-code') == {'id': USER_ID, 'name': 'Ann Lee', 'email': 'ann@ibm.com'}

    exchange, lookup = fake_salesforce.calls
    assert exchange['url'] == f'https://{HOST}{config.TOKEN_PATH}'
    assert exchange['form']['grant_type'] == 'authorization_code' and exchange['form']['code'] == 'the-code'
    assert exchange['form']['code_verifier'] and 'client_secret' not in exchange['form']
    assert lookup['url'].startswith(INSTANCE) and USER_ID in lookup['query']['q'][0]
    assert lookup['headers']['Authorization'] == 'Bearer AT1'
    saved = credentials.load_token()
    assert saved['refresh_token'] == 'RT1' and saved['instance_url'] == INSTANCE


def test_a_state_works_once(sf_vault, fake_salesforce):
    _app()
    _, query = _begin()
    _queue_sign_in(fake_salesforce)
    oauth.finish(query['state'][0], 'c')
    with pytest.raises(oauth.OAuthError) as error:
        oauth.finish(query['state'][0], 'c')
    assert error.value.reason == 'bad_state'


def test_a_token_for_another_host_is_refused(sf_vault, fake_salesforce):
    _app()
    _, query = _begin()
    fake_salesforce.queue('POST', config.TOKEN_PATH, 200, _token_body(instance_url='https://evil.example.com'))
    with pytest.raises(oauth.OAuthError) as error:
        oauth.finish(query['state'][0], 'c')
    assert error.value.reason == 'exchange_failed' and credentials.load_token() is None


def test_sign_in_without_api_access_says_so(sf_vault, fake_salesforce):
    _app()
    _, query = _begin()
    fake_salesforce.queue('POST', config.TOKEN_PATH, 200, _token_body())
    fake_salesforce.queue('GET', QUERY_PATH, 403, [{'errorCode': 'API_DISABLED_FOR_ORG', 'message': 'API is not enabled'}])
    fake_salesforce.queue('POST', config.REVOKE_PATH, 200, {})
    with pytest.raises(oauth.OAuthError) as error:
        oauth.finish(query['state'][0], 'c')
    assert error.value.reason == 'no_api' and credentials.load_token() is None
    assert fake_salesforce.calls[-1]['path'] == config.REVOKE_PATH and fake_salesforce.calls[-1]['form'] == {'token': 'RT1'}


def test_tokens_never_reach_the_log(tmp_store, sf_vault, fake_salesforce, caplog):
    caplog.set_level('DEBUG')
    _app()
    _, query = _begin()
    _queue_sign_in(fake_salesforce)
    tmp_store.get(f"/api/salesforce/oauth/callback?state={query['state'][0]}&code=c")
    tmp_store.get('/api/salesforce/status')
    assert credentials.load_token()['access_token'] == 'AT1'
    assert 'AT1' not in caplog.text and 'RT1' not in caplog.text


def test_a_refused_refresh_forgets_the_sign_in(sf_vault, fake_salesforce):
    _app()
    _signed_in()
    fake_salesforce.queue('POST', config.TOKEN_PATH, 400, {'error': 'invalid_grant'})
    with pytest.raises(oauth.NotConnected):
        oauth.refresh()
    assert credentials.load_token() is None


def test_refresh_keeps_the_refresh_token_unless_a_new_one_comes(sf_vault, fake_salesforce):
    _app()
    _signed_in()
    fake_salesforce.queue('POST', config.TOKEN_PATH, 200, {'access_token': 'AT2', 'instance_url': INSTANCE})
    assert oauth.refresh() == 'AT2'
    assert fake_salesforce.calls[0]['form'] == {'grant_type': 'refresh_token', 'client_id': 'consumer-key', 'refresh_token': 'RT1'}
    assert credentials.load_token()['refresh_token'] == 'RT1'


def test_sign_out_revokes_and_forgets(sf_vault, fake_salesforce):
    _app()
    _signed_in()
    fake_salesforce.queue('POST', config.REVOKE_PATH, 200, {})
    oauth.sign_out()
    assert fake_salesforce.calls[0]['form'] == {'token': 'RT1'}
    assert credentials.load_token() is None


@pytest.mark.parametrize('error,reason', [('access_denied', 'denied'), ('OAUTH_APP_BLOCKED', 'not_allowed'), ('anything', 'not_allowed')])
def test_callback_errors_become_plain_reasons(tmp_store, error, reason):
    response = tmp_store.get(f'/api/salesforce/oauth/callback?error={error}&error_description=x')
    assert response.status_code == 302
    assert 'salesforce=error' in response.headers['Location'] and f'reason={reason}' in response.headers['Location']


def test_callback_success_redirects_connected(tmp_store, sf_vault, fake_salesforce):
    _app()
    _, query = _begin()
    _queue_sign_in(fake_salesforce)
    response = tmp_store.get(f"/api/salesforce/oauth/callback?state={query['state'][0]}&code=c")
    assert 'salesforce=connected' in response.headers['Location']


def test_status_never_shows_a_token(tmp_store, sf_vault):
    _app()
    _signed_in()
    response = tmp_store.get('/api/salesforce/status')
    text = response.get_data(as_text=True)
    assert 'AT1' not in text and 'RT1' not in text and 'consumer-key' not in text
    status = response.get_json()
    assert status['connected'] and status['app_configured'] and status['user']['name'] == 'Ann Lee'


def test_status_without_an_app(tmp_store, sf_vault):
    status = tmp_store.get('/api/salesforce/status').get_json()
    assert status['app_configured'] is False and status['connected'] is False


def test_connect_needs_json_and_an_app(tmp_store, sf_vault, monkeypatch):
    assert tmp_store.post('/api/salesforce/connect', data='x').status_code == 415
    assert tmp_store.post('/api/salesforce/connect', json={}).status_code == 409
    _app()
    from core.features.integrations.salesforce import routes
    opened = []
    monkeypatch.setattr(routes.webbrowser, 'open', lambda url: opened.append(url) or True)
    assert tmp_store.post('/api/salesforce/connect', json={}).get_json()['opened']
    assert opened[0].startswith(f'https://{HOST}/')


def test_disconnect_needs_json(tmp_store, sf_vault):
    assert tmp_store.post('/api/salesforce/disconnect', data='x').status_code == 415


def test_foreign_host_is_refused(tmp_store):
    assert tmp_store.get('/api/salesforce/status', headers={'Host': 'evil.example.com'}).status_code == 403


@pytest.mark.parametrize('host,ok', [
    ('acme.my.salesforce.com', True), ('acme--dev.sandbox.my.salesforce.com', True), ('acme.lightning.force.com', True),
    ('salesforce.com.evil.io', False), ('https://acme.my.salesforce.com', False), ('', False),
    ('acme.my.salesforce.com/x', False),
])
def test_only_salesforce_hosts(host, ok):
    assert credentials.valid_host(host) is ok


def test_bundled_app_wins_and_bad_files_are_ignored(sf_vault, tmp_path, monkeypatch):
    _app()
    bundled = tmp_path / 'salesforce-app.json'
    bundled.write_text('{"host": "ibm.my.salesforce.com", "client_id": "ibm-key", "release": true}', encoding='utf-8')
    monkeypatch.setenv('S0L_SALESFORCE_APP', str(bundled))
    assert credentials.load_app() == {'host': 'ibm.my.salesforce.com', 'client_id': 'ibm-key', 'release': True}
    bundled.write_text('{"host": "evil.example.com", "client_id": "x"}', encoding='utf-8')
    assert credentials.load_app() == {'host': HOST, 'client_id': 'consumer-key', 'release': False}


def test_provision_stores_the_app_and_refuses_other_hosts(sf_vault, monkeypatch):
    answers = iter(['evil.example.com'])
    monkeypatch.setattr('builtins.input', lambda prompt: next(answers))
    assert provision.main() == 1 and credentials.load_app() is None

    answers = iter(['https://ACME.my.salesforce.com/', 'consumer-key', 'y'])
    monkeypatch.setattr('builtins.input', lambda prompt: next(answers))
    assert provision.main() == 0
    assert credentials.load_app() == {'host': HOST, 'client_id': 'consumer-key', 'release': True}
