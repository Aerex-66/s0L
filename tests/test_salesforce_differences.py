import base64
import json

import pytest

from core.shared import field_index as fi
from core.shared import reconcile, state
from core.features.integrations.monday import config as monday_config
from core.features.integrations.monday import credentials as monday_credentials
from core.features.integrations.salesforce import credentials as sf_credentials

ID_A = '006A0000006Vm9rIAC'
ID_A15 = '006A0000006Vm9r'
ID_B = '006B0000006Vm9rIAC'
EXEC_EMAIL = 'ed.fox@ibm.com'
TT = 'color_mkqy18z3'
STAGE_COLUMN = fi.FIELDS['sales_stage']['monday']['column_id']


def _deal(number, **fields):
    return {'id': '1', 'opportunity_number': number, 'monday_item_id': '9001', **fields}


def _found(number=ID_A, **fields):
    return _deal(number, salesforce_lookup='found', salesforce_id=ID_A, **fields)


def _kinds(deal):
    return [(row['kind'], row['key']) for row in reconcile.differences(deal)]


@pytest.fixture
def stage_pair(monkeypatch):
    monkeypatch.setattr(fi, 'compare_pairs', lambda: ({'key': 'sf_stage', 'with': 'sales_stage', 'labels': {'Closed Won': 'Won'}},))


# ── what differs ──

def test_unchecked_and_off_board_deals_have_no_differences():
    assert reconcile.differences(_deal('TBD')) == []
    assert reconcile.differences(_found(monday_missing_since='2026-10-01T00:00:00Z')) == []
    assert reconcile.differences({**_found(), 'monday_item_id': None}) == []


def test_each_opportunity_number_problem():
    assert _kinds(_deal('TBD', salesforce_lookup='not_an_id')) == [('not_an_id', 'opportunity_number')]
    assert _kinds(_deal(f'{ID_A} / {ID_B}', salesforce_lookup='two_ids')) == [('two_ids', 'opportunity_number')]
    assert _kinds(_deal(ID_A, salesforce_lookup='not_returned')) == [('not_returned', 'opportunity_number')]
    assert _kinds(_found(f'{ID_A} (renewal)')) == [('extra_text', 'opportunity_number')]
    assert _kinds(_found()) == []


def test_short_id_is_fixable_to_the_full_id():
    [row] = reconcile.differences(_found(ID_A15))
    assert row['kind'] == 'full_id' and row['fixable'] and row['fix'] == ID_A
    assert reconcile.board_fix(_found(ID_A15), 'opportunity_number') == ID_A


def test_a_cell_with_a_note_is_never_rewritten():
    assert reconcile.board_fix(_found(f'{ID_A15} (renewal)'), 'opportunity_number') is None


def test_translated_difference_is_fixable(stage_pair):
    [row] = reconcile.differences(_found(sales_stage='Qualify', sf_stage='Closed Won'))
    assert (row['kind'], row['key'], row['board'], row['salesforce'], row['fix']) == ('value', 'sales_stage', 'Qualify', 'Closed Won', 'Won')
    assert reconcile.differences(_found(sales_stage='won', sf_stage='Closed Won')) == []


def test_untranslated_value_is_investigate_only(stage_pair):
    [row] = reconcile.differences(_found(sales_stage='Qualify', sf_stage='Negotiation'))
    assert row['fixable'] is False and row['fix'] is None


def test_blank_salesforce_value_is_no_difference(stage_pair):
    assert reconcile.differences(_found(sales_stage='Qualify', sf_stage='')) == []


def test_without_a_table_a_difference_is_investigate_only(monkeypatch):
    monkeypatch.setattr(fi, 'compare_pairs', lambda: ({'key': 'sf_stage', 'with': 'sales_stage', 'labels': None},))
    [row] = reconcile.differences(_found(sales_stage='Qualify', sf_stage='Develop'))
    assert row['kind'] == 'value' and row['fix'] is None
    assert reconcile.differences(_found(sales_stage='develop', sf_stage='Develop')) == []


