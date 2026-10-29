import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

import core.shared.state as state


@pytest.fixture
def tmp_store(tmp_path, monkeypatch):
    """Flask test client backed by a throwaway deals file; the live deals_data.json is never touched."""
    data_file = tmp_path / 'deals_data.json'
    data_file.write_text(json.dumps({
        'deals': [], 'master_contacts': [], 'default_approvers': {}, '_contacts_migrated': True,
    }), encoding='utf-8')
    monkeypatch.setattr(state, 'DATA_FILE', str(data_file))
    monkeypatch.setattr(state, '_migrated', False)

    from core.app_factory import create_app
    client = create_app().test_client()
    client.data_file = data_file
    yield client


@pytest.fixture
def vault(tmp_path, monkeypatch):
    """Throwaway monday secrets folder with a reversible stand-in for DPAPI."""
    from core.features.integrations.monday import credentials
    monkeypatch.setattr(credentials, 'SECRETS_DIR', str(tmp_path / 'vault'))
    monkeypatch.setattr(credentials, 'protect', lambda data: data[::-1])
    monkeypatch.setattr(credentials, 'unprotect', lambda blob: blob[::-1])
    return tmp_path / 'vault'


class FakeMonday:
    """Stands in for every HTTP call to monday: queue (status, body, headers) per URL; the last one repeats."""

    def __init__(self):
        self.calls = []
        self._queues = {}

    def queue(self, url, status, body, headers=None):
        self._queues.setdefault(url, []).append((status, body, headers or {}))

    def __call__(self, url, payload, headers=None, timeout=30):
        self.calls.append((url, payload, headers or {}))
        queued = self._queues.get(url)
        if not queued:
            raise AssertionError(f'unexpected call to {url}')
        return queued.pop(0) if len(queued) > 1 else queued[0]


@pytest.fixture
def fake_monday(monkeypatch):
    from core.features.integrations.monday import oauth
    fake = FakeMonday()
    monkeypatch.setattr(oauth, 'post_json', fake)
    return fake


@pytest.fixture
def board():
    """Synthetic deal board with the real column ids; names are invented."""
    return json.loads((Path(__file__).parent / 'fixtures' / 'monday_board.json').read_text(encoding='utf-8'))


@pytest.fixture
def sf_vault(tmp_path, monkeypatch):
    """Throwaway Salesforce secrets folder with a reversible stand-in for DPAPI; no bundled app."""
    from core.features.integrations.salesforce import credentials
    monkeypatch.setattr(credentials, 'SECRETS_DIR', str(tmp_path / 'sf-vault'))
    monkeypatch.setattr(credentials, 'protect', lambda data: data[::-1])
    monkeypatch.setattr(credentials, 'unprotect', lambda blob: blob[::-1])
    monkeypatch.delenv('S0L_SALESFORCE_APP', raising=False)
    return tmp_path / 'sf-vault'


class FakeSalesforce:
    """Stands in for every HTTP call to Salesforce: queue (status, body) per (method, path); the last one repeats."""

    def __init__(self):
        self.calls = []
        self._queues = {}

    def queue(self, method, path, status, body, headers=None):
        self._queues.setdefault((method, path), []).append((status, body, headers or {}))

    def __call__(self, method, url, *, form=None, headers=None, timeout=30):
        parts = urlsplit(url)
        self.calls.append({'method': method, 'url': url, 'path': parts.path, 'query': parse_qs(parts.query),
                           'form': form, 'headers': headers or {}})
        queued = self._queues.get((method, parts.path))
        if not queued:
            raise AssertionError(f'unexpected {method} {url}')
        return queued.pop(0) if len(queued) > 1 else queued[0]


@pytest.fixture
def fake_salesforce(monkeypatch):
    from core.features.integrations.salesforce import oauth
    fake = FakeSalesforce()
    monkeypatch.setattr(oauth, 'request', fake)
    return fake
