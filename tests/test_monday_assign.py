import base64
import json

import pytest

from core.shared import state
from core.features.integrations.monday import config, credentials, mapping

LEAD, SC2, SC3, TT = 'color_mkqyvgvy', 'color_mksmhqb', 'color_mksmnwx4', 'color_mkqy18z3'
SC4 = 'color_mksmc3ry'
EXEC_EMAIL = 'ed.fox@ibm.com'


def _token(scopes):
    """A stand-in access token: monday puts the granted scopes in the JWT's `per` claim."""
    def part(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b'=').decode()
    return f"{part({'alg': 'none'})}.{part({'per': scopes})}.sig"


def _session(scopes):
    credentials.save_app('cid', 'sec')
    credentials.save_token({'access_token': _token(scopes), 'refresh_token': 'r1', 'expires_at': None,
                            'user': {'id': '7', 'name': 'Abide', 'email': EXEC_EMAIL}})


def _picked(name):
    data = state.load_data()
    data['preferences'] = {'solutioner': name, 'solutioner_email': EXEC_EMAIL, 'scope': 'mine'}
    state.save_data(data)


@pytest.fixture
def can_write(vault, tmp_store):
    _session('me:read,boards:read,boards:write')
    _picked('Ed Fox')


def _seed(**fields):
    data = state.load_data()
    deal = {'id': str(len(data['deals']) + 1), 'opportunity_number': 'opp', 'client_name': 'Contoso',
            'project_name': 'p', 'status': 'Active', **fields}
    data['deals'].append(deal)
    state.save_data(data)
    return deal['id']


def _deal(deal_id):
    return state.get_deal_by_id(state.load_data(), deal_id)


def _column(column_id, *names, deactivated=()):
    return {'id': column_id, 'type': 'status', 'settings': {'labels': [
        {'id': i, 'label': name, 'index': len(names) - i, 'is_deactivated': name in deactivated,
         'is_done': False, 'color': 'working_orange', 'hex': '#fdab3d'}
        for i, name in enumerate(names)
    ]}}


def _labels(*columns):
    """A labels answer; the TT Exec column (with Ed Fox) is added unless the test brings its own."""
    if not any(column['id'] == TT for column in columns):
        columns = (*columns, _column(TT, 'Ed Fox'))
    return {'data': {'boards': [{'columns': list(columns)}]}}


def _changed(item_id, column_id, text):
    return {'data': {'change_multiple_column_values': {'id': item_id, 'column_values': [{'id': column_id, 'text': text}]}}}


def _assign(test_client, deal_id, key='lead_ssc', name='Ann Lee'):
    return test_client.post('/api/monday/assign', json={'deal_id': deal_id, 'key': key, 'name': name})


def test_lead_sc2_sc3_and_tt_exec_are_the_writable_columns():
    assert mapping.writable_columns() == {
        'lead_ssc': LEAD, 'tt_executive': TT, 'solution_consultant_2': SC2, 'solution_consultant_3': SC3,
    }


def test_connect_asks_monday_for_write_access(tmp_store, vault):
    credentials.save_app('cid', 'sec')
    location = tmp_store.get('/api/monday/connect').headers['Location']
    assert 'scope=me%3Aread+boards%3Aread+boards%3Awrite' in location


def test_status_says_whether_the_sign_in_may_change_the_board(tmp_store, vault):
    _session('me:read,boards:read')
    assert tmp_store.get('/api/monday/status').get_json()['can_write'] is False
    _session('me:read,boards:read,boards:write')
    assert tmp_store.get('/api/monday/status').get_json()['can_write'] is True


def test_people_lists_each_columns_active_names_alphabetically(tmp_store, can_write, fake_monday):
    fake_monday.queue(config.API_URL, 200, _labels(
        _column(LEAD, 'Zoe Ray', 'ann lee', 'Gone Guy', deactivated={'Gone Guy'}),
        _column(SC2, 'TBD', 'Bo Chu'), _column(SC3, 'Cy Dee'), _column(TT, 'Ed Fox'),
    ))
    response = tmp_store.get('/api/monday/people')
    assert response.status_code == 200
    assert response.get_json()['columns'] == {
        'lead_ssc': ['ann lee', 'Zoe Ray'], 'solution_consultant_2': ['Bo Chu', 'TBD'],
        'solution_consultant_3': ['Cy Dee'], 'tt_executive': ['Ed Fox'],
    }
    variables = fake_monday.calls[0][1]['variables']
    assert variables['board'] == [config.BOARD_ID] and sorted(variables['columns']) == sorted([LEAD, SC2, SC3, TT])


