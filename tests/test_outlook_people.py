import contextlib
import struct
from types import SimpleNamespace

import pytest

from core.shared import outlook_app
from core.features.integrations.outlook import people


def _prop(tag, value=None):
    kind = tag & 0xFFFF
    head = struct.pack('<II', tag, 0)
    if kind == 0x001F:
        raw = value.encode('utf-16-le') + b'\0\0'
        return head + b'\0' * 8 + struct.pack('<I', len(raw)) + raw
    if kind == 0x0102:
        return head + b'\0' * 8 + struct.pack('<I', len(value)) + value
    if kind == 0x0048:
        return head + b'\0' * 8 + value
    if kind == 0x101F:
        body = b''.join(struct.pack('<I', len(v.encode('utf-16-le'))) + v.encode('utf-16-le') for v in value)
        return head + b'\0' * 8 + struct.pack('<I', len(value)) + body
    if kind == 0x0003:
        return head + struct.pack('<i', value) + b'\0' * 4
    if kind == 0x000B:
        return head + struct.pack('<H', value) + b'\0' * 6
    raise AssertionError(kind)


def _row(*props):
    return struct.pack('<I', len(props)) + b''.join(props)


def _stream(*rows, magic=0xBAADF00D):
    return struct.pack('<IIII', magic, 12, 0, len(rows)) + b''.join(rows)


def _recent(name, email, weight, addrtype=None):
    props = [_prop(0x0FFF0102, b'\x01\x02entry'), _prop(0x3001001F, name), _prop(0x60040003, weight),
             _prop(0x3A40000B, 1), _prop(0x00430048, b'\x11' * 16), _prop(0x8001101F, ['a', 'b'])]
    if addrtype:
        props += [_prop(0x3002001F, addrtype), _prop(0x3003001F, email)]
    else:
        props.append(_prop(0x39FE001F, email))
    return _row(*props)


@pytest.fixture(autouse=True)
def fresh_caches():
    people._cache.update(at=None, people=[])
    people._details_cache.clear()
    yield


def test_reads_outlooks_autocomplete_list():
    stream = _stream(
        _recent('Michael Wolf', 'mwolf@ibm.com', 300),
        _recent('Zain Abedin', 'zain@us.ibm.com', 100, addrtype='SMTP'),
        _row(_prop(0x3001001F, 'No Address'), _prop(0x3002001F, 'EX'), _prop(0x3003001F, '/o=ExchangeLabs/cn=x')),
    )
    assert people.parse_autocomplete(stream) == [
        {'name': 'Michael Wolf', 'email': 'mwolf@ibm.com', 'weight': 300},
        {'name': 'Zain Abedin', 'email': 'zain@us.ibm.com', 'weight': 100},
    ]


def test_unknown_or_cut_streams_keep_what_was_read():
    assert people.parse_autocomplete(_stream(_recent('A B', 'ab@ibm.com', 1), magic=0x12345678)) == []
    whole = _stream(_recent('Ann Lee', 'ann@ibm.com', 5), _recent('Bo Kim', 'bo@ibm.com', 4))
    assert people.parse_autocomplete(whole[:-10]) == [{'name': 'Ann Lee', 'email': 'ann@ibm.com', 'weight': 5}]
    assert people.parse_autocomplete(None) == []


def test_typed_words_start_words_of_the_name_or_address():
    person = {'name': 'Michael Wolf', 'email': 'mjwolf@us.ibm.com'}
    assert people.matches(person, 'mich wo')
    assert people.matches(person, 'WOLF')
    assert people.matches(person, 'mjwolf@')
    assert not people.matches(person, 'chael')


class FakeUser(SimpleNamespace):
    pass


def _entry(name, email, title='', department=''):
    user = FakeUser(Name=name, PrimarySmtpAddress=email, JobTitle=title, Department=department, CompanyName='IBM',
                    BusinessTelephoneNumber='', MobileTelephoneNumber='+1 555')
    return SimpleNamespace(AddressEntryUserType=0, Name=name, GetExchangeUser=lambda: user)


class FakeSession:
    """Outlook's session as suggest() uses it: the autocomplete list, name resolution, the address book."""

    def __init__(self, stream, directory):
        self.stream = stream
        self.directory = sorted(directory, key=lambda entry: entry.Name.lower())
        self.resolves = []

    def GetDefaultFolder(self, number):
        assert number == 6
        accessor = SimpleNamespace(GetProperty=lambda _tag: self.stream)
        return SimpleNamespace(GetStorage=lambda _cls, _kind: SimpleNamespace(PropertyAccessor=accessor))

    def CreateRecipient(self, text):
        self.resolves.append(text)
        hits = [e for e in self.directory if text.lower() in (e.Name.lower(), e.GetExchangeUser().PrimarySmtpAddress.lower())]
        entry = hits[0] if len(hits) == 1 else None
        return SimpleNamespace(Resolve=lambda: entry is not None, AddressEntry=entry)

    def GetGlobalAddressList(self):
        def nearest(text):
            return next((e for e in self.directory if e.Name.lower() >= text.lower()), None)
        return SimpleNamespace(AddressEntries=SimpleNamespace(Item=nearest))


