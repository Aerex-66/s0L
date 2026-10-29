"""Outlook calendar read from Python: the events, fields and filter the calendar tab expects."""
import json
from datetime import datetime
from types import SimpleNamespace

import pytest

from core.features.calendar import outlook_sync
from core.shared import outlook_app, state


class FakeItem:
    def __init__(self, subject, start, end, location=None, all_day=False, categories=None, organizer=None, busy=2):
        self.Subject = subject
        self.Start = start
        self.End = end
        self.Location = location
        self.AllDayEvent = all_day
        self.Categories = categories
        self.Organizer = organizer
        self.BusyStatus = busy


class FakeItems:
    def __init__(self, items):
        self.items = items
        self.IncludeRecurrences = False
        self.calls = []
        self._position = 0

    def Sort(self, key):
        self.calls.append(('sort', key))

    def Restrict(self, text):
        self.calls.append(('restrict', text, self.IncludeRecurrences))
        return self

    def GetFirst(self):
        self._position = 0
        return self.GetNext()

    def GetNext(self):
        if self._position >= len(self.items):
            return None
        self._position += 1
        return self.items[self._position - 1]


class FakeOutlook:
    def __init__(self, items):
        self.items = FakeItems(items)

    def GetNamespace(self, name):
        assert name == 'MAPI'
        return self

    def GetDefaultFolder(self, number):
        assert number == 9
        return SimpleNamespace(Items=self.items)


NOW = datetime(2026, 10, 28, 9, 30)


def test_reads_events_in_script_format():
    outlook = FakeOutlook([FakeItem('SRR prep', datetime(2026, 10, 29, 14, 0), datetime(2026, 10, 29, 15, 0),
                                    location='Teams', categories='Deal', organizer='Ana Ruiz')])
    assert outlook_sync.read_outlook_events(outlook, NOW) == [{
        'subject': 'SRR prep', 'start': '2026-10-29T14:00:00', 'end': '2026-10-29T15:00:00',
        'location': 'Teams', 'isAllDay': False, 'categories': 'Deal', 'organizer': 'Ana Ruiz', 'busyStatus': 2,
    }]


def test_restrict_filter_matches_script():
    outlook = FakeOutlook([])
    outlook_sync.read_outlook_events(outlook, NOW)
    assert outlook.items.calls == [
        ('sort', '[Start]'),
        ('restrict', "[Start] >= '10/21/2026 09:30' AND [Start] <= '12/27/2026 09:30'", True),
    ]


def test_skips_items_without_subject():
    outlook = FakeOutlook([FakeItem(None, NOW, NOW), FakeItem('Kept', NOW, NOW)])
    events = outlook_sync.read_outlook_events(outlook, NOW)
    assert [event['subject'] for event in events] == ['Kept']
    assert events[0]['location'] == '' and events[0]['organizer'] == ''


def test_write_cache_is_atomic_json(tmp_path):
    target = tmp_path / 'cache' / 'outlook_calendar_cache.json'
    events = [{'subject': 'Gate review'}]
    outlook_sync.write_cache(events, str(target))
    assert json.loads(target.read_text(encoding='utf-8')) == events
    assert [p.name for p in target.parent.iterdir()] == ['outlook_calendar_cache.json']


@pytest.fixture
def outlook_here(monkeypatch):
    """This computer's Outlook as the test sets it; starting Outlook fails the test."""
    facts = {'usable': True, 'running': None}
    monkeypatch.setattr(outlook_app, 'usable', lambda: facts['usable'])
    monkeypatch.setattr(outlook_app, 'running_app', lambda: facts['running'])
    monkeypatch.setattr(outlook_app, '_create', lambda: pytest.fail('the calendar reader must never start Outlook'))
    return facts


def _preferences(monkeypatch, preferences):
    monkeypatch.setattr(outlook_sync, '_preferences', lambda: preferences)


def test_sync_skips_in_browser_mode(tmp_path, outlook_here, monkeypatch):
    _preferences(monkeypatch, {'outlook_mode': 'web'})
    outlook_here['running'] = FakeOutlook([FakeItem('SRR prep', NOW, NOW)])
    assert outlook_sync.sync_once(str(tmp_path / 'cache.json')) == 'web'
    assert not (tmp_path / 'cache.json').exists()


def test_sync_never_launches_outlook(tmp_path, outlook_here, monkeypatch):
    _preferences(monkeypatch, {})
    assert outlook_sync.sync_once(str(tmp_path / 'cache.json')) == 'closed'
    assert not (tmp_path / 'cache.json').exists()


def test_sync_writes_the_open_outlooks_calendar(tmp_path, outlook_here, monkeypatch):
    _preferences(monkeypatch, {'outlook_mode': 'app'})
    outlook_here['running'] = FakeOutlook([FakeItem('SRR prep', NOW, NOW)])
    assert outlook_sync.sync_once(str(tmp_path / 'cache.json')) == 'ok'
    assert json.loads((tmp_path / 'cache.json').read_text(encoding='utf-8'))[0]['subject'] == 'SRR prep'


def _calendar(tmp_store, tmp_path, monkeypatch, preferences, usable):
    monkeypatch.setattr(state, 'DATA_ROOT', str(tmp_path))
    monkeypatch.setattr(outlook_app, 'usable', lambda: usable)
    data = state.load_data()
    data['preferences'] = preferences
    state.save_data(data)
    return tmp_store.get('/api/calendar/outlook').get_json()


@pytest.mark.parametrize('preferences,usable,status', [
    ({}, False, 'web'),
    ({'outlook_mode': 'web'}, True, 'web'),
    ({'outlook_mode': 'app'}, False, 'no_app'),
    ({}, True, 'waiting'),
])
def test_calendar_route_follows_the_outlook_choice(tmp_store, tmp_path, monkeypatch, preferences, usable, status):
    body = _calendar(tmp_store, tmp_path, monkeypatch, preferences, usable)
    assert body['status'] == status and body['events'] == [] and body['message']


def test_calendar_reads_cache_written_by_windows_powershell(tmp_store, tmp_path, monkeypatch):
    # Windows PowerShell 5.1's Set-Content -Encoding utf8 starts the file with a BOM.
    (tmp_path / 'outlook_calendar_cache.json').write_bytes(b'\xef\xbb\xbf[{"subject": "Test"}]')
    body = _calendar(tmp_store, tmp_path, monkeypatch, {'outlook_mode': 'app'}, True)
    assert body['status'] == 'ok' and body['events'] == [{'subject': 'Test'}]
