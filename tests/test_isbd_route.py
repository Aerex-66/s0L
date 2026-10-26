from core.shared import state


def _seed(client):
    deal = client.post('/api/deals', json={'opportunity_number': 'OPP-7', 'client_name': 'Acme', 'project_name': 'S4'}).get_json()
    return deal['id']


def test_put_isbd_keeps_isbd_content_and_canonicalizes_old_keys(tmp_store):
    deal_id = _seed(tmp_store)
    resp = tmp_store.put(f'/api/deals/{deal_id}/isbd', json={'bid_date': '2026-11-01', 'Compliance': [{'item': 'DPA'}]})
    assert resp.status_code == 200, resp.get_json()
    stored = state.get_deal_by_id(state.load_data(), deal_id)['isbd_data']
    assert stored == {'bid_submission_date': '2026-11-01', 'Compliance': [{'item': 'DPA'}]}


def test_put_isbd_refuses_fields_owned_elsewhere(tmp_store):
    deal_id = _seed(tmp_store)
    resp = tmp_store.put(f'/api/deals/{deal_id}/isbd', json={'client_name': 'X', 'tcv': '$5M'})
    assert resp.status_code == 409
    error = resp.get_json()['error']
    assert 'client_name' in error and 'tcv' in error
