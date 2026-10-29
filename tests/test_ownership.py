from core.shared import state
from core.features.deals.writes import prepare_deal_write

TIMELINE = [{'name': 'Main', 'timeline': {'Prepare': {'duration': 2, 'unit': 'months'}}}]


def _seed(client, **fields):
    deal = client.post('/api/deals', json={'opportunity_number': 'OPP-5', 'client_name': 'Acme', 'project_name': 'S4'}).get_json()
    data = state.load_data()
    state.get_deal_by_id(data, deal['id']).update(fields)
    state.save_data(data)
    return deal['id']


def test_generic_put_refuses_gssm_values(tmp_store):
    deal_id = _seed(tmp_store)
    resp = tmp_store.put(f'/api/deals/{deal_id}', json={'financials': {'services_revenue': '1'}})
    assert resp.status_code == 409
    assert 'services_revenue' in resp.get_json()['error']


def test_financials_route_refuses_gssm_values(tmp_store):
    deal_id = _seed(tmp_store)
    resp = tmp_store.put(f'/api/deals/{deal_id}/financials', json={'labor_cost': 1})
    assert resp.status_code == 409


def test_financials_route_accepts_the_deal_owned_target(tmp_store):
    deal_id = _seed(tmp_store, financials={'services_revenue': '100'})
    resp = tmp_store.put(f'/api/deals/{deal_id}/financials', json={'service_line_target': 30})
    assert resp.status_code == 200
    stored = state.get_deal_by_id(state.load_data(), deal_id)['financials']
    assert stored == {'services_revenue': '100', 'service_line_target': 30}


def test_timeline_is_editable_until_gssm_is_linked(tmp_store):
    unlinked = _seed(tmp_store)
    assert tmp_store.put(f'/api/deals/{unlinked}/timeline', json={'timelines': TIMELINE}).status_code == 200
    assert tmp_store.put(f'/api/deals/{unlinked}', json={'timelines': TIMELINE}).status_code == 200


def test_timeline_is_read_only_once_linked(tmp_store):
    linked = _seed(tmp_store, gssm_workbook_id=7)
    assert tmp_store.put(f'/api/deals/{linked}/timeline', json={'timelines': TIMELINE}).status_code == 409
    assert tmp_store.put(f'/api/deals/{linked}', json={'timelines': TIMELINE}).status_code == 409


def test_synced_before_links_existed_counts_as_linked(tmp_store):
    synced = _seed(tmp_store, gssm_synced_at='2026-09-22T09:30:04Z')
    assert tmp_store.put(f'/api/deals/{synced}/timeline', json={'timelines': TIMELINE}).status_code == 409


def test_monday_fields_editable_until_linked(tmp_store):
    deal_id = _seed(tmp_store)
    assert tmp_store.put(f'/api/deals/{deal_id}', json={'status': 'Active', 'sales_stage': 'Won'}).status_code == 200


def test_monday_fields_refused_once_linked(tmp_store):
    deal_id = _seed(tmp_store, monday_item_id='1001')
    response = tmp_store.put(f'/api/deals/{deal_id}', json={'status': 'Active'})
    assert response.status_code == 409 and 'status' in response.get_json()['error']
    assert tmp_store.put(f'/api/deals/{deal_id}', json={'market': 'Canada'}).status_code == 200


def test_monday_row_fields_never_client_writable(tmp_store):
    deal_id = _seed(tmp_store)
    assert tmp_store.put(f'/api/deals/{deal_id}', json={'monday_item_id': '9'}).status_code == 409


def test_gssm_link_does_not_lock_monday_fields(tmp_store):
    deal_id = _seed(tmp_store, gssm_workbook_id=7)
    assert tmp_store.put(f'/api/deals/{deal_id}', json={'client_name': 'Other'}).status_code == 200


def test_monday_link_does_not_lock_gssm_timelines(tmp_store):
    deal_id = _seed(tmp_store, monday_item_id='1001')
    assert tmp_store.put(f'/api/deals/{deal_id}/timeline', json={'timelines': TIMELINE}).status_code == 200


def test_gssm_sync_refuses_monday_fields(tmp_store):
    deal_id = _seed(tmp_store)
    assert tmp_store.put(f'/api/deals/{deal_id}/gssm-sync', json={'status': 'X'}).status_code == 409


def test_monday_writer_may_clear_required_fields():
    changes, error = prepare_deal_write({}, {'client_name': ''}, owners={'monday'}, enforce_required=False)
    assert error is None and changes == {'client_name': ''}


def test_opportunity_owner_editable_until_salesforce_supplies_it(tmp_store):
    deal_id = _seed(tmp_store, salesforce_id='006A0000006Vm9rIAC')
    assert tmp_store.put(f'/api/deals/{deal_id}', json={'opportunity_owner': 'Ann Lee'}).status_code == 200
    data = state.load_data()
    state.get_deal_by_id(data, deal_id)['salesforce_supplied'] = ['opportunity_owner']
    state.save_data(data)
    response = tmp_store.put(f'/api/deals/{deal_id}', json={'opportunity_owner': 'Ann Lee'})
    assert response.status_code == 409 and 'opportunity_owner' in response.get_json()['error']


def test_salesforce_values_never_client_writable(tmp_store):
    deal_id = _seed(tmp_store)
    for payload in ({'sf_stage': 'Won'}, {'salesforce_id': '006A0000006Vm9rIAC'}, {'salesforce_supplied': []}):
        assert tmp_store.put(f'/api/deals/{deal_id}', json=payload).status_code == 409
