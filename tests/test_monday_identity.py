"""Who the signed-in person is on the board: a name they pick once, bound to their monday email."""
import base64
import json
from urllib.parse import parse_qs, urlparse

import pytest

from core.shared import state
from core.features.integrations.monday import config, credentials, identity

LEAD, TT, SC2, SC3, SC4 = 'color_mkqyvgvy', 'color_mkqy18z3', 'color_mksmhqb', 'color_mksmnwx4', 'color_mksmc3ry'
EMAIL = 'ab1@ibm.com'


def _token():
    def part(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b'=').decode()
    return f"{part({'alg': 'none'})}.{part({'per': 'me:read,boards:read,boards:write'})}.sig"


def signed_in(email=EMAIL):
    credentials.save_app('cid', 'sec')
    user = {'id': '7', 'name': 'AB1@ibm.com', **({'email': email} if email else {})}
    credentials.save_token({'access_token': _token(), 'refresh_token': 'r1', 'expires_at': None, 'user': user})


def name_columns(lead=('Abi Bolatiwa', 'Ann Lee', 'TBD'), tt=('Per Winge', 'TBD'), sc2=('Bo Chu',), sc3=(), sc4=()):
    def column(column_id, names):
        return {'id': column_id, 'type': 'status', 'settings': {'labels': [
            {'id': i, 'label': name, 'is_deactivated': False} for i, name in enumerate(names)]}}
    return {'data': {'boards': [{'columns': [
        column(LEAD, lead), column(TT, tt), column(SC2, sc2), column(SC3, sc3), column(SC4, sc4)]}]}}


def set_preferences(**prefs):
    data = state.load_data()
    data['preferences'] = prefs
    state.save_data(data)


LABELS = {'lead_ssc': ['Abi Bolatiwa', 'Ann Lee', 'TBD'], 'tt_executive': ['Per Winge', 'TBD'],
          'solution_consultant_2': ['Bo Chu', 'Ann Lee'], 'solution_consultant_3': [], 'solution_consultant_4': []}


def test_the_name_columns_are_lead_tt_exec_and_the_scs():
    assert identity.name_columns() == {
        'lead_ssc': LEAD, 'tt_executive': TT, 'solution_consultant_2': SC2,
        'solution_consultant_3': SC3, 'solution_consultant_4': SC4,
    }


def test_names_are_every_board_name_but_tbd_once_and_sorted():
    assert identity.who({}, EMAIL, LABELS)['names'] == ['Abi Bolatiwa', 'Ann Lee', 'Bo Chu', 'Per Winge']


@pytest.mark.parametrize('lead, sc2', [(['CINDY NGUYEN'], ['Cindy Nguyen']), (['Cindy Nguyen'], ['CINDY NGUYEN'])])
def test_spellings_that_differ_only_in_case_are_one_name(lead, sc2):
    labels = {**LABELS, 'lead_ssc': lead, 'solution_consultant_2': sc2}
    assert [n for n in identity.who({}, EMAIL, labels)['names'] if n.casefold() == 'cindy nguyen'] == ['Cindy Nguyen']


def test_an_exec_is_a_name_in_the_tt_exec_column():
    exec_prefs = {'solutioner': 'per winge', 'solutioner_email': EMAIL}
    lead_prefs = {'solutioner': 'Abi Bolatiwa', 'solutioner_email': EMAIL}
    assert identity.who(exec_prefs, EMAIL, LABELS)['is_exec'] is True
    assert identity.who(lead_prefs, EMAIL, LABELS) == {
        'email': EMAIL, 'name': 'Abi Bolatiwa', 'is_exec': False,
        'names': ['Abi Bolatiwa', 'Ann Lee', 'Bo Chu', 'Per Winge'],
    }


def test_name_counts_only_for_the_email_that_picked_it():
    prefs = {'solutioner': 'Per Winge', 'solutioner_email': 'per.winge@us.ibm.com'}
    me = identity.who(prefs, EMAIL, LABELS)
    assert me['name'] == '' and me['is_exec'] is False
    assert identity.who({'solutioner': 'Per Winge'}, EMAIL, LABELS)['name'] == ''