def test_scaled_board_columns_are_investigate_only(monkeypatch):
    monkeypatch.setattr(fi, 'compare_pairs', lambda: ({'key': 'sf_amount', 'with': 'estimated_value', 'labels': None},))
    [row] = reconcile.differences(_found(estimated_value='2000000', sf_amount='2500000'))
    assert row['kind'] == 'value' and row['fix'] is None


def test_values_of_an_older_lookup_are_not_compared(stage_pair):
    assert reconcile.differences(_found(ID_B, sales_stage='Qualify', sf_stage='Closed Won')) == []


# ── the routes ──

def _seed(number, **fields):
    data = state.load_data()
    deal = {'id': str(len(data['deals']) + 1), 'opportunity_number': number, 'client_name': 'Acme', 'project_name': 'S4',
            'monday_item_id': str(9001 + len(data['deals'])), **fields}
    data['deals'].append(deal)
    state.save_data(data)
    return deal['id']


def test_differences_route_lists_rows_with_links(tmp_store, sf_vault):
    sf_credentials.save_app('acme.my.salesforce.com', 'k')
    sf_credentials.save_token({'access_token': 'AT', 'refresh_token': 'RT', 'instance_url': 'https://acme.my.salesforce.com', 'user': {}})
    short = _seed(ID_A15, salesforce_lookup='found', salesforce_id=ID_A, salesforce_checked_at='2026-10-28T10:00:00+00:00')
    words = _seed('TBD', salesforce_lookup='not_an_id')
    body = tmp_store.get('/api/salesforce/differences').get_json()
    rows = {row['deal_id']: row for row in body['differences']}
    assert rows[short]['kind'] == 'full_id' and rows[short]['record_url'] == f'https://acme.my.salesforce.com/{ID_A}'
    assert rows[words]['kind'] == 'not_an_id' and rows[words]['record_url'] is None
    assert body['last_check'] == '2026-10-28T10:00:00+00:00'
    assert 'AT' not in json.dumps(body)


def test_an_older_link_never_opens_another_opportunity(tmp_store, sf_vault):
    sf_credentials.save_app('acme.my.salesforce.com', 'k')
    sf_credentials.save_token({'access_token': 'AT', 'refresh_token': 'RT', 'instance_url': 'https://acme.my.salesforce.com', 'user': {}})
    changed = _seed(ID_B, salesforce_lookup='not_returned', salesforce_id=ID_A)
    [row] = tmp_store.get('/api/salesforce/differences').get_json()['differences']
    assert row['deal_id'] == changed and row['kind'] == 'not_returned' and row['record_url'] is None


def _monday_token(scopes):
    def part(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b'=').decode()
    return f"{part({'alg': 'none'})}.{part({'per': scopes})}.sig"


@pytest.fixture
def exec_signed_in(vault, tmp_store):
    monday_credentials.save_app('cid', 'sec')
    monday_credentials.save_token({'access_token': _monday_token('me:read,boards:read,boards:write'), 'refresh_token': 'r1',
                                   'expires_at': None, 'user': {'id': '7', 'name': 'Abide', 'email': EXEC_EMAIL}})
    data = state.load_data()
    data['preferences'] = {'solutioner': 'Ed Fox', 'solutioner_email': EXEC_EMAIL, 'scope': 'mine'}
    state.save_data(data)


def _execs(fake, *names):
    fake.queue(monday_config.API_URL, 200, {'data': {'boards': [{'columns': [
        {'id': TT, 'type': 'status', 'settings': {'labels': [{'id': i, 'label': name} for i, name in enumerate(names)]}}]}]}})


def _fix(test_client, deal_id, key):
    return test_client.post('/api/monday/fix', json={'deal_id': deal_id, 'key': key})


