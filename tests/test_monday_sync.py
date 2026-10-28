import pytest

from core.shared import state
from core.features.integrations.monday import client, mapping
from core.features.integrations.monday.writer import write_monday_fields


@pytest.fixture
def board_api(board, monkeypatch):
    monkeypatch.setattr(client, 'fetch_board', lambda: board)
    return board


def _seed(**fields):
    data = state.load_data()
    deal = {'id': str(len(data['deals']) + 1), 'opportunity_number': '', 'client_name': '',
            'project_name': '', 'status': 'Active', **fields}
    data['deals'].append(deal)
    state.save_data(data)
    return deal['id']


def _deals():
    return state.load_data()['deals']


def _by_item(item_id):
    return next(d for d in _deals() if d.get('monday_item_id') == item_id)


def _sync(test_client, **body):
    response = test_client.post('/api/monday/sync', json=body)
    assert response.status_code == 200, response.get_json()
    return response.get_json()


@pytest.mark.parametrize('cell,stored', [('0.025', '25000'), ('400', '400000000'), ('2.675', '2675000'), ('12.5', '12500000')])
def test_tcv_is_converted_exactly(cell, stored):
    item = {'id': 1, 'name': 'n', 'group': {'title': 'SAP'},
            'column_values': [{'id': 'numeric_mkqyh0mz', 'type': 'numbers', 'text': cell}]}
    assert mapping.item_values(item)['estimated_value'] == stored


def test_board_dates_are_read():
    item = {'id': 1, 'name': 'n', 'created_at': '2026-03-04T15:20:00Z', 'group': {'title': 'SAP'},
            'column_values': [{'id': 'color_mkqypejx', 'type': 'status', 'text': 'Won', 'updated_at': '2026-09-30T23:10:00Z'}]}
    values = mapping.item_values(item)
    assert (values['monday_created_at'], values['status_changed_at'], values['status']) == ('2026-03-04', '2026-09-30', 'Won')


def test_item_values_reads_every_bound_column(board):
    values = mapping.item_values(board['items'][0])
    assert values['opportunity_number'] == '006Ab00000XyZ12QAB'
    assert values['client_name'] == 'Contoso' and values['status'] == 'Active'
    assert values['estimated_value'] == '12500000'
    assert (values['project_start_date'], values['project_end_date']) == ('2026-01-05', '2026-06-30')
    assert values['sales_stage'] == 'Qualify' and values['monday_group'] == 'SAP' and values['monday_item_id'] == '1001'


def test_empty_cells_become_empty_strings(board):
    values = mapping.item_values(board['items'][1])
    assert values['status'] == '' and values['estimated_value'] == '' and values['project_start_date'] == ''
    assert values['lead_sl'] == ''


def test_dry_run_reports_and_writes_nothing(tmp_store, board_api):
    before = tmp_store.data_file.read_bytes()
    summary = _sync(tmp_store, dry_run=True)
    assert summary['created'] == 6 and summary['dry_run'] is True
    assert tmp_store.data_file.read_bytes() == before


def test_sync_creates_full_deals_for_every_group(tmp_store, board_api):
    assert _sync(tmp_store)['created'] == 6
    deals = {d['monday_item_id']: d for d in _deals()}
    assert set(deals) == {'1001', '1002', '1003', '1004', '1005', '1006'}
    assert all(d['activities'] for d in deals.values())
    assert deals['1003']['monday_group'] == 'Oracle' and deals['1001']['client_name'] == 'Contoso'


def test_second_sync_changes_nothing(tmp_store, board_api):
    _sync(tmp_store)
    summary = _sync(tmp_store)
    assert (summary['created'], summary['updated'], summary['unchanged']) == (0, 0, 6)


def test_unlinked_deal_links_when_opportunity_is_unique(tmp_store, board_api):
    deal_id = _seed(opportunity_number='006Ab00000XyZ12QAB', client_name='Old Name', project_name='S4')
    summary = _sync(tmp_store)
    assert summary['linked'] == 1 and summary['created'] == 5
    deal = state.get_deal_by_id(state.load_data(), deal_id)
    assert deal['monday_item_id'] == '1001' and deal['client_name'] == 'Contoso'


