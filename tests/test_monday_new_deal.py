"""New Deal adds a monday row and the linked s0L deal, under the TT Exec rules."""
import base64
import json

import pytest

from core.shared import state
from core.features.integrations.monday import config, credentials

EMAIL = 'ab1@ibm.com'
CLIENT, DESC, IMPL, SECTOR, INDUSTRY, DTYPE = (
    'dropdown_mkqy4mkc', 'text_mkqypdsv', 'color_mkqyaeva', 'dropdown_mksmcb', 'dropdown_mksmkbj8', 'text_mkxcyckc')
LEAD, TT, SC2, SC3, SC4 = 'color_mkqyvgvy', 'color_mkqy18z3', 'color_mksmhqb', 'color_mksmnwx4', 'color_mksmc3ry'
CURRENCY = 'color_mkqyhjk0'


def _token():
    def part(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b'=').decode()
    return f"{part({'alg': 'none'})}.{part({'per': 'me:read,boards:read,boards:write'})}.sig"


@pytest.fixture
def signed_in(vault, tmp_store):
    credentials.save_app('cid', 'sec')
    credentials.save_token({'access_token': _token(), 'refresh_token': 'r1', 'expires_at': None,
                            'user': {'id': '7', 'name': 'AB1@ibm.com', 'email': EMAIL}})


def _me(name):
    data = state.load_data()
    data['preferences'] = {'solutioner': name, 'solutioner_email': EMAIL, 'scope': 'mine'} if name else {}
    state.save_data(data)


def _column(column_id, column_type, *labels):
    settings = {'labels': [{'id': i, 'label': label, 'is_deactivated': False} for i, label in enumerate(labels)]}
    return {'id': column_id, 'type': column_type, 'settings': settings if labels else {}}


SCHEMA = {'data': {'boards': [{
    'groups': [{'id': 'g_sap', 'title': 'SAP'}, {'id': 'g_ora', 'title': 'Oracle'}],
    'columns': [
        _column(CLIENT, 'dropdown', 'Contoso', 'Fabrikam'), _column(DESC, 'text'),
        _column(IMPL, 'status', 'Greenfield', 'Brownfield'), _column(SECTOR, 'dropdown', 'Public'),
        _column(INDUSTRY, 'dropdown', 'Retail'), _column(DTYPE, 'text'),
        _column(CURRENCY, 'status', 'USD', 'EUR', 'N/A'),
        _column(LEAD, 'status', 'Abi Bolatiwa', 'Ann Lee', 'TBD'), _column(TT, 'status', 'Ed Fox', 'TBD'),
        _column(SC2, 'status', 'Bo Chu'), _column(SC3, 'status', 'Cy Dee'), _column(SC4, 'status'),
    ],
}]}}


def _created(cells, group='SAP', name='006A'):
    return {'data': {'create_item': {
        'id': '555', 'name': name, 'group': {'id': 'g_sap', 'title': group},
        'column_values': [{'id': column_id, 'type': 't', 'text': text} for column_id, text in cells.items()],
    }}}


FORM = {
    'group': 'SAP',
    'values': {'opportunity_number': '006A', 'client_name': 'Contoso', 'project_name': 'S/4 rollout',
               'implementation_type': 'greenfield', 'sector': 'Public', 'industry': 'Retail', 'deal_type': 'New Logo',
               'currency': 'eur'},
    'people': {'tt_executive': 'Ed Fox', 'solution_consultant_2': 'Bo Chu'},
    'deal': {'rate_card': 'Yes', 'price_to_win': '9M'},
}


def _post(test_client, **changes):
    body = json.loads(json.dumps(FORM))
    for key, value in changes.items():
        body[key] = {**body[key], **value} if isinstance(value, dict) else value
    return test_client.post('/api/monday/deals', json=body)


def _mutations(fake_monday):
    return [call[1] for call in fake_monday.calls if call[1]['query'].startswith('mutation')]


def test_options_are_the_boards_own_lists(signed_in, tmp_store, fake_monday):
    _me('Abi Bolatiwa')
    fake_monday.queue(config.API_URL, 200, SCHEMA)
    body = tmp_store.get('/api/monday/new-deal').get_json()
    assert body['groups'] == ['SAP', 'Oracle']
    assert body['options']['client_name'] == ['Contoso', 'Fabrikam']
    assert body['options']['implementation_type'] == ['Brownfield', 'Greenfield']
    assert body['options']['currency'] == ['EUR', 'N/A', 'USD']
    assert body['options']['lead_ssc'] == ['Abi Bolatiwa', 'Ann Lee', 'TBD']
    assert body['me'] == {'email': EMAIL, 'name': 'Abi Bolatiwa', 'is_exec': False,
                          'names': ['Abi Bolatiwa', 'Ann Lee', 'Bo Chu', 'Cy Dee', 'Ed Fox']}


def test_a_client_the_board_lists_twice_shows_once_and_still_works(signed_in, tmp_store, fake_monday):
    _me('Abi Bolatiwa')
    doubled = json.loads(json.dumps(SCHEMA))
    doubled['data']['boards'][0]['columns'][0] = _column(CLIENT, 'dropdown', 'Contoso', 'Fabrikam', 'Contoso')
    fake_monday.queue(config.API_URL, 200, doubled)
    assert tmp_store.get('/api/monday/new-deal').get_json()['options']['client_name'] == ['Contoso', 'Fabrikam']
    # The fake replays its last answer, so the schema queued above also serves the create call's lookup.
    fake_monday.queue(config.API_URL, 200, _created({CLIENT: 'Contoso'}))
    assert _post(tmp_store).status_code == 200


