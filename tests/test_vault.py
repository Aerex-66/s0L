from core.shared import state, vault


def _flip(data):
    return data[::-1]


def test_secret_round_trip_and_unreadable_is_none(tmp_path):
    folder = str(tmp_path / 'secrets')
    vault.write_secret(folder, 'token.bin', {'a': 1}, _flip)
    assert vault.read_secret(folder, 'token.bin', _flip) == {'a': 1}

    (tmp_path / 'secrets' / 'junk.bin').write_bytes(b'not json at all')
    assert vault.read_secret(folder, 'junk.bin', _flip) is None
    assert vault.read_secret(folder, 'missing.bin', _flip) is None

    vault.remove_secret(folder, 'token.bin')
    vault.remove_secret(folder, 'token.bin')
    assert vault.read_secret(folder, 'token.bin', _flip) is None


def test_monday_and_salesforce_share_one_lock():
    from core.features.integrations.monday import routes as monday_routes
    from core.features.integrations.salesforce import routes as salesforce_routes
    assert monday_routes._sync_lock is state.SYNC_LOCK
    assert salesforce_routes.SYNC_LOCK is state.SYNC_LOCK
