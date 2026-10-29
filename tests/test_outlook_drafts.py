import contextlib
import os
from datetime import datetime

import pytest

from core.shared import outlook_app, state

SIGNATURE = '<html><body lang=EN-US><p>-- Ann Lee</p></body></html>'


class FakeAttachments:
    def __init__(self, item):
        self.item = item

    def Add(self, path):
        # Outlook copies the file into the item the moment it's added.
        with open(path, 'rb') as handle:
            self.item.attached.append((path, os.path.basename(path), handle.read()))


class FakeInspector:
    def __init__(self):
        self.activated = False

    def Activate(self):
        self.activated = True


class FakeItem:
    def __init__(self, kind, refuse_body=False):
        self.kind = kind
        self.refuse_body = refuse_body
        self.attached = []
        self.displayed = False
        self.Attachments = FakeAttachments(self)
        self.GetInspector = FakeInspector()
        self.Body = ''
        self._html = None

    def Display(self, modal=False):
        self.displayed = True
        if self._html is None:
            self._html = SIGNATURE  # Outlook adds the signature when the window opens

    @property
    def HTMLBody(self):
        if self.refuse_body:
            raise OSError('A program is trying to access e-mail address information')
        return self._html or ''

    @HTMLBody.setter
    def HTMLBody(self, value):
        self._html = value

    def Send(self):
        raise AssertionError('s0L must never send')


class FakeOutlook:
    def __init__(self, **options):
        self.items = []
        self.options = options

    def CreateItem(self, kind):
        item = FakeItem(kind, **self.options)
        self.items.append(item)
        return item


@pytest.fixture
def outlook(monkeypatch):
    app = FakeOutlook()
    monkeypatch.setattr(outlook_app, 'usable', lambda: True)
    monkeypatch.setattr(outlook_app, 'open_app', lambda: app)
    monkeypatch.setattr(outlook_app, 'com_thread', contextlib.nullcontext)
    return app


@pytest.fixture
def documents(tmp_path, monkeypatch):
    root = tmp_path / 'documents'
    root.mkdir()
    monkeypatch.setattr(state, 'DOCUMENTS_ROOT', str(root))
    return root


def _seed(**fields):
    data = state.load_data()
    deal = {'id': str(len(data['deals']) + 1), 'client_name': 'Acme', 'project_name': 'S4', **fields}
    data['deals'].append(deal)
    state.save_data(data)
    return deal['id']


def _document(root, doc_id, name, content=b'deck'):
    path = root / f'{doc_id[:12]}_{name.replace(" ", "_")}'
    path.write_bytes(content)
    return {'id': doc_id, 'name': name, 'stored_path': str(path)}


def _draft(test_client, **body):
    return test_client.post('/api/outlook/draft', json=body)


# ── emails ──

def test_email_opens_a_filled_in_draft(tmp_store, outlook):
    response = _draft(tmp_store, to=['ann@ibm.com', 'bob@ibm.com', 'Ann@ibm.com'], cc=['cy@ibm.com'],
                      subject='Acme – S4: approvals needed', body='Hi all,\n\nLine <2> & more')
    assert response.status_code == 200 and response.get_json() == {'opened': True}
    [item] = outlook.items
    assert item.kind == 0 and item.displayed and item.GetInspector.activated
    assert item.To == 'ann@ibm.com; bob@ibm.com' and item.CC == 'cy@ibm.com'
    assert item.Subject == 'Acme – S4: approvals needed'
    html = item.HTMLBody
    assert 'Line &lt;2&gt; &amp; more' in html and 'Hi all,<br>' in html
    assert html.index('Hi all') < html.index('-- Ann Lee') and html.startswith('<html><body lang=EN-US>')


def test_signature_read_refused_falls_back_to_plain_text(tmp_store, monkeypatch):
    app = FakeOutlook(refuse_body=True)
    monkeypatch.setattr(outlook_app, 'usable', lambda: True)
    monkeypatch.setattr(outlook_app, 'open_app', lambda: app)
    monkeypatch.setattr(outlook_app, 'com_thread', contextlib.nullcontext)
    assert _draft(tmp_store, to=['ann@ibm.com'], subject='s', body='Plain\ntext').status_code == 200
    assert app.items[0].Body == 'Plain\ntext' and app.items[0].displayed


def test_attachments_go_under_the_document_names(tmp_store, outlook, documents):
    doc = _document(documents, 'a1b2c3d4e5f6a7b8', 'Acme iSBD.pptx', b'pptx bytes')
    deal_id = _seed(documents=[doc])
    assert _draft(tmp_store, deal_id=deal_id, subject='Acme: iSBD', attachments=[doc['id']]).status_code == 200
    [(copied_path, name, content)] = outlook.items[0].attached
    assert name == 'Acme iSBD.pptx' and content == b'pptx bytes'
    assert not os.path.exists(copied_path) and os.path.exists(doc['stored_path'])


