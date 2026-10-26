import json
from pathlib import Path

import pytest

from core.shared import field_index as fi

ROOT = Path(__file__).resolve().parents[1]
OWNERS = {'deal', 'gssm', 'isbd', 'derived', 'system'}


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


def test_sales_stage_is_its_own_isbd_field():
    assert fi.canonical_key('sales_stage') == 'sales_stage'
    assert fi.owner_of('sales_stage') == 'isbd'


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
    'opportunity_owner', 'service_line', 'decision_date', 'client_type',
    'engagement_type', 'engagement_source', 'review_status',
])
def test_previously_dropped_fields_are_deal_owned(key):
    assert fi.owner_of(key) == 'deal'
    assert fi.path_of(key) == key


def test_label_normalization_matches_shared_fixture():
    cases = json.loads((ROOT / 'shared' / 'test-fixtures' / 'label_cases.json').read_text(encoding='utf-8'))
    for raw, expected in cases:
        assert fi.normalize_label(raw) == expected, raw
