import json

import core.shared.state as state
from core.features.deals.services import get_activities_with_defaults
from core.shared import directory


def _seed(client, monkeypatch, **data):
    store = {'deals': [], 'master_contacts': [], 'default_approvers': {}, '_contacts_migrated': True, **data}
    client.data_file.write_text(json.dumps(store), encoding='utf-8')
    monkeypatch.setattr(state, '_migrated', False)


def _legacy(id_, name, role, area='', email=''):
    entry = {'id': id_, 'name': name, 'email': email, 'role': role, 'area': area,
             'company': '', 'phone': '', 'slack': '', 'notes': ''}
    if role in ('SAL', 'PAL'):
        entry['approver_key'] = f"{area.replace('/', '_').replace(' ', '_')}_{role}"
    return entry


def test_old_directory_entries_become_one_person_each_with_roles():
    data = {'master_contacts': [
        _legacy('1', 'Michael Wolf', 'SAL', 'RTR'),
        _legacy('2', 'Satish M Hiranandani / Steve Herda', 'SAL', 'Data'),
        _legacy('3', 'Satish M Hiranandani', 'SAL', 'Analytics'),
        _legacy('4', 'Dilip Radhakrishnan', 'SAL', 'Group Reporting'),
        _legacy('5', 'Dilip Radhakrishnan', 'SAL', 'SAC'),
        _legacy('6', 'Pat Smith', 'PAL', 'OTC', email='pat@ibm.com'),
        _legacy('7', 'Dee Dawson', 'Deal Manager'),
        _legacy('8', '', 'SAL', 'IBP'),
    ]}

    assert directory.migrate_directory(data) is True
    people = {p['name']: p for p in data['master_contacts']}

    assert list(people) == ['Michael Wolf', 'Satish M Hiranandani', 'Steve Herda', 'Dilip Radhakrishnan', 'Pat Smith', 'Dee Dawson']
    assert people['Satish M Hiranandani']['roles'] == [{'kind': 'sal', 'area': 'Data'}, {'kind': 'sal', 'area': 'Analytics'}]
    assert people['Steve Herda']['roles'] == [{'kind': 'sal', 'area': 'Data'}]
    assert people['Dilip Radhakrishnan']['roles'] == [{'kind': 'sal', 'area': 'Group Reporting'}, {'kind': 'sal', 'area': 'SAC'}]
    assert people['Pat Smith']['roles'] == [{'kind': 'deal_team', 'title': directory.PAL_TITLE, 'area': 'OTC'}]
    assert people['Dee Dawson']['roles'] == [{'kind': 'deal_team', 'title': 'Deal Manager'}]
    assert people['Michael Wolf']['id'] == '1' and people['Satish M Hiranandani']['id'] == '2'
    assert len({p['id'] for p in people.values()}) == len(people)
    assert not any(key in p for p in people.values() for key in ('role', 'area', 'approver_key'))
    assert directory.migrate_directory(data) is False


def test_the_store_migrates_its_directory_on_load(tmp_store, monkeypatch):
    _seed(tmp_store, monkeypatch, master_contacts=[_legacy('1', 'Michael Wolf', 'SAL', 'rtr')])

    people = tmp_store.get('/api/contacts').get_json()

    assert people == [{'id': '1', 'name': 'Michael Wolf', 'email': '', 'title': '', 'department': '', 'company': '',
                       'phone': '', 'slack': '', 'notes': '', 'roles': [{'kind': 'sal', 'area': 'RTR'}]}]


def test_old_area_keys_are_spelled_as_the_deals_spell_them():
    data = {'master_contacts': [
        _legacy('1', 'Dan C Berard', 'SAL', 'PTP_Ariba'),
        _legacy('2', 'Glenn E Ranchero', 'SAL', 'FTPL'),
    ]}
    directory.migrate_directory(data)
    assert [p['roles'] for p in data['master_contacts']] == [[{'kind': 'sal', 'area': 'PTP/Ariba'}], [{'kind': 'sal', 'area': 'FTP&L'}]]

    already = {'master_contacts': [{'id': '9', 'name': 'Dilip Radhakrishnan', 'roles': [
        {'kind': 'sal', 'area': 'Group_Reporting'}, {'kind': 'sal', 'area': 'Group Reporting'}, {'kind': 'sal', 'area': 'SAC'}]}]}
    assert directory.migrate_directory(already) is True
    assert already['master_contacts'][0]['roles'] == [{'kind': 'sal', 'area': 'Group Reporting'}, {'kind': 'sal', 'area': 'SAC'}]
    assert directory.migrate_directory(already) is False


def test_adding_someone_already_there_adds_the_role_not_a_second_entry(tmp_store):
    first = tmp_store.post('/api/contacts', json={
        'name': 'Ana Silva', 'email': 'ana@ibm.com', 'roles': [{'kind': 'deal_team', 'title': 'Lead client partner'}]}).get_json()
    again = tmp_store.post('/api/contacts', json={
        'name': 'Ana  Silva', 'email': 'ANA@ibm.com', 'title': 'Partner',
        'roles': [{'kind': 'srr', 'sector': 'Distribution'}, {'kind': 'deal_team', 'title': 'lead client partner'}]}).get_json()

    assert again['id'] == first['id'] and again['title'] == 'Partner'
    assert again['roles'] == [{'kind': 'deal_team', 'title': 'Lead client partner'}, {'kind': 'srr', 'sector': 'Distribution'}]
    assert len(tmp_store.get('/api/contacts').get_json()) == 1


