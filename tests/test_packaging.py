"""Packaged-app behavior: data location, built-frontend serving, bundled monday app."""
import io
import json
import urllib.error
from pathlib import Path

import pytest

import core.shared.state as state

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_data_root_defaults_to_repo_root():
    assert Path(state.resolve_data_root({})) == REPO_ROOT


def test_data_root_from_env(tmp_path):
    assert Path(state.resolve_data_root({'S0L_DATA_DIR': str(tmp_path)})) == tmp_path


def test_data_root_ignores_working_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert Path(state.resolve_data_root({})) == REPO_ROOT


def test_calendar_cache_follows_data_root(tmp_path, monkeypatch):
    from core.features.calendar import calendar
    monkeypatch.setattr(state, 'DATA_ROOT', str(tmp_path))
    assert Path(calendar.cache_file()) == tmp_path / 'outlook_calendar_cache.json'


# ── built frontend + /gssm-api proxy ──

class FakeResponse(io.BytesIO):
    def __init__(self, status, body, headers):
        super().__init__(body)
        self.status = status
        self.headers = headers


@pytest.fixture
def shell_client(tmp_path, monkeypatch):
    dist = tmp_path / 'dist'
    (dist / 'assets').mkdir(parents=True)
    (dist / 'index.html').write_text('<!doctype html><div id="root"></div>', encoding='utf-8')
    (dist / 'assets' / 'app.js').write_text('console.log(1)', encoding='utf-8')
    (tmp_path / 'secret.txt').write_text('nope', encoding='utf-8')
    monkeypatch.setenv('S0L_FRONTEND_DIST', str(dist))
    from core.app_factory import create_app
    return create_app().test_client()


def test_serves_index_and_assets(shell_client):
    page = shell_client.get('/')
    assert page.status_code == 200 and b'id="root"' in page.data
    asset = shell_client.get('/assets/app.js')
    assert asset.status_code == 200 and asset.data == b'console.log(1)'


def test_unknown_page_falls_back_to_index(shell_client):
    page = shell_client.get('/deals/42?monday=connected')
    assert page.status_code == 200 and b'id="root"' in page.data


def test_api_404_stays_json(shell_client):
    response = shell_client.get('/api/nope')
    assert response.status_code == 404
    assert response.get_json() == {'error': 'Not found'}


def test_refuses_paths_outside_dist(shell_client):
    response = shell_client.get('/assets/..%2f..%2fsecret.txt')
    assert response.status_code == 404
    assert b'nope' not in response.data


def test_no_dist_no_frontend_routes(monkeypatch):
    monkeypatch.delenv('S0L_FRONTEND_DIST', raising=False)
    from core.app_factory import create_app
    assert create_app().test_client().get('/').status_code == 404


def test_gssm_proxy_forwards_method_body_query(shell_client, monkeypatch):
    from core.shell import frontend
    seen = {}

    def fake_urlopen(request, timeout=None):
        seen.update(url=request.full_url, method=request.get_method(), body=request.data,
                    content_type=request.get_header('Content-type'))
        return FakeResponse(201, b'{"saved": 1}', {'Content-Type': 'application/json'})

    monkeypatch.setattr(frontend, 'urlopen', fake_urlopen)
    response = shell_client.post('/gssm-api/api/engine/edits?workbookId=7', data=b'{"edits": []}',
                                 content_type='application/json')
    assert seen == {'url': 'http://127.0.0.1:5175/api/engine/edits?workbookId=7', 'method': 'POST',
                    'body': b'{"edits": []}', 'content_type': 'application/json'}
    assert response.status_code == 201 and response.get_json() == {'saved': 1}


def test_gssm_proxy_relays_upstream_errors(shell_client, monkeypatch):
    from core.shell import frontend

    def gone(request, timeout=None):
        raise urllib.error.HTTPError(request.full_url, 410, 'Gone', {'Content-Type': 'application/json'},
                                     io.BytesIO(b'{"error": "re-import"}'))

    monkeypatch.setattr(frontend, 'urlopen', gone)
    response = shell_client.get('/gssm-api/api/engine/workbook-formulas')
    assert response.status_code == 410 and response.get_json() == {'error': 're-import'}


def test_gssm_proxy_reports_engine_down(shell_client, monkeypatch):
    from core.shell import frontend

    def down(request, timeout=None):
        raise urllib.error.URLError(ConnectionRefusedError())

    monkeypatch.setattr(frontend, 'urlopen', down)
    response = shell_client.get('/gssm-api/api/engine/workbooks')
    assert response.status_code == 502 and 'error' in response.get_json()


def test_gssm_proxy_refuses_foreign_host(shell_client):
    response = shell_client.get('/gssm-api/api/engine/workbooks', base_url='http://evil.test')
    assert response.status_code == 403


# ── monday app credentials shipped inside the package ──

def test_bundled_app_credentials_win(vault, tmp_path, monkeypatch):
    from core.features.integrations.monday import credentials
    credentials.save_app('store-id', 'store-secret')
    bundled = tmp_path / 'monday-app.json'
    bundled.write_text(json.dumps({'client_id': ' 123 ', 'client_secret': 'abc'}), encoding='utf-8')
    monkeypatch.setenv('S0L_MONDAY_APP', str(bundled))
    assert credentials.load_app() == {'client_id': '123', 'client_secret': 'abc'}


@pytest.mark.parametrize('content', ['{"client_id": "123", "client_secret": ""}', 'not json', '[]', None])
def test_bad_bundled_file_falls_back_to_store(vault, tmp_path, monkeypatch, content):
    from core.features.integrations.monday import credentials
    credentials.save_app('store-id', 'store-secret')
    bundled = tmp_path / 'monday-app.json'
    if content is not None:
        bundled.write_text(content, encoding='utf-8')
    monkeypatch.setenv('S0L_MONDAY_APP', str(bundled))
    assert credentials.load_app() == {'client_id': 'store-id', 'client_secret': 'store-secret'}


def test_no_env_uses_store(vault, monkeypatch):
    from core.features.integrations.monday import credentials
    monkeypatch.delenv('S0L_MONDAY_APP', raising=False)
    credentials.save_app('store-id', 'store-secret')
    assert credentials.load_app() == {'client_id': 'store-id', 'client_secret': 'store-secret'}