def test_link_reports_replaced_values(tmp_store, board_api):
    deal_id = _seed(opportunity_number='006Ab00000XyZ12QAB', client_name='Contoso', status='On Hold',
                    estimated_value='5000000')
    replaced = {(r['deal_id'], r['key']): r['old'] for r in _sync(tmp_store)['replaced']}
    assert replaced == {(deal_id, 'status'): 'On Hold', (deal_id, 'estimated_value'): '5000000'}


def test_duplicate_opportunity_never_links(tmp_store, board_api):
    deal_id = _seed(opportunity_number='006Ab0000DupE01QAA', client_name='Northwind', project_name='Dup')
    summary = _sync(tmp_store)
    assert summary['linked'] == 0 and summary['created'] == 6
    assert not state.get_deal_by_id(state.load_data(), deal_id).get('monday_item_id')
    assert summary['duplicates'] == [{'opportunity_number': '006Ab0000DupE01QAA', 'item_ids': ['1003', '1004']}]


def test_plain_text_names_are_flagged_and_kept(tmp_store, board_api):
    summary = _sync(tmp_store)
    assert summary['plain_text_names'] == [{'item_id': '1002', 'name': 'Fabrikam renewal (TBD)'}]
    assert _by_item('1002')['opportunity_number'] == 'Fabrikam renewal (TBD)'


def test_renamed_item_updates_linked_deal(tmp_store, board_api):
    _sync(tmp_store)
    data = state.load_data()
    next(d for d in data['deals'] if d['monday_item_id'] == '1001')['opportunity_number'] = 'OLD'
    state.save_data(data)
    summary = _sync(tmp_store)
    assert summary['updated'] == 1 and summary['created'] == 0
    assert _by_item('1001')['opportunity_number'] == '006Ab00000XyZ12QAB'
    assert len(_deals()) == 6


def test_gone_row_is_flagged_and_kept(tmp_store, board_api):
    deal_id = _seed(opportunity_number='006Ab0000Gone01QAA', client_name='Gone Co', project_name='Old',
                    monday_item_id='999', monday_group='SAP')
    assert _sync(tmp_store)['gone'] == 1
    deal = state.get_deal_by_id(state.load_data(), deal_id)
    assert deal['monday_missing_since'] and deal['client_name'] == 'Gone Co'
    assert tmp_store.put(f'/api/deals/{deal_id}', json={'status': 'Active'}).status_code == 409
    assert _sync(tmp_store)['gone'] == 0


def test_reappearing_row_clears_missing_flag(tmp_store, board_api):
    _sync(tmp_store)
    data = state.load_data()
    next(d for d in data['deals'] if d['monday_item_id'] == '1005')['monday_missing_since'] = '2026-10-01T00:00:00+00:00'
    state.save_data(data)
    assert _sync(tmp_store)['updated'] == 1
    assert 'monday_missing_since' not in _by_item('1005')


def test_group_move_updates_group(tmp_store, board_api, board):
    _sync(tmp_store)
    board['items'][0]['group'] = {'id': 'group_mksnwvrd', 'title': 'Oracle'}
    _sync(tmp_store)
    assert _by_item('1001')['monday_group'] == 'Oracle'


def test_unknown_columns_reported(tmp_store, board_api, board):
    board['columns'].append({'id': 'text_new1', 'title': 'Notes', 'type': 'text'})
    unknown = _sync(tmp_store, dry_run=True)['unknown_columns']
    assert unknown == [{'id': 'text_new1', 'title': 'Notes', 'type': 'text'}]


def test_writer_refuses_non_monday_keys():
    with pytest.raises(ValueError):
        write_monday_fields({}, {'market': 'Canada'}, synced_at='2026-10-27T00:00:00+00:00')


def test_status_reports_last_sync(tmp_store, vault, board_api):
    _sync(tmp_store)
    assert tmp_store.get('/api/monday/status').get_json()['last_sync']


def test_not_connected_is_401_plain_message(tmp_store, monkeypatch):
    def fail():
        raise client.MondayError('not_connected', client.SIGN_IN_AGAIN)
    monkeypatch.setattr(client, 'fetch_board', fail)
    response = tmp_store.post('/api/monday/sync', json={})
    assert response.status_code == 401 and response.get_json()['error'] == client.SIGN_IN_AGAIN
