PREVIOUSLY_DROPPED = {
    'opportunity_owner': 'Jane Doe',
    'service_line': 'SAP S/4HANA',
    'decision_date': '2026-12-01',
    'client_type': 'New',
    'engagement_type': 'New Business',
    'engagement_source': 'RFI/RFP',
    'review_status': 'Repeat',
}


def _create(client):
    resp = client.post('/api/deals', json={'opportunity_number': 'OPP-1', 'client_name': 'Acme', 'project_name': 'S4'})
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()


def _get(client, deal_id):
    return client.get(f'/api/deals/{deal_id}').get_json()


def test_put_persists_previously_dropped_fields(tmp_store):
    deal = _create(tmp_store)
    resp = tmp_store.put(f"/api/deals/{deal['id']}", json=PREVIOUSLY_DROPPED)
    assert resp.status_code == 200, resp.get_json()
    stored = _get(tmp_store, deal['id'])
    for key, value in PREVIOUSLY_DROPPED.items():
        assert stored.get(key) == value, key


def test_put_unknown_field_returns_400_naming_it(tmp_store):
    deal = _create(tmp_store)
    resp = tmp_store.put(f"/api/deals/{deal['id']}", json={'client_name': 'Acme 2', 'not_a_field': 1})
    assert resp.status_code == 400
    assert 'not_a_field' in resp.get_json()['error']
    assert _get(tmp_store, deal['id'])['client_name'] == 'Acme'


def test_put_alias_resolves_to_canonical(tmp_store):
    deal = _create(tmp_store)
    resp = tmp_store.put(f"/api/deals/{deal['id']}", json={'exec_client_type': 'New'})
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body['client_type'] == 'New'
    assert 'exec_client_type' not in body


def test_new_deal_resources_is_object_and_put_resources_ok(tmp_store):
    deal = _create(tmp_store)
    assert deal['resources'] == {}
    leadership = [{'role': 'Delivery Partner', 'assigned_to': 'Ada'}]
    resp = tmp_store.put(f"/api/deals/{deal['id']}/resources", json={'leadership': leadership})
    assert resp.status_code == 200
    assert _get(tmp_store, deal['id'])['resources']['leadership'] == leadership


def test_contact_update_cannot_change_id(tmp_store):
    deal = _create(tmp_store)
    tmp_store.post(f"/api/deals/{deal['id']}/contacts", json={'name': 'Ann'})
    resp = tmp_store.put(f"/api/deals/{deal['id']}/contacts/1", json={'name': 'Bea', 'id': 99})
    assert resp.status_code == 400
    assert 'id' in resp.get_json()['error']
    resp = tmp_store.put(f"/api/deals/{deal['id']}/contacts/1", json={'name': 'Bea'})
    assert resp.status_code == 200
    contacts = _get(tmp_store, deal['id'])['contacts']
    assert [(c['id'], c['name']) for c in contacts] == [(1, 'Bea')]


def test_put_financials_merges_not_replaces(tmp_store):
    from core.shared import state
    deal = _create(tmp_store)
    data = state.load_data()
    state.get_deal_by_id(data, deal['id'])['financials'] = {'services_revenue': '1'}
    state.save_data(data)
    assert tmp_store.put(f"/api/deals/{deal['id']}", json={'financials': {'service_line_target': 27}}).status_code == 200
    assert _get(tmp_store, deal['id'])['financials'] == {'services_revenue': '1', 'service_line_target': 27}
