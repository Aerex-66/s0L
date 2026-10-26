from core.features.documents.records import apply_isbd_import
from core.shared import migrations


def _create(client, **extra):
    body = {'opportunity_number': 'OPP-R', 'client_name': 'Acme', 'project_name': 'S4', **extra}
    return client.post('/api/deals', json=body)


def test_null_required_field_is_rejected(tmp_store):
    deal = _create(tmp_store).get_json()
    resp = tmp_store.put(f"/api/deals/{deal['id']}", json={'client_name': None})
    assert resp.status_code == 400


def test_old_and_new_name_for_one_field_in_one_payload_is_rejected(tmp_store):
    deal = _create(tmp_store).get_json()
    resp = tmp_store.put(f"/api/deals/{deal['id']}", json={'price_to_win': '1', 'expected_win_price': '2'})
    assert resp.status_code == 400
    assert 'price_to_win' in resp.get_json()['error']


def test_create_accepts_an_old_name_for_a_required_field(tmp_store):
    resp = tmp_store.post('/api/deals', json={'opportunity_number': 'OPP-O', 'client_name': 'Acme', 'opportunity_name': 'From CSV'})
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()['project_name'] == 'From CSV'


def test_migration_prefers_a_filled_value_over_an_empty_one():
    deal = {'id': '1', 'financials': {'contract_type': '', 'price_model': 'Fixed Price'}}
    migrations.migrate_deal(deal)
    assert deal['financials'] == {'contract_type': 'Fixed Price'}


def test_import_coerces_deal_numbers_and_reports_what_it_did_not_apply():
    deal = {'id': '1', 'client_name': 'Acme', 'price_to_win': '', 'decision_date': ''}
    skipped = apply_isbd_import(deal, {
        'price_to_win': '$5.2M', 'decision_date': '15/12/2026', 'tcv': '$9M', 'client_name': 'Other Co',
        'swb_stage': '3',
    })
    assert deal['price_to_win'] == '5200000'
    assert deal['decision_date'] == ''
    assert deal['isbd_data'] == {'swb_stage': '3'}
    reasons = {item['key']: item['reason'] for item in skipped}
    assert set(reasons) == {'decision_date', 'tcv', 'client_name'}
    assert 'gssm' in reasons['tcv']