def test_nothing_reaches_monday_without_a_sign_in_that_may_write(tmp_store, vault, fake_monday):
    credentials.save_app('cid', 'sec')
    deal_id = _seed(monday_item_id='1001')
    assert tmp_store.get('/api/monday/people').status_code == 401
    assert _assign(tmp_store, deal_id).status_code == 401
    _session('me:read,boards:read')
    for response in (tmp_store.get('/api/monday/people'), _assign(tmp_store, deal_id)):
        assert response.status_code == 403 and response.get_json()['kind'] == 'needs_write'
    assert fake_monday.calls == []


def test_assign_sets_the_label_by_id_and_keeps_the_boards_answer(tmp_store, can_write, fake_monday):
    synced = '2026-10-27T00:00:00+00:00'
    deal_id = _seed(monday_item_id='1001', lead_ssc='Zoe Ray', monday_synced_at=synced)
    fake_monday.queue(config.API_URL, 200, _labels(_column(LEAD, 'Zoe Ray', 'Ann Lee')))
    fake_monday.queue(config.API_URL, 200, _changed('1001', LEAD, 'Ann Lee'))

    response = _assign(tmp_store, deal_id)

    assert response.status_code == 200 and response.get_json()['lead_ssc'] == 'Ann Lee'
    lookup, change = (call[1] for call in fake_monday.calls)
    assert sorted(lookup['variables']['columns']) == sorted([LEAD, TT, SC2, SC3, SC4])
    assert change['query'].startswith('mutation') and 'create_labels_if_missing' not in change['query']
    assert change['variables'] == {'board': config.BOARD_ID, 'item': '1001', 'column': LEAD,
                                   'values': json.dumps({LEAD: {'index': 1}})}
    deal = _deal(deal_id)
    assert deal['lead_ssc'] == 'Ann Lee' and deal['monday_synced_at'] == synced


def test_assign_refuses_names_the_column_does_not_offer(tmp_store, can_write, fake_monday):
    deal_id = _seed(monday_item_id='1001', lead_ssc='Zoe Ray')
    fake_monday.queue(config.API_URL, 200, _labels(_column(LEAD, 'Zoe Ray', 'Gone Guy', deactivated={'Gone Guy'})))
    for name in ('Someone New', 'Gone Guy'):
        assert _assign(tmp_store, deal_id, name=name).status_code == 400
    assert not any(call[1]['query'].startswith('mutation') for call in fake_monday.calls)
    assert _deal(deal_id)['lead_ssc'] == 'Zoe Ray'


def test_assign_only_writable_columns_of_linked_deals(tmp_store, can_write, fake_monday):
    linked, unlinked = _seed(monday_item_id='1001'), _seed()
    for deal_id, key, name, status in [
        (linked, 'solution_consultant_4', 'Ann Lee', 400),
        (linked, 'status', 'Active', 400),
        (linked, 'lead_ssc', '  ', 400),
        (unlinked, 'lead_ssc', 'Ann Lee', 409),
        ('404', 'lead_ssc', 'Ann Lee', 404),
    ]:
        assert _assign(tmp_store, deal_id, key, name).status_code == status, key
    assert tmp_store.post('/api/monday/assign', data='deal_id=1').status_code == 415
    assert fake_monday.calls == []


def test_assign_reports_what_monday_said(tmp_store, can_write, fake_monday):
    deal_id = _seed(monday_item_id='1001', lead_ssc='Zoe Ray')
    fake_monday.queue(config.API_URL, 200, _labels(_column(LEAD, 'Zoe Ray', 'Ann Lee')))
    fake_monday.queue(config.API_URL, 200, {'errors': [{'message': 'Item not found', 'extensions': {'code': 'ResourceNotFound'}}]})
    response = _assign(tmp_store, deal_id)
    assert response.status_code == 502 and response.get_json()['error'] == 'Item not found'
    assert _deal(deal_id)['lead_ssc'] == 'Zoe Ray'


@pytest.mark.parametrize('me', ['Zoe Ray', ''])
def test_only_tt_execs_assign(tmp_store, can_write, fake_monday, me):
    _picked(me)
    deal_id = _seed(monday_item_id='1001', lead_ssc='Zoe Ray')
    fake_monday.queue(config.API_URL, 200, _labels(_column(LEAD, 'Zoe Ray', 'Ann Lee')))
    response = _assign(tmp_store, deal_id)
    assert response.status_code == 403 and response.get_json()['kind'] == 'not_exec'
    assert not any(call[1]['query'].startswith('mutation') for call in fake_monday.calls)
    assert _deal(deal_id)['lead_ssc'] == 'Zoe Ray'
