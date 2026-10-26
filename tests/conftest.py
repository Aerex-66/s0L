import json

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