def test_a_name_without_an_email_matches_the_same_name(tmp_store):
    tmp_store.post('/api/contacts', json={'name': 'Bo Chen', 'roles': [{'kind': 'sldl', 'area': 'SAP'}]})
    person = tmp_store.post('/api/contacts', json={
        'name': 'bo chen', 'email': 'bo@ibm.com', 'roles': [{'kind': 'sal', 'area': 'OTC'}]}).get_json()

    assert person['email'] == 'bo@ibm.com' and len(person['roles']) == 2
    assert len(tmp_store.get('/api/contacts').get_json()) == 1


def test_people_and_roles_are_checked(tmp_store):
    bad = [
        {'name': '', 'roles': []},
        {'name': 'A', 'email': 'not-an-email', 'roles': []},
        {'name': 'A', 'roles': [{'kind': 'pal'}]},
        {'name': 'A', 'roles': [{'kind': 'sal'}]},
        {'name': 'A', 'roles': [{'kind': 'prr'}]},
        {'name': 'A', 'roles': 'sal'},
    ]
    for body in bad:
        assert tmp_store.post('/api/contacts', json=body).status_code == 400, body


def test_changing_and_removing_a_person(tmp_store):
    person = tmp_store.post('/api/contacts', json={'name': 'Cy Ode', 'roles': [{'kind': 'sal', 'area': 'IBP'}]}).get_json()

    changed = tmp_store.put(f"/api/contacts/{person['id']}", json={'roles': [{'kind': 'prr', 'sector': 'FSS'}]}).get_json()
    assert changed['roles'] == [{'kind': 'prr', 'sector': 'FSS'}] and changed['name'] == 'Cy Ode'

    assert tmp_store.delete(f"/api/contacts/{person['id']}").status_code == 200
    assert tmp_store.delete(f"/api/contacts/{person['id']}").status_code == 404
    assert tmp_store.put('/api/contacts/99', json={'name': 'X'}).status_code == 404


def test_sectors_come_from_the_deals_and_what_is_recorded(tmp_store, monkeypatch):
    _seed(tmp_store, monkeypatch, deals=[
        {'id': '1', 'sector': 'Distribution, Canada'}, {'id': '2', 'sector': 'Com-Ind'}, {'id': '3', 'sector': ''},
    ])
    tmp_store.post('/api/contacts', json={'name': 'Di Ruiz', 'roles': [{'kind': 'srr', 'sector': 'Public'}]})

    quick = tmp_store.get('/api/quick-contacts').get_json()

    assert quick['sectors'] == ['Canada', 'Com-Ind', 'Distribution', 'Public']
    assert quick['sal_areas'][:3] == ['RTR', 'OTC', 'PTP/Ariba'] and len(quick['sal_areas']) == 12
    assert quick['review_forms'] == {'srr': {}, 'prr': {}}


def test_review_forms_keep_web_links_only(tmp_store):
    saved = tmp_store.put('/api/review-forms', json={
        'kind': 'srr', 'sector': 'Distribution', 'how': 'form', 'url': 'https://forms.example.ibm.com/srr'}).get_json()
    assert saved['srr']['Distribution'] == {'how': 'form', 'url': 'https://forms.example.ibm.com/srr', 'note': ''}

    for url in ('javascript:alert(1)', 'file:///C:/x', 'ftp://x/y', 'https://', 'https://a b'):
        body = {'kind': 'srr', 'sector': 'Distribution', 'how': 'form', 'url': url}
        assert tmp_store.put('/api/review-forms', json=body).status_code == 400, url
    assert tmp_store.put('/api/review-forms', json={'kind': 'pal', 'sector': 'X'}).status_code == 400
    assert tmp_store.put('/api/review-forms', json={'kind': 'prr', 'sector': ''}).status_code == 400
    assert tmp_store.put('/api/review-forms', json={'kind': 'prr', 'sector': 'X', 'how': 'fax'}).status_code == 400

    cleared = tmp_store.put('/api/review-forms', json={'kind': 'srr', 'sector': 'distribution', 'how': '', 'url': ''}).get_json()
    assert cleared == {'srr': {}, 'prr': {}}


def test_new_deals_get_no_pal_rows_and_their_sals_from_the_directory():
    people = [
        {'id': '1', 'name': 'Michael Wolf', 'email': 'mw@ibm.com', 'roles': [{'kind': 'sal', 'area': 'RTR'}]},
        {'id': '2', 'name': 'Satish M Hiranandani', 'roles': [{'kind': 'sal', 'area': 'Data'}, {'kind': 'sal', 'area': 'Analytics'}]},
        {'id': '3', 'name': 'Steve Herda', 'roles': [{'kind': 'sal', 'area': 'Data'}]},
        {'id': '4', 'name': 'Ana Silva', 'roles': [{'kind': 'deal_team', 'title': 'Lead client partner'}]},
    ]

    activities, contacts = get_activities_with_defaults({'master_contacts': people})
    by_name = {a['activity']: a for a in activities}

    assert not [a for a in activities if a.get('owner_type') == 'PAL']
    assert len([a for a in activities if a.get('owner_type') == 'SAL']) == 12
    assert by_name['RTR - Service Area Lead (SAL) Approval']['reviewer_approver'] == 'Michael Wolf'
    assert by_name['RTR - Service Area Lead (SAL) Approval']['contact_id'] == '1'
    assert by_name['Data - Service Area Lead (SAL) Approval']['reviewer_approver'] == 'Satish M Hiranandani / Steve Herda'
    assert by_name['OTC - Service Area Lead (SAL) Approval']['reviewer_approver'] == ''
    assert [(c['name'], c['role'], c['source_id']) for c in contacts] == [
        ('Michael Wolf', 'RTR SAL', '1'), ('Satish M Hiranandani', 'Data, Analytics SAL', '2'), ('Steve Herda', 'Data SAL', '3'),
    ]
