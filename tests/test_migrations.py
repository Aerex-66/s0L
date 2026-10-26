import json

from core.shared import migrations, state


def deal_like_live_1():
    return {
        'id': '1', 'opportunity_number': 'O1', 'client_name': 'Acme', 'project_name': 'S4',
        'financials': {
            'price_model': 'Fixed Price', 'pricing_type': 'BAFO', 'risk_level': '3',
            'revenue': '14105059.1', 'tcv': '14105059.1', '_gssm_source': True,
        },
        'resources': [],
        'isbd_data': {'bid_date': '2026-11-01', 'opportunity_owner': 'Jane', 'tcv': '9', 'geo_market': 'x',
                      '_source_doc_id': 'abc', 'Compliance': [{'compliance_item': 'DPA'}]},
    }


def test_migrate_deal_renames_legacy_financials_to_gssm_names():
    deal = deal_like_live_1()
    assert migrations.migrate_deal(deal) is True
    assert deal['financials'] == {
        'contract_type': 'Fixed Price', 'price_type': 'BAFO Price', 'risk_rating': '3',
        'services_revenue': '14105059.1', 'tcv': '14105059.1',
    }
    assert deal['resources'] == {}


def test_migrate_deal_maps_manual_vocabulary_back_to_workbook_values():
    deal = {'id': '4', 'financials': {
        'pricing_type': 'Indicative', 'contract_type': 'Fixed Price', 'services_revenue': '7800000', 'tcv': '8500000',
    }}
    migrations.migrate_deal(deal)
    assert deal['financials'] == {
        'price_type': 'Indicative Price', 'contract_type': 'Fixed Price', 'services_revenue': '7800000', 'tcv': '8500000',
    }


def test_canonical_key_wins_over_old_name_in_same_section():
    deal = {'id': '5', 'financials': {'revenue': 'old', 'services_revenue': 'new'}}
    migrations.migrate_deal(deal)
    assert deal['financials'] == {'services_revenue': 'new'}


def test_migrate_deal_routes_isbd_keys_to_their_owners():
    deal = deal_like_live_1()
    migrations.migrate_deal(deal)
    assert deal['isbd_data'] == {
        'bid_submission_date': '2026-11-01', '_source_doc_id': 'abc', 'Compliance': [{'compliance_item': 'DPA'}],
    }
    assert deal['opportunity_owner'] == 'Jane'


def test_deal_value_wins_over_isbd_copy():
    deal = {'id': '6', 'opportunity_owner': 'Deal Owner', 'isbd_data': {'opportunity_owner': 'Deck Owner'}}
    migrations.migrate_deal(deal)
    assert deal['opportunity_owner'] == 'Deal Owner'
    assert deal['isbd_data'] == {}


def test_migrate_deal_is_idempotent():
    deal = deal_like_live_1()
    migrations.migrate_deal(deal)
    assert migrations.migrate_deal(deal) is False


def test_load_data_backs_up_once(tmp_path, monkeypatch):
    data_file = tmp_path / 'deals_data.json'
    original = {'deals': [deal_like_live_1()], 'master_contacts': [], 'default_approvers': {}, '_contacts_migrated': True}
    data_file.write_text(json.dumps(original), encoding='utf-8')
    monkeypatch.setattr(state, 'DATA_FILE', str(data_file))
    monkeypatch.setattr(state, '_migrated', False)

    data = state.load_data()

    assert data['deals'][0]['financials']['price_type'] == 'BAFO Price'
    backups = list(tmp_path.glob('deals_data.backup-*.json'))
    assert len(backups) == 1
    assert json.loads(backups[0].read_text(encoding='utf-8')) == original
    assert json.loads(data_file.read_text(encoding='utf-8'))['deals'][0]['financials']['price_type'] == 'BAFO Price'

    monkeypatch.setattr(state, '_migrated', False)
    state.load_data()
    assert len(list(tmp_path.glob('deals_data.backup-*.json'))) == 1
