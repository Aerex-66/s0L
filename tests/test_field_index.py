import json
from pathlib import Path

import pytest

from core.shared import field_index as fi

ROOT = Path(__file__).resolve().parents[1]
OWNERS = {'deal', 'gssm', 'monday', 'salesforce', 'isbd', 'derived', 'system'}


def test_keys_and_aliases_are_unique():
    seen = {}
    for key, entry in fi.FIELDS.items():
        for name in [key, *entry.get('aliases', [])]:
            assert name not in seen, f'{name!r} claimed by both {seen.get(name)} and {key}'
            seen[name] = key


def test_every_field_has_valid_owner_and_path():
    for key, entry in fi.FIELDS.items():
        assert entry['owner'] in OWNERS, key
        if entry['owner'] != 'derived':
            assert entry.get('path'), key
        if entry['owner'] == 'isbd':
            assert entry['path'].startswith('isbd_data.'), key


@pytest.mark.parametrize('name,expected', [
    ('revenue', 'services_revenue'),
    ('price_model', 'contract_type'),
    ('pricing_type', 'price_type'),
    ('risk_level', 'risk_rating'),
    ('exec_client_type', 'client_type'),
    ('opportunity_name', 'project_name'),
    ('bid_date', 'bid_submission_date'),
    ('rfp_request_date', 'rfp_submission_date'),
    ('not_a_field', 'not_a_field'),
])
def test_canonical_key_resolves_old_names(name, expected):
    assert fi.canonical_key(name) == expected


def test_sales_stage_is_monday_owned_on_the_deal():
    assert fi.canonical_key('sales_stage') == 'sales_stage'
    assert fi.owner_of('sales_stage') == 'monday' and fi.path_of('sales_stage') == 'sales_stage'


def test_monday_bindings_cover_the_verified_board_columns():
    bound = {key for key, _ in fi.monday_bindings()}
    assert bound >= {
        'opportunity_number', 'client_name', 'project_name', 'status', 'implementation_type', 'currency',
        'sector', 'industry', 'deal_type', 'estimated_value', 'project_start_date', 'project_end_date',
        'lead_ssc', 'solution_consultant_2', 'solution_consultant_3', 'solution_consultant_4', 'tt_executive',
        'sales_stage', 'swb_stage', 'close_quarter', 'forecast_category', 'lead_sl', 'greenstar_dca_link',
        'solutioning_pov', 'monday_item_id', 'monday_group',
    }


def test_monday_row_metadata_is_never_deal_editable():
    for key in ('monday_item_id', 'monday_group', 'monday_synced_at', 'monday_missing_since'):
        assert not fi.deal_editable(key, {})
    assert fi.deal_editable('status', {}) and not fi.deal_editable('status', {'monday_item_id': '1'})


@pytest.mark.parametrize('label,slide,expected', [
    ('Bid Submission Date', None, 'bid_submission_date'),
    ('TCV / NPV GP%', None, 'tcv'),
    ('Date', 'risk_assessment', 'risk_review_date'),
    ('Date', None, None),
    ('Contract Type', 'risk_assessment', 'contract_type'),
    ('Client', 'executive_summary', 'client_type'),
    ('Client', 'risk_assessment', 'client_name'),
])
def test_isbd_key_for(label, slide, expected):
    assert fi.isbd_key_for(label, slide) == expected


def test_gssm_cells_are_zero_based():
    assert fi.gssm_cell('services_revenue') == ('PTI_Estimator', 29, 1)
    assert fi.gssm_cell('opportunity_number') == ('Home', 21, 9)


@pytest.mark.parametrize('key', [
    'service_line', 'decision_date', 'client_type',
    'engagement_type', 'engagement_source', 'review_status',
])
def test_previously_dropped_fields_are_deal_owned(key):
    assert fi.owner_of(key) == 'deal'
    assert fi.path_of(key) == key


def test_opportunity_owner_fills_from_salesforce():
    assert fi.owner_of('opportunity_owner') == 'salesforce' and fi.path_of('opportunity_owner') == 'opportunity_owner'
    assert dict(fi.salesforce_bindings())['opportunity_owner'] == {'field': 'Owner.Name'}
    assert fi.isbd_key_for('Opportunity Owner') == 'opportunity_owner'


def test_salesforce_fill_fields_editable_until_supplied():
    assert fi.deal_editable('opportunity_owner', {})
    assert fi.deal_editable('opportunity_owner', {'salesforce_id': '006A0000006Vm9rIAC'})
    assert not fi.deal_editable('opportunity_owner', {'salesforce_supplied': ['opportunity_owner']})


def test_salesforce_values_and_link_are_never_deal_editable():
    for key in ('sf_stage', 'sf_amount', 'salesforce_id', 'salesforce_lookup', 'salesforce_checked_at', 'salesforce_supplied'):
        assert fi.owner_of(key) == 'salesforce'
        assert not fi.deal_editable(key, {})


def test_salesforce_link_is_the_matched_id():
    assert fi.is_linked({'salesforce_id': '006A0000006Vm9rIAC'}, 'salesforce')
    assert not fi.is_linked({'monday_item_id': '1'}, 'salesforce')


def test_bindings_name_each_salesforce_field_once():
    fields = {
        'a': {'owner': 'salesforce', 'salesforce': {'field': 'StageName'}},
        'b': {'owner': 'salesforce', 'salesforce': {'field': 'StageName'}},
    }
    with pytest.raises(ValueError):
        fi._build_salesforce(fields)


def test_a_compare_pair_must_name_a_board_column():
    fields = {
        'sf_x': {'owner': 'salesforce', 'salesforce': {'field': 'X', 'compare': {'with': 'price_to_win'}}},
        'price_to_win': {'owner': 'deal'},
    }
    with pytest.raises(ValueError):
        fi._build_salesforce(fields)


def test_compare_pairs_carry_their_translation_table():
    fields = {
        'sf_stage': {'owner': 'salesforce',
                     'salesforce': {'field': 'StageName', 'compare': {'with': 'sales_stage', 'labels': {'Won': 'Closed Won'}}}},
        'sales_stage': {'owner': 'monday', 'monday': {'column_id': 'dropdown_x'}},
        'salesforce_id': {'owner': 'salesforce', 'salesforce': {'source': 'id'}},
    }
    bindings, pairs = fi._build_salesforce(fields)
    assert [key for key, _ in bindings] == ['sf_stage']
    assert pairs == ({'key': 'sf_stage', 'with': 'sales_stage', 'labels': {'Won': 'Closed Won'}},)


def test_label_normalization_matches_shared_fixture():
    cases = json.loads((ROOT / 'shared' / 'test-fixtures' / 'label_cases.json').read_text(encoding='utf-8'))
    for raw, expected in cases:
        assert fi.normalize_label(raw) == expected, raw