def test_remember_binds_the_name_to_the_email_and_keeps_the_rest():
    assert identity.remember({'scope': 'everyone', 'solutioner': 'Old'}, EMAIL, 'Abi Bolatiwa') == {
        'scope': 'everyone', 'solutioner': 'Abi Bolatiwa', 'solutioner_email': EMAIL,
    }


def test_me_answers_with_name_exec_and_choices(tmp_store, vault, fake_monday):
    signed_in()
    set_preferences(solutioner='Per Winge', solutioner_email=EMAIL, scope='mine')
    fake_monday.queue(config.API_URL, 200, name_columns())
    response = tmp_store.get('/api/monday/me')
    assert response.status_code == 200
    assert response.get_json() == {'email': EMAIL, 'name': 'Per Winge', 'is_exec': True,
                                   'names': ['Abi Bolatiwa', 'Ann Lee', 'Bo Chu', 'Per Winge']}


def test_me_needs_a_sign_in(tmp_store, vault, fake_monday):
    credentials.save_app('cid', 'sec')
    assert tmp_store.get('/api/monday/me').status_code == 401
    assert tmp_store.put('/api/monday/me', json={'name': 'Ann Lee'}).status_code == 401
    assert fake_monday.calls == []


def test_picking_a_name_remembers_it_for_this_email(tmp_store, vault, fake_monday):
    signed_in()
    set_preferences(scope='everyone')
    fake_monday.queue(config.API_URL, 200, name_columns())
    response = tmp_store.put('/api/monday/me', json={'name': 'Abi Bolatiwa'})
    assert response.status_code == 200
    assert response.get_json()['name'] == 'Abi Bolatiwa' and response.get_json()['is_exec'] is False
    assert state.load_data()['preferences'] == {
        'scope': 'everyone', 'solutioner': 'Abi Bolatiwa', 'solutioner_email': EMAIL,
    }


@pytest.mark.parametrize('name', ['Someone Else', 'TBD', '  '])
def test_picking_a_name_not_on_the_board_is_refused(tmp_store, vault, fake_monday, name):
    signed_in()
    fake_monday.queue(config.API_URL, 200, name_columns())
    assert tmp_store.put('/api/monday/me', json={'name': name}).status_code == 400
    assert 'solutioner_email' not in (state.load_data().get('preferences') or {})


def test_missing_email_is_fetched_and_kept(tmp_store, vault, fake_monday):
    signed_in(email=None)
    fake_monday.queue(config.API_URL, 200, {'data': {'me': {'id': 7, 'name': 'AB1@ibm.com', 'email': EMAIL}}})
    fake_monday.queue(config.API_URL, 200, name_columns())
    assert tmp_store.get('/api/monday/me').get_json()['email'] == EMAIL
    saved = credentials.load_token()
    assert saved['user'] == {'id': '7', 'name': 'AB1@ibm.com', 'email': EMAIL} and saved['refresh_token'] == 'r1'


def test_sign_in_saves_the_email(tmp_store, vault, fake_monday):
    credentials.save_app('cid', 'sec')
    location = tmp_store.get('/api/monday/connect').headers['Location']
    query = parse_qs(urlparse(location).query)
    fake_monday.queue(config.TOKEN_URL, 200, {'access_token': 'tok', 'refresh_token': 'ref'})
    fake_monday.queue(config.API_URL, 200, {'data': {'me': {'id': 7, 'name': 'AB1@ibm.com', 'email': EMAIL}}})
    tmp_store.get(f"/api/monday/oauth/callback?state={query['state'][0]}&code=x")
    assert 'email' in fake_monday.calls[1][1]['query']
    assert credentials.load_token()['user']['email'] == EMAIL


def test_settings_keep_the_email_binding(tmp_store):
    set_preferences(solutioner='Abi Bolatiwa', solutioner_email=EMAIL, scope='mine')
    tmp_store.put('/api/preferences', json={'scope': 'everyone'})
    assert state.load_data()['preferences']['solutioner_email'] == EMAIL
    assert tmp_store.get('/api/preferences').get_json() == {'solutioner': 'Abi Bolatiwa', 'scope': 'everyone'}
