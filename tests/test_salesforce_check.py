import pytest

from core.shared import state
from core.shared.opportunity_ids import canonical_id
from core.features.integrations.salesforce import config, credentials, mapping, writer

HOST = 'acme.my.salesforce.com'
INSTANCE = f'https://{HOST}'
DATA = f'/services/data/v{config.API_VERSION}'
ID_A = '006A0000006Vm9rIAC'
ID_A15 = '006A0000006Vm9r'
ID_B = canonical_id('006B0000006Vm9r')
ID_UNKNOWN = canonical_id('006C0000006Vm9r')


def _describe(name, fields):
    return {'name': name, 'fields': fields, 'childRelationships': []}


OPPORTUNITY = _describe('Opportunity', [
    {'name': 'Id'}, {'name': 'Name'}, {'name': 'StageName'}, {'name': 'CloseDate'}, {'name': 'Amount'},
    {'name': 'ForecastCategoryName'},
    {'name': 'AccountId', 'relationshipName': 'Account', 'referenceTo': ['Account']},
    {'name': 'OwnerId', 'relationshipName': 'Owner', 'referenceTo': ['User']},
])
NAMED = [{'name': 'Id'}, {'name': 'Name'}]


def _record(record_id, **values):
    return {'attributes': {'type': 'Opportunity'}, 'Id': record_id, 'Name': 'Acme S/4', 'StageName': 'Qualify',
            'CloseDate': '2026-12-15', 'Amount': 2500000.0, 'ForecastCategoryName': 'Pipeline',
            'Account': {'Name': 'ACME CORPORATION'}, 'Owner': {'Name': 'Ann Lee'}, **values}


@pytest.fixture
def signed_in(sf_vault, fake_salesforce):
    credentials.save_app(HOST, 'consumer-key')
    credentials.save_token({'access_token': 'AT1', 'refresh_token': 'RT1', 'instance_url': INSTANCE,
                            'user': {'id': '005A0000001AbCdEFG', 'name': 'Ann Lee', 'email': 'ann@ibm.com'}})
    fake_salesforce.queue('GET', f'{DATA}/sobjects/Opportunity/describe', 200, OPPORTUNITY)
    fake_salesforce.queue('GET', f'{DATA}/sobjects/Account/describe', 200, _describe('Account', NAMED))
    fake_salesforce.queue('GET', f'{DATA}/sobjects/User/describe', 200, _describe('User', NAMED))
    return fake_salesforce


def _answer(fake, *records):
    fake.queue('GET', f'{DATA}/query', 200, {'totalSize': len(records), 'done': True, 'records': list(records)})


def _seed(number, **fields):
    data = state.load_data()
    deal = {'id': str(len(data['deals']) + 1), 'opportunity_number': number, 'client_name': 'Acme',
            'project_name': 'S4', 'monday_item_id': str(9000 + len(data['deals'])), **fields}
    data['deals'].append(deal)
    state.save_data(data)
    return deal['id']


def _deal(deal_id):
    return state.get_deal_by_id(state.load_data(), deal_id)


def _check(test_client):
    return test_client.post('/api/salesforce/check', json={})


def _queries(fake):
    return [call for call in fake.calls if call['path'] == f'{DATA}/query']


def test_record_values_as_text():
    fields = ['Name', 'StageName', 'CloseDate', 'Amount', 'ForecastCategoryName', 'Account.Name', 'Owner.Name']
    values = mapping.record_values(_record(ID_A, Amount=None, Owner=None), fields)
    assert values == {'opportunity_owner': '', 'sf_name': 'Acme S/4', 'sf_stage': 'Qualify', 'sf_close_date': '2026-12-15',
                      'sf_amount': '', 'sf_forecast_category': 'Pipeline', 'sf_account_name': 'ACME CORPORATION'}
    assert mapping.record_values(_record(ID_A), ['Amount'])['sf_amount'] == '2500000'


def test_fields_the_org_lacks_are_skipped(tmp_store, signed_in):
    _seed(ID_A)
    _answer(signed_in, _record(ID_A))
    summary = _check(tmp_store).get_json()
    assert summary['skipped_fields'] == ['CurrencyIsoCode']
    assert 'CurrencyIsoCode' not in _queries(signed_in)[0]['query']['q'][0]


