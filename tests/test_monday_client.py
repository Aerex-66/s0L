from pathlib import Path

import pytest

from core.features.integrations.monday import client, config, credentials


@pytest.fixture
def signed_in(vault):
    credentials.save_app('cid', 'sec')
    credentials.save_token({'access_token': 'tok-1', 'refresh_token': 'r1', 'expires_at': None,
                            'user': {'id': '7', 'name': 'Abide'}})


def _items(*ids):
    return [{'id': str(i), 'name': f'row {i}', 'group': {'id': 'g1', 'title': 'SAP'}, 'column_values': []} for i in ids]


def _first_page(items, cursor):
    return {'data': {'boards': [{
        'columns': [{'id': 'name', 'title': 'Opportunity', 'type': 'name'}],
        'groups': [{'id': 'g1', 'title': 'SAP'}],
        'items_page': {'cursor': cursor, 'items': items},
    }]}}


def test_fetch_board_follows_cursor(signed_in, fake_monday):
    fake_monday.queue(config.API_URL, 200, _first_page(_items(1, 2, 3), 'c1'))
    fake_monday.queue(config.API_URL, 200, {'data': {'next_items_page': {'cursor': None, 'items': _items(4, 5, 6)}}})
    board = client.fetch_board()
    assert [item['id'] for item in board['items']] == ['1', '2', '3', '4', '5', '6']
    assert fake_monday.calls[0][1]['variables'] == {'board': [config.BOARD_ID]}
    assert fake_monday.calls[1][1]['variables'] == {'cursor': 'c1'}


def test_requests_carry_version_and_token(signed_in, fake_monday):
    fake_monday.queue(config.API_URL, 200, {'data': {'me': {'id': 1}}})
    client.graphql('{ me { id } }')
    _, _, headers = fake_monday.calls[0]
    assert headers['API-Version'] == '2026-07' and headers['Authorization'] == 'tok-1'


def test_rate_limited_then_ok(signed_in, fake_monday):
    fake_monday.queue(config.API_URL, 429, {}, {'Retry-After': '2'})
    fake_monday.queue(config.API_URL, 200, {'data': {'ok': True}})
    waits = []
    assert client.graphql('{ ok }', sleep=waits.append) == {'ok': True}
    assert waits == [2.0]


def test_complexity_budget_retry(signed_in, fake_monday):
    fake_monday.queue(config.API_URL, 200, {'errors': [{
        'message': 'Complexity budget exhausted',
        'extensions': {'code': 'COMPLEXITY_BUDGET_EXHAUSTED', 'retry_in_seconds': 7},
    }]})
    fake_monday.queue(config.API_URL, 200, {'data': {'ok': True}})
    waits = []
    assert client.graphql('{ ok }', sleep=waits.append) == {'ok': True}
    assert waits == [7.0]


def test_gives_up_after_three_retries(signed_in, fake_monday):
    fake_monday.queue(config.API_URL, 429, {})
    with pytest.raises(client.MondayError) as error:
        client.graphql('{ ok }', sleep=lambda seconds: None)
    assert error.value.kind == 'rate_limited'
    assert len(fake_monday.calls) == 4


def test_401_refreshes_once_then_retries(signed_in, fake_monday):
    fake_monday.queue(config.API_URL, 401, {})
    fake_monday.queue(config.API_URL, 200, {'data': {'ok': True}})
    fake_monday.queue(config.TOKEN_URL, 200, {'access_token': 'tok-2', 'refresh_token': 'r2'})
    assert client.graphql('{ ok }') == {'ok': True}
    api_calls = [headers for url, _, headers in fake_monday.calls if url == config.API_URL]
    assert [h['Authorization'] for h in api_calls] == ['tok-1', 'tok-2']
    assert credentials.load_token()['refresh_token'] == 'r2'


def test_dead_token_signs_out(signed_in, fake_monday):
    fake_monday.queue(config.API_URL, 401, {'errors': [{'message': 'Not Authenticated'}]})
    fake_monday.queue(config.TOKEN_URL, 400, {'error': 'invalid_grant'})
    with pytest.raises(client.MondayError) as error:
        client.fetch_board()
    assert error.value.kind == 'not_connected'
    assert str(error.value) == 'Sign in to monday again (Settings → monday).'
    assert credentials.load_token() is None


def test_still_refused_after_refresh_signs_out(signed_in, fake_monday):
    fake_monday.queue(config.API_URL, 401, {})
    fake_monday.queue(config.TOKEN_URL, 200, {'access_token': 'tok-2', 'refresh_token': 'r2'})
    with pytest.raises(client.MondayError) as error:
        client.graphql('{ ok }')
    assert error.value.kind == 'not_connected' and credentials.load_token() is None


def test_not_signed_in_never_calls_monday(vault, fake_monday):
    with pytest.raises(client.MondayError) as error:
        client.fetch_board()
    assert error.value.kind == 'not_connected' and fake_monday.calls == []


def test_network_failure_is_plain(signed_in, fake_monday):
    fake_monday.queue(config.API_URL, 0, {})
    with pytest.raises(client.MondayError) as error:
        client.graphql('{ ok }')
    assert error.value.kind == 'network'


def test_the_only_writes_set_an_existing_label_or_add_a_row():
    source = Path(client.__file__).read_text(encoding='utf-8')
    assert source.count("'mutation") == 2
    assert 'create_labels_if_missing' not in client._SET_LABEL_MUTATION
    # Adding labels is a per-call choice (only a TT Exec's new client), never hardcoded on.
    assert 'create_labels_if_missing: $create' in client._CREATE_ITEM_MUTATION
    assert 'create_labels_if_missing: true' not in source