def test_suggestions_put_recent_people_first_with_their_directory_details():
    session = FakeSession(
        _stream(_recent('Michael Wolf', 'mwolf@ibm.com', 300), _recent('Michelle Ward', 'mward@ibm.com', 900)),
        [_entry('Michael Wolf', 'mwolf@ibm.com', 'Partner', 'GBS'), _entry('Michael Wolfe', 'mjw@us.ibm.com', 'Developer')],
    )
    found = people.suggest(session, 'michael wol')
    assert [(p['name'], p['email'], p['source']) for p in found] == [
        ('Michael Wolf', 'mwolf@ibm.com', 'recent'),
    ]
    assert found[0]['title'] == 'Partner' and found[0]['department'] == 'GBS' and found[0]['phone'] == '+1 555'

    found = people.suggest(session, 'Michael Wolfe')
    assert [(p['email'], p['source']) for p in found] == [('mjw@us.ibm.com', 'directory')]


def test_one_row_per_address_and_short_text_asks_nothing():
    session = FakeSession(_stream(_recent('Ann Lee', 'ann@ibm.com', 5)), [_entry('Ann Lee', 'ann@ibm.com')])
    assert [p['source'] for p in people.suggest(session, 'Ann Lee')] == ['recent']
    session.resolves.clear()
    assert people.suggest(session, 'a') == [] and session.resolves == []


def test_the_autocomplete_list_is_read_once_then_cached():
    session = FakeSession(_stream(_recent('Ann Lee', 'ann@ibm.com', 5)), [])
    people.suggest(session, 'ann')
    session.stream = _stream(_recent('Bo Kim', 'bo@ibm.com', 5))
    assert [p['name'] for p in people.suggest(session, 'ann')] == ['Ann Lee']


def test_an_unreadable_list_still_lets_the_directory_answer():
    class Refusing(FakeSession):
        def GetDefaultFolder(self, number):
            raise OSError('MAPI refused')
    session = Refusing(b'', [_entry('Bidyut Sarkar', 'bsarkar@ibm.com')])
    assert [p['email'] for p in people.suggest(session, 'Bidyut')] == ['bsarkar@ibm.com']


def test_distribution_lists_are_not_people():
    assert people.person_from_entry(SimpleNamespace(AddressEntryUserType=1, Name='All of GBS')) is None
    smtp = SimpleNamespace(AddressEntryUserType=30, Name='Vendor Rep', Address='rep@vendor.com')
    assert people.person_from_entry(smtp) == {'name': 'Vendor Rep', 'email': 'rep@vendor.com'}


@pytest.fixture
def here(monkeypatch):
    facts = {'usable': True, 'app': None}
    monkeypatch.setattr(outlook_app, 'usable', lambda: facts['usable'])
    monkeypatch.setattr(outlook_app, 'running_app', lambda: facts['app'])
    monkeypatch.setattr(outlook_app, 'com_thread', contextlib.nullcontext)
    return facts


def test_lookups_follow_the_outlook_choice(tmp_store, here):
    assert tmp_store.get('/api/outlook/people?q=ann').get_json() == {'status': 'not_running', 'people': []}
    here['usable'] = False
    assert tmp_store.get('/api/outlook/people?q=ann').get_json()['status'] == 'web'
    here['usable'] = True
    tmp_store.put('/api/outlook/mode', json={'mode': 'web'})
    assert tmp_store.get('/api/outlook/people?q=ann').get_json()['status'] == 'web'


def test_lookups_ask_the_open_outlook(tmp_store, here, monkeypatch):
    here['app'] = SimpleNamespace(Session='session')
    monkeypatch.setattr(people, 'suggest', lambda session, q: [{'name': q, 'email': 'x@ibm.com', 'source': session}])
    assert tmp_store.get('/api/outlook/people?q=Ann').get_json() == {
        'status': 'ok', 'people': [{'name': 'Ann', 'email': 'x@ibm.com', 'source': 'session'}]}

    def broken(_session, _q):
        raise OSError('COM failure')
    monkeypatch.setattr(people, 'suggest', broken)
    assert tmp_store.get('/api/outlook/people?q=Ann').get_json() == {'status': 'failed', 'people': []}


def test_picking_opens_outlooks_address_book(tmp_store, here, monkeypatch):
    assert tmp_store.post('/api/outlook/people/pick', data='x').status_code == 415
    monkeypatch.setattr(outlook_app, 'open_app', lambda: SimpleNamespace(Session='session'))
    monkeypatch.setattr(people, 'pick', lambda session: {'name': 'Ann Lee', 'email': 'ann@ibm.com'})
    assert tmp_store.post('/api/outlook/people/pick', json={}).get_json() == {
        'person': {'name': 'Ann Lee', 'email': 'ann@ibm.com'}}
    monkeypatch.setattr(people, 'pick', lambda session: None)
    assert tmp_store.post('/api/outlook/people/pick', json={}).get_json() == {'person': None}
    here['usable'] = False
    assert tmp_store.post('/api/outlook/people/pick', json={}).status_code == 409
