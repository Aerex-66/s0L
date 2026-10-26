from core.shared import state

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
