"""Outlook calendar read from Python: same events, fields and filter as outlook_calendar.ps1."""
import json
from datetime import datetime
from types import SimpleNamespace

from core.features.calendar import outlook_sync


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


def test_calendar_reads_cache_written_by_windows_powershell(tmp_path, monkeypatch):
    from core.shared import state
    from core.app_factory import create_app
    monkeypatch.setattr(state, 'DATA_ROOT', str(tmp_path))
    # Windows PowerShell 5.1's Set-Content -Encoding utf8 starts the file with a BOM.
    (tmp_path / 'outlook_calendar_cache.json').write_bytes(b'\xef\xbb\xbf[{"subject": "Test"}]')
    response = create_app().test_client().get('/api/calendar/outlook')
    assert response.status_code == 200 and response.get_json()['events'] == [{'subject': 'Test'}]
