from core.shared import state


def _seed(client, **fields):
    deal = client.post('/api/deals', json={'opportunity_number': 'OPP-9', 'client_name': 'Acme', 'project_name': 'S4'}).get_json()
    data = state.load_data()
    stored = state.get_deal_by_id(data, deal['id'])
    stored.update(fields)
    state.save_data(data)
    return deal['id']


def test_gssm_sync_keeps_deal_owned_financials(tmp_store):
    deal_id = _seed(tmp_store, financials={'service_line_target': 27, 'labor_cost': '50', 'services_revenue': '90'})
    resp = tmp_store.put(f'/api/deals/{deal_id}/gssm-sync', json={
        'financials': {'services_revenue': '100', 'price_type': 'BAFO Price'},
        'gssm_workbook_id': 7,
        'gssm_synced_at': '2026-10-20T12:00:00Z',
    })
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body['financials'] == {'service_line_target': 27, 'services_revenue': '100', 'price_type': 'BAFO Price'}
    assert body['gssm_workbook_id'] == 7


def test_gssm_sync_replaces_gssm_sections_it_sends(tmp_store):
    deal_id = _seed(tmp_store, timelines=[{'name': 'Old'}], staffing={'total_headcount': 3})
    resp = tmp_store.put(f'/api/deals/{deal_id}/gssm-sync', json={'timelines': [{'name': 'New'}]})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['timelines'] == [{'name': 'New'}]
    assert body['staffing'] == {'total_headcount': 3}


def test_gssm_sync_rejects_deal_owned_key(tmp_store):
    deal_id = _seed(tmp_store)
    resp = tmp_store.put(f'/api/deals/{deal_id}/gssm-sync', json={'client_name': 'X'})
    assert resp.status_code == 409
    assert 'client_name' in resp.get_json()['error']