def test_found_deal_stores_values_and_link(tmp_store, signed_in):
    deal_id = _seed(ID_A)
    _answer(signed_in, _record(ID_A))
    summary = _check(tmp_store).get_json()
    deal = _deal(deal_id)
    assert summary['found'] == 1 and summary['checked'] == 1
    assert deal['salesforce_id'] == ID_A and deal['salesforce_lookup'] == 'found' and deal['salesforce_checked_at']
    assert deal['sf_stage'] == 'Qualify' and deal['sf_amount'] == '2500000' and deal['sf_account_name'] == 'ACME CORPORATION'
    assert deal['opportunity_owner'] == 'Ann Lee' and deal['salesforce_supplied'] == ['opportunity_owner']


def test_each_cell_kind_sets_the_lookup(tmp_store, signed_in):
    short = _seed(ID_A15)
    noted = _seed(f'{ID_B} (renewal)')
    words = _seed('TBD')
    two = _seed(f'{ID_A} / {ID_B}')
    unknown = _seed(ID_UNKNOWN)
    _answer(signed_in, _record(ID_A), _record(ID_B))
    summary = _check(tmp_store).get_json()
    assert {k: summary[k] for k in ('checked', 'found', 'not_returned', 'not_an_id', 'two_ids')} == {
        'checked': 5, 'found': 2, 'not_returned': 1, 'not_an_id': 1, 'two_ids': 1}
    assert _deal(short)['salesforce_id'] == ID_A and _deal(noted)['salesforce_id'] == ID_B
    assert _deal(words)['salesforce_lookup'] == 'not_an_id' and _deal(two)['salesforce_lookup'] == 'two_ids'
    assert _deal(unknown)['salesforce_lookup'] == 'not_returned' and 'salesforce_id' not in _deal(unknown)
    asked = _queries(signed_in)[0]['query']['q'][0]
    assert ID_A in asked and ID_B in asked and ID_UNKNOWN in asked and ID_A15 + "'" not in asked


def test_check_looks_up_in_batches(tmp_store, signed_in):
    data = state.load_data()
    for n in range(450):
        data['deals'].append({'id': str(n + 1), 'opportunity_number': canonical_id(f'006A{n:011d}'),
                              'client_name': 'Acme', 'project_name': 'S4', 'monday_item_id': str(n + 1)})
    state.save_data(data)
    _answer(signed_in)
    assert _check(tmp_store).get_json()['not_returned'] == 450
    sizes = [query['query']['q'][0].count("'006") for query in _queries(signed_in)]
    assert sizes == [200, 200, 50]


def test_off_board_deals_are_skipped(tmp_store, signed_in):
    local = _seed(ID_A, monday_item_id=None)
    gone = _seed(ID_A, monday_missing_since='2026-10-01T00:00:00Z')
    _answer(signed_in, _record(ID_A))
    assert _check(tmp_store).get_json()['checked'] == 0
    assert 'salesforce_lookup' not in _deal(local) and 'salesforce_lookup' not in _deal(gone)


def test_blank_never_overwrites_a_typed_owner(tmp_store, signed_in):
    deal_id = _seed(ID_A, opportunity_owner='Typed Person')
    _answer(signed_in, _record(ID_A, Owner=None))
    summary = _check(tmp_store).get_json()
    deal = _deal(deal_id)
    assert deal['opportunity_owner'] == 'Typed Person' and deal['salesforce_supplied'] == []
    assert summary['replaced'] == []


def test_salesforce_value_replaces_and_locks(tmp_store, signed_in):
    deal_id = _seed(ID_A, opportunity_owner='Typed Person')
    _answer(signed_in, _record(ID_A))
    summary = _check(tmp_store).get_json()
    assert _deal(deal_id)['opportunity_owner'] == 'Ann Lee'
    assert summary['replaced'] == [{'deal_id': deal_id, 'key': 'opportunity_owner', 'label': 'Opportunity Owner', 'old': 'Typed Person'}]
    assert tmp_store.put(f'/api/deals/{deal_id}', json={'opportunity_owner': 'Someone'}).status_code == 409


def test_link_follows_the_number(tmp_store, signed_in):
    deal_id = _seed(ID_A)
    _answer(signed_in, _record(ID_A), _record(ID_B, StageName='Won'))
    _check(tmp_store)
    data = state.load_data()
    state.get_deal_by_id(data, deal_id)['opportunity_number'] = ID_B
    state.save_data(data)
    _check(tmp_store)
    assert _deal(deal_id)['salesforce_id'] == ID_B and _deal(deal_id)['sf_stage'] == 'Won'