def test_full_id_fix_renames_the_row_and_keeps_the_boards_answer(exec_signed_in, fake_monday, tmp_store):
    deal_id = _seed(ID_A15, salesforce_lookup='found', salesforce_id=ID_A)
    _execs(fake_monday, 'Ed Fox')
    fake_monday.queue(monday_config.API_URL, 200, {'data': {'change_multiple_column_values': {'id': '9001', 'name': ID_A, 'column_values': []}}})
    response = _fix(tmp_store, deal_id, 'opportunity_number')
    assert response.status_code == 200 and response.get_json()['opportunity_number'] == ID_A
    assert json.loads(fake_monday.calls[-1][1]['variables']['values']) == {'name': ID_A}
    assert state.get_deal_by_id(state.load_data(), deal_id)['opportunity_number'] == ID_A


def test_value_fix_writes_the_boards_own_label(exec_signed_in, fake_monday, tmp_store, stage_pair):
    deal_id = _seed(ID_A, salesforce_lookup='found', salesforce_id=ID_A, sales_stage='Qualify', sf_stage='Closed Won')
    _execs(fake_monday, 'Ed Fox')
    fake_monday.queue(monday_config.API_URL, 200, {'data': {'boards': [{'groups': [], 'columns': [
        {'id': STAGE_COLUMN, 'type': 'dropdown', 'settings': {'labels': [{'id': 1, 'label': 'Qualify'}, {'id': 2, 'label': 'Won'}]}}]}]}})
    fake_monday.queue(monday_config.API_URL, 200, {'data': {'change_multiple_column_values': {
        'id': '9001', 'name': ID_A, 'column_values': [{'id': STAGE_COLUMN, 'text': 'Won'}]}}})
    response = _fix(tmp_store, deal_id, 'sales_stage')
    assert response.status_code == 200 and response.get_json()['sales_stage'] == 'Won'
    assert json.loads(fake_monday.calls[-1][1]['variables']['values']) == {STAGE_COLUMN: {'labels': ['Won']}}


def test_fix_refuses_a_label_the_board_lacks(exec_signed_in, fake_monday, tmp_store, stage_pair):
    deal_id = _seed(ID_A, salesforce_lookup='found', salesforce_id=ID_A, sales_stage='Qualify', sf_stage='Closed Won')
    _execs(fake_monday, 'Ed Fox')
    fake_monday.queue(monday_config.API_URL, 200, {'data': {'boards': [{'groups': [], 'columns': [
        {'id': STAGE_COLUMN, 'type': 'dropdown', 'settings': {'labels': [{'id': 1, 'label': 'Qualify'}]}}]}]}})
    response = _fix(tmp_store, deal_id, 'sales_stage')
    assert response.status_code == 409 and 'Won' in response.get_json()['error']
    assert state.get_deal_by_id(state.load_data(), deal_id)['sales_stage'] == 'Qualify'


def test_fix_refuses_a_cell_with_more_than_the_id(exec_signed_in, fake_monday, tmp_store):
    deal_id = _seed(f'{ID_A15} (renewal)', salesforce_lookup='found', salesforce_id=ID_A)
    assert _fix(tmp_store, deal_id, 'opportunity_number').status_code == 409
    assert fake_monday.calls == []


def test_only_tt_execs_fix_the_board(exec_signed_in, fake_monday, tmp_store):
    deal_id = _seed(ID_A15, salesforce_lookup='found', salesforce_id=ID_A)
    _execs(fake_monday, 'Zoe Ray')
    response = _fix(tmp_store, deal_id, 'opportunity_number')
    assert response.status_code == 403 and response.get_json()['kind'] == 'not_exec'


def test_fix_needs_json_and_a_board_row(exec_signed_in, tmp_store):
    assert tmp_store.post('/api/monday/fix', data='x').status_code == 415
    deal_id = _seed(ID_A15, salesforce_lookup='found', salesforce_id=ID_A, monday_item_id=None)
    assert _fix(tmp_store, deal_id, 'opportunity_number').status_code == 409