def test_attachments_must_be_this_deals_files(tmp_store, outlook, documents, tmp_path):
    mine = _document(documents, 'aaaaaaaaaaaaaaaa', 'Mine.pptx')
    theirs = _document(documents, 'bbbbbbbbbbbbbbbb', 'Theirs.pptx')
    outside = tmp_path / 'secret.txt'
    outside.write_text('not a deal document')
    stray = {'id': 'cccccccccccccccc', 'name': 'Stray.txt', 'stored_path': str(outside)}
    gone = {'id': 'dddddddddddddddd', 'name': 'Gone.pptx', 'stored_path': str(documents / 'gone.pptx')}
    deal_id = _seed(documents=[mine, stray, gone])
    _seed(documents=[theirs])
    for doc_id, expected in [('nope', 'nope'), (theirs['id'], theirs['id']), (stray['id'], 'Stray.txt'),
                             (gone['id'], 'Gone.pptx')]:
        response = _draft(tmp_store, deal_id=deal_id, subject='s', attachments=[doc_id])
        assert response.status_code == 400 and expected in response.get_json()['error']
    assert _draft(tmp_store, subject='s', attachments=[mine['id']]).status_code == 400
    assert outlook.items == []


def test_draft_checks_its_input(tmp_store, outlook):
    assert _draft(tmp_store, to=['not an address']).status_code == 400
    assert _draft(tmp_store, to=[f'p{n}@ibm.com' for n in range(101)]).status_code == 400
    assert _draft(tmp_store, subject='x' * 501).status_code == 400
    assert _draft(tmp_store, body='x' * 100_001).status_code == 400
    assert _draft(tmp_store, deal_id='1', attachments=[str(n) for n in range(21)]).status_code == 400
    assert tmp_store.post('/api/outlook/draft', data='to=x').status_code == 415
    assert outlook.items == []


def test_without_the_app_drafts_say_so(tmp_store, monkeypatch):
    monkeypatch.setattr(outlook_app, 'usable', lambda: False)
    monkeypatch.setattr(outlook_app, 'com_thread', lambda: pytest.fail('no COM without a usable Outlook app'))
    response = _draft(tmp_store, to=['ann@ibm.com'])
    assert response.status_code == 409 and response.get_json()['kind'] == 'no_app'


def test_outlook_vanishing_mid_way_is_no_app(tmp_store, monkeypatch):
    def unavailable():
        raise outlook_app.OutlookUnavailable()
    monkeypatch.setattr(outlook_app, 'usable', lambda: True)
    monkeypatch.setattr(outlook_app, 'open_app', unavailable)
    monkeypatch.setattr(outlook_app, 'com_thread', contextlib.nullcontext)
    response = _draft(tmp_store, to=['ann@ibm.com'])
    assert response.status_code == 409 and response.get_json()['kind'] == 'no_app'


def test_com_shuts_down_only_after_outlooks_failure_is_handled(tmp_store, outlook, monkeypatch):
    exits = []

    @contextlib.contextmanager
    def recording_com_thread():
        try:
            yield
        except BaseException as error:
            exits.append(type(error).__name__)
            raise
        exits.append(None)

    def broken(kind):
        raise OSError('busy')
    monkeypatch.setattr(outlook_app, 'com_thread', recording_com_thread)
    monkeypatch.setattr(outlook, 'CreateItem', broken)
    assert _draft(tmp_store, to=['ann@ibm.com']).status_code == 502
    assert exits == [None]


def test_an_outlook_failure_is_one_line(tmp_store, outlook, monkeypatch):
    def broken(kind):
        raise OSError('Outlook\n  could not\ncreate the item')
    monkeypatch.setattr(outlook, 'CreateItem', broken)
    response = _draft(tmp_store, to=['ann@ibm.com'])
    body = response.get_json()
    assert response.status_code == 502 and body['kind'] == 'outlook_failed'
    assert 'Outlook could not create the item' in body['error'] and '\n' not in body['error']


# ── meeting invites ──

def _invite(test_client, **body):
    return test_client.post('/api/outlook/invite', json=body)


def test_invite_opens_a_filled_in_meeting(tmp_store, outlook, documents):
    doc = _document(documents, 'eeeeeeeeeeeeeeee', 'Agenda deck.pptx')
    deal_id = _seed(documents=[doc])
    response = _invite(tmp_store, deal_id=deal_id, attendees=['ann@ibm.com', 'bob@ibm.com'], subject='Acme: SRR prep',
                       start='2026-10-29T10:00', end='2026-10-29T10:30', location='Teams', body='Re: Acme\n\nOpen items',
                       attachments=[doc['id']])
    assert response.status_code == 200
    [item] = outlook.items
    assert item.kind == 1 and item.MeetingStatus == 1 and item.displayed
    assert item.RequiredAttendees == 'ann@ibm.com; bob@ibm.com' and item.Subject == 'Acme: SRR prep'
    assert item.Start == datetime(2026, 10, 29, 10, 0) and item.End == datetime(2026, 10, 29, 10, 30)
    assert item.Location == 'Teams' and item.Body == 'Re: Acme\n\nOpen items'
    assert [name for _, name, _ in item.attached] == ['Agenda deck.pptx']


def test_invite_times_are_checked(tmp_store, outlook):
    assert _invite(tmp_store, start='2026-10-29T10:00', end='2026-10-29T10:00').status_code == 400
    assert _invite(tmp_store, start='tomorrow', end='2026-10-29T10:00').status_code == 400
    assert _invite(tmp_store, start='2026-10-29T10:00').status_code == 400
    assert _invite(tmp_store, attendees=['nope'], start='2026-10-29T10:00', end='2026-10-29T11:00').status_code == 400
    assert outlook.items == []