def test_stops_resolving_keeps_last_values(tmp_store, signed_in):
    deal_id = _seed(ID_A)
    _answer(signed_in, _record(ID_A))
    _check(tmp_store)
    signed_in._queues[('GET', f'{DATA}/query')] = [(200, {'totalSize': 0, 'done': True, 'records': []}, {})]
    _check(tmp_store)
    deal = _deal(deal_id)
    assert deal['salesforce_lookup'] == 'not_returned' and deal['salesforce_id'] == ID_A
    assert deal['sf_stage'] == 'Qualify' and deal['salesforce_supplied'] == ['opportunity_owner']


def test_check_without_api_access_says_so(tmp_store, sf_vault, fake_salesforce):
    credentials.save_app(HOST, 'consumer-key')
    credentials.save_token({'access_token': 'AT1', 'refresh_token': 'RT1', 'instance_url': INSTANCE, 'user': {}})
    fake_salesforce.queue('GET', f'{DATA}/sobjects/Opportunity/describe', 403,
                          [{'errorCode': 'API_DISABLED_FOR_ORG', 'message': 'API is not enabled for this Organization or Partner'}])
    response = _check(tmp_store)
    assert response.status_code == 403
    assert response.get_json()['kind'] == 'no_api' and 'API access' in response.get_json()['error']


def test_session_expired_refreshes_once(tmp_store, sf_vault, fake_salesforce):
    credentials.save_app(HOST, 'consumer-key')
    credentials.save_token({'access_token': 'AT1', 'refresh_token': 'RT1', 'instance_url': INSTANCE, 'user': {}})
    path = f'{DATA}/sobjects/Opportunity/describe'
    fake_salesforce.queue('GET', path, 401, [{'errorCode': 'INVALID_SESSION_ID', 'message': 'Session expired or invalid'}])
    fake_salesforce.queue('GET', path, 200, OPPORTUNITY)
    fake_salesforce.queue('POST', config.TOKEN_PATH, 200, {'access_token': 'AT2', 'instance_url': INSTANCE})
    fake_salesforce.queue('GET', f'{DATA}/sobjects/Account/describe', 200, _describe('Account', NAMED))
    fake_salesforce.queue('GET', f'{DATA}/sobjects/User/describe', 200, _describe('User', NAMED))
    _seed(ID_A)
    _answer(fake_salesforce, _record(ID_A))
    assert _check(tmp_store).status_code == 200
    describes = [call for call in fake_salesforce.calls if call['path'] == path]
    assert [call['headers']['Authorization'] for call in describes] == ['Bearer AT1', 'Bearer AT2']


def test_not_connected_check_is_401(tmp_store, sf_vault):
    response = _check(tmp_store)
    assert response.status_code == 401 and response.get_json()['kind'] == 'not_connected'


def test_edits_made_during_a_check_are_kept(tmp_store, signed_in, monkeypatch):
    deal_id = _seed(ID_A)
    _answer(signed_in, _record(ID_A))

    def edit_while_salesforce_answers(method, url, **kwargs):
        if '/query' in url:
            data = state.load_data()
            state.get_deal_by_id(data, deal_id)['market'] = 'Canada'
            state.save_data(data)
        return signed_in(method, url, **kwargs)

    from core.features.integrations.salesforce import oauth
    monkeypatch.setattr(oauth, 'request', edit_while_salesforce_answers)
    assert _check(tmp_store).status_code == 200
    deal = _deal(deal_id)
    assert deal['market'] == 'Canada' and deal['sf_stage'] == 'Qualify'


def test_check_needs_json(tmp_store, sf_vault):
    assert tmp_store.post('/api/salesforce/check', data='x').status_code == 415


def test_status_reports_last_check(tmp_store, sf_vault):
    _seed(ID_A, salesforce_checked_at='2026-10-28T10:00:00+00:00')
    assert tmp_store.get('/api/salesforce/status').get_json()['last_check'] == '2026-10-28T10:00:00+00:00'


def test_writer_refuses_a_monday_key():
    with pytest.raises(ValueError):
        writer.write_found({}, ID_A, {'status': 'Active'}, checked_at='2026-10-28T10:00:00+00:00')