def test_non_exec_row_has_them_as_lead_ssc_and_nobody_else(signed_in, tmp_store, fake_monday):
    _me('Abi Bolatiwa')
    fake_monday.queue(config.API_URL, 200, SCHEMA)
    fake_monday.queue(config.API_URL, 200, _created({CLIENT: 'Contoso', DESC: 'S/4 rollout', LEAD: 'Abi Bolatiwa'}))

    response = _post(tmp_store)

    assert response.status_code == 200
    (mutation,) = _mutations(fake_monday)
    variables = mutation['variables']
    assert variables['board'] == config.BOARD_ID and variables['group'] == 'g_sap' and variables['name'] == '006A'
    assert variables['create'] is False
    assert json.loads(variables['values']) == {
        CLIENT: {'labels': ['Contoso']}, DESC: 'S/4 rollout', IMPL: {'label': 'Greenfield'},
        SECTOR: {'labels': ['Public']}, INDUSTRY: {'labels': ['Retail']}, DTYPE: 'New Logo',
        CURRENCY: {'label': 'EUR'}, LEAD: {'label': 'Abi Bolatiwa'},
    }
    deal = response.get_json()
    assert deal['monday_item_id'] == '555' and deal['monday_group'] == 'SAP' and deal['lead_ssc'] == 'Abi Bolatiwa'
    assert deal['opportunity_number'] == '006A' and deal['rate_card'] == 'Yes' and deal['price_to_win'] == '9M'
    assert deal['activities'] and state.get_deal_by_id(state.load_data(), deal['id'])['monday_item_id'] == '555'


def test_exec_writes_chosen_people_and_may_add_a_client(signed_in, tmp_store, fake_monday):
    _me('Ed Fox')
    fake_monday.queue(config.API_URL, 200, SCHEMA)
    fake_monday.queue(config.API_URL, 200, _created({CLIENT: 'Northwind'}))

    response = _post(tmp_store, values={'client_name': 'Northwind'}, people={'lead_ssc': 'Ann Lee'})

    assert response.status_code == 200
    (mutation,) = _mutations(fake_monday)
    values = json.loads(mutation['variables']['values'])
    assert mutation['variables']['create'] is True and values[CLIENT] == {'labels': ['Northwind']}
    assert values[LEAD] == {'label': 'Ann Lee'} and values[TT] == {'label': 'Ed Fox'} and values[SC2] == {'label': 'Bo Chu'}


def test_exec_adding_an_existing_client_does_not_add_labels(signed_in, tmp_store, fake_monday):
    _me('Ed Fox')
    fake_monday.queue(config.API_URL, 200, SCHEMA)
    fake_monday.queue(config.API_URL, 200, _created({CLIENT: 'Contoso'}))
    assert _post(tmp_store, values={'client_name': 'contoso'}).status_code == 200
    (mutation,) = _mutations(fake_monday)
    assert mutation['variables']['create'] is False
    assert json.loads(mutation['variables']['values'])[CLIENT] == {'labels': ['Contoso']}


def test_non_exec_cannot_add_a_client(signed_in, tmp_store, fake_monday):
    _me('Abi Bolatiwa')
    fake_monday.queue(config.API_URL, 200, SCHEMA)
    response = _post(tmp_store, values={'client_name': 'Northwind'})
    assert response.status_code == 400 and 'TT Exec' in response.get_json()['error']
    assert _mutations(fake_monday) == []


def test_non_exec_not_on_lead_ssc_list_is_told_why(signed_in, tmp_store, fake_monday):
    _me('Bo Chu')
    fake_monday.queue(config.API_URL, 200, SCHEMA)
    response = _post(tmp_store)
    assert response.status_code == 409 and 'Lead SSC' in response.get_json()['error']
    assert _mutations(fake_monday) == []


@pytest.mark.parametrize('change, status', [
    ({'values': {'implementation_type': 'Bluefield'}}, 400),
    ({'values': {'currency': 'GBP'}}, 400),
    ({'people': {'tt_executive': 'Nobody'}}, 400),
    ({'group': 'Nowhere'}, 400),
])
def test_anything_not_on_the_board_is_refused(signed_in, tmp_store, fake_monday, change, status):
    _me('Ed Fox')
    fake_monday.queue(config.API_URL, 200, SCHEMA)
    assert _post(tmp_store, **change).status_code == status
    assert _mutations(fake_monday) == []


def test_duplicate_opportunity_number_refused_first(signed_in, tmp_store, fake_monday):
    _me('Ed Fox')
    data = state.load_data()
    data['deals'].append({'id': '1', 'opportunity_number': '006A', 'client_name': 'Contoso', 'project_name': 'x'})
    state.save_data(data)
    assert _post(tmp_store).status_code == 409
    assert fake_monday.calls == []


@pytest.mark.parametrize('missing', ['opportunity_number', 'client_name', 'project_name'])
def test_required_values_are_checked_before_monday(signed_in, tmp_store, fake_monday, missing):
    _me('Ed Fox')
    assert _post(tmp_store, values={missing: '  '}).status_code == 400
    assert fake_monday.calls == []


def test_a_name_must_be_picked_first(signed_in, tmp_store, fake_monday):
    _me('')
    fake_monday.queue(config.API_URL, 200, SCHEMA)
    response = _post(tmp_store)
    assert response.status_code == 409 and response.get_json()['kind'] == 'needs_name'
    assert _mutations(fake_monday) == []


def test_bad_s0l_fields_are_refused_before_monday(signed_in, tmp_store, fake_monday):
    _me('Ed Fox')
    assert _post(tmp_store, deal={'client_name': 'sneaky'}).status_code in (400, 409)
    assert fake_monday.calls == []
