import io
import logging
import zipfile
from pathlib import Path

import pytest

from core.features.integrations.monday import client, releases
from core.shell import updates

PACKAGE = {'s0L/s0L.exe': b'exe', 's0L/app/deal_tracker.py': b'print(1)'}
LINK = 'https://files-monday-com.s3.amazonaws.com/1/resources/2/s0L-1.1.0.zip?X-Amz-Signature=sekret'


def _zip_bytes(entries):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    return buffer.getvalue()


def _zip_file(path, entries):
    path.write_bytes(_zip_bytes(entries))
    return str(path)


def _release(version=(1, 1, 0)):
    return lambda **kwargs: {'version': version, 'name': 's0L-%d.%d.%d.zip' % version, 'size': 10, 'url': LINK}


def _raise(error):
    def latest(**kwargs):
        raise error
    return latest


class Downloads:
    def __init__(self, entries=PACKAGE):
        self.calls, self.data = 0, _zip_bytes(entries)

    def __call__(self, url, size, dest, **kwargs):
        self.calls += 1
        Path(dest).write_bytes(self.data)


def _verify(code):
    def verify(staging, version):
        verify.calls.append((staging, version))
        return code
    verify.calls = []
    return verify


@pytest.fixture
def packaged(tmp_path, monkeypatch):
    root = tmp_path / 's0L'
    root.mkdir()
    (root / 's0L.exe').write_bytes(b'')
    monkeypatch.setenv('S0L_VERSION', '1.0.0')
    monkeypatch.setenv('S0L_LAUNCHER', str(root / 's0L.exe'))
    monkeypatch.setitem(updates._last, 'result', '')
    return root


def test_disabled_without_launcher_env(monkeypatch, tmp_path):
    monkeypatch.delenv('S0L_VERSION', raising=False)
    monkeypatch.delenv('S0L_LAUNCHER', raising=False)
    assert updates.check_once() == 'disabled' and not updates.enabled()
    monkeypatch.setenv('S0L_VERSION', '1.0.0')
    monkeypatch.setenv('S0L_LAUNCHER', str(tmp_path / 'missing.exe'))
    assert not updates.enabled() and updates.ready_version() == ''


def test_extract_strips_the_top_folder(tmp_path):
    archive = _zip_file(tmp_path / 'p.zip', {'s0L/': b'', **PACKAGE})
    updates.extract_package(archive, str(tmp_path / 'dest'))
    assert (tmp_path / 'dest' / 's0L.exe').read_bytes() == b'exe'
    assert (tmp_path / 'dest' / 'app' / 'deal_tracker.py').read_bytes() == b'print(1)'


def test_extract_refuses_escape(tmp_path):
    for bad in ('s0L/../evil.txt', '/abs.txt', 'C:/x.txt', 's0L/sub/../../evil.txt'):
        archive = _zip_file(tmp_path / 'p.zip', {'s0L/ok.txt': b'ok', bad: b'x'})
        with pytest.raises(updates.UpdateError):
            updates.extract_package(archive, str(tmp_path / 'dest'))
        assert not (tmp_path / 'dest').exists() and not (tmp_path / 'evil.txt').exists()


def test_extract_refuses_two_top_folders(tmp_path):
    for entries in ({'a/x.txt': b'', 'b/y.txt': b''}, {'x.txt': b''}):
        archive = _zip_file(tmp_path / 'p.zip', entries)
        with pytest.raises(updates.UpdateError):
            updates.extract_package(archive, str(tmp_path / 'dest'))
        assert not (tmp_path / 'dest').exists()


def test_extract_refuses_oversize(tmp_path, monkeypatch):
    monkeypatch.setattr(updates, 'MAX_UNPACKED_BYTES', 10)
    archive = _zip_file(tmp_path / 'p.zip', {'s0L/big.bin': b'x' * 20})
    with pytest.raises(updates.UpdateError):
        updates.extract_package(archive, str(tmp_path / 'dest'))
    assert not (tmp_path / 'dest').exists()


def test_newer_release_is_staged_and_ready(packaged):
    verify = _verify(0)
    assert updates.check_once(latest=_release(), download=Downloads(), verify=verify) == 'ready'
    assert updates.ready_version() == '1.1.0' and updates.last_result() == 'ready'
    assert (packaged / '.update' / 'staging' / 's0L.exe').exists()
    assert not (packaged / '.update' / 'download.zip').exists()
    assert verify.calls == [(str(packaged / '.update' / 'staging'), '1.1.0')]


def test_same_or_older_version_is_up_to_date(packaged):
    downloads = Downloads()
    for version in ((1, 0, 0), (0, 9, 9)):
        assert updates.check_once(latest=_release(version), download=downloads, verify=_verify(0)) == 'up_to_date'
    assert updates.check_once(latest=lambda **kwargs: None, download=downloads, verify=_verify(0)) == 'up_to_date'
    assert downloads.calls == 0


def test_numeric_compare(packaged, monkeypatch):
    monkeypatch.setenv('S0L_VERSION', '1.9.0')
    assert updates.check_once(latest=_release((1, 10, 0)), download=Downloads(), verify=_verify(0)) == 'ready'


def test_check_asks_for_newer_releases_that_are_not_bad(packaged):
    (packaged / '.update').mkdir()
    (packaged / '.update' / 'bad-versions').write_text('9.9.9\n', encoding='utf-8')
    asked = []
    updates.check_once(latest=lambda **kwargs: asked.append(kwargs), download=Downloads(), verify=_verify(0))
    assert asked == [{'newer_than': (1, 0, 0), 'skip': {'9.9.9'}}]


def test_rejected_package_marked_bad_and_removed(packaged):
    assert updates.check_once(latest=_release(), download=Downloads(), verify=_verify(3)) == 'rejected'
    assert updates.bad_versions() == {'1.1.0'} and updates.ready_version() == ''
    assert not (packaged / '.update' / 'staging').exists()
    again = Downloads()
    assert updates.check_once(latest=_release(), download=again, verify=_verify(0)) == 'known_bad'
    assert again.calls == 0


def test_unsigned_install_is_unavailable_not_bad(packaged):
    assert updates.check_once(latest=_release(), download=Downloads(), verify=_verify(4)) == 'unavailable'
    assert updates.bad_versions() == set() and updates.ready_version() == ''
    assert not (packaged / '.update' / 'staging').exists()


def test_launcher_of_another_version_is_rejected(packaged):
    assert updates.check_once(latest=_release(), download=Downloads(), verify=_verify(6)) == 'rejected'
    assert updates.bad_versions() == {'1.1.0'}


def test_verify_with_launcher_passes_the_version(packaged, monkeypatch):
    ran = []

    class Done:
        returncode = 0

    monkeypatch.setattr(updates.subprocess, 'run', lambda args, timeout: ran.append(args) or Done())
    assert updates.verify_with_launcher('C:/s0L/.update/staging', '1.1.0') == 0
    assert ran == [[str(packaged / 's0L.exe'), '--verify', 'C:/s0L/.update/staging', '1.1.0']]


def test_check_that_could_not_run_is_retried_not_marked_bad(packaged):
    assert updates.check_once(latest=_release(), download=Downloads(), verify=_verify(-1)) == 'failed'
    assert updates.bad_versions() == set() and updates.ready_version() == ''


def test_already_ready_skips_download(packaged):
    updates.check_once(latest=_release(), download=Downloads(), verify=_verify(0))
    again = Downloads()
    assert updates.check_once(latest=_release(), download=again, verify=_verify(0)) == 'already_ready'
    assert again.calls == 0


def test_ready_needs_the_staged_files(packaged):
    (packaged / '.update').mkdir()
    (packaged / '.update' / 'ready').write_text('1.1.0', encoding='utf-8')
    assert updates.ready_version() == ''
    downloads = Downloads()
    assert updates.check_once(latest=_release(), download=downloads, verify=_verify(0)) == 'ready'
    assert downloads.calls == 1 and updates.ready_version() == '1.1.0'


def test_clearing_removes_ready_before_the_staged_files(packaged, monkeypatch):
    updates.check_once(latest=_release(), download=Downloads(), verify=_verify(0))
    ready_when_staging_went = []
    real_rmtree = updates.shutil.rmtree

    def watch(path, *args, **kwargs):
        ready_when_staging_went.append((packaged / '.update' / 'ready').exists())
        real_rmtree(path, *args, **kwargs)

    monkeypatch.setattr(updates.shutil, 'rmtree', watch)
    updates.check_once(latest=_release((1, 2, 0)), download=Downloads(), verify=_verify(0))
    assert ready_when_staging_went and not any(ready_when_staging_went)


def test_newer_release_replaces_a_ready_one(packaged):
    updates.check_once(latest=_release(), download=Downloads(), verify=_verify(0))
    assert updates.check_once(latest=_release((1, 2, 0)), download=Downloads(), verify=_verify(0)) == 'ready'
    assert updates.ready_version() == '1.2.0'


def test_interrupted_staging_is_cleared(packaged):
    staging = packaged / '.update' / 'staging'
    staging.mkdir(parents=True)
    (staging / 'junk.txt').write_text('half')
    (packaged / '.update' / 'download.zip').write_bytes(b'partial')
    downloads = Downloads()
    assert updates.check_once(latest=_release(), download=downloads, verify=_verify(0)) == 'ready'
    assert not (staging / 'junk.txt').exists() and downloads.calls == 1


def test_unwritable_folder(packaged, monkeypatch):
    def refuse(path):
        raise PermissionError(path)
    monkeypatch.setattr(updates, '_probe', refuse)
    asked = []
    assert updates.check_once(latest=lambda **kwargs: asked.append(1), download=Downloads(), verify=_verify(0)) == 'unwritable'
    assert asked == []


def test_monday_failures_map_to_results(packaged):
    cases = [
        (client.MondayError('not_connected', 'Sign in again.'), 'not_connected'),
        (client.MondayError('api', "Unauthorized to load field 'Asset.public_url', Reason: missing required scopes."), 'reconnect'),
        (releases.ReleaseError('no_access', "Can't see it."), 'no_access'),
        (client.MondayError('network', 'Could not reach monday.'), 'failed'),
    ]
    for error, expected in cases:
        assert updates.check_once(latest=_raise(error), download=Downloads(), verify=_verify(0)) == expected


def test_failures_never_log_links(packaged, caplog):
    caplog.set_level(logging.DEBUG)

    def broken(url, size, dest, **kwargs):
        raise releases.ReleaseError('bad_download', 'The download is smaller than monday said.')

    assert updates.check_once(latest=_release(), download=broken, verify=_verify(0)) == 'failed'
    assert 'sekret' not in caplog.text and 's0L 1.1.0' in caplog.text


def _ready(root, version='1.1.0'):
    (root / '.update' / 'staging').mkdir(parents=True, exist_ok=True)
    (root / '.update' / 'staging' / 's0L.exe').write_bytes(b'exe')
    (root / '.update' / 'ready').write_text(version, encoding='utf-8')


def test_status_when_disabled(tmp_store, monkeypatch):
    monkeypatch.delenv('S0L_VERSION', raising=False)
    monkeypatch.delenv('S0L_LAUNCHER', raising=False)
    assert tmp_store.get('/api/updates/status').get_json() == {'enabled': False, 'version': '', 'ready': '', 'notice': None}


def test_status_reports_ready_and_notice(tmp_store, packaged, monkeypatch):
    _ready(packaged)
    monkeypatch.setitem(updates._last, 'result', 'no_access')
    assert tmp_store.get('/api/updates/status').get_json() == {
        'enabled': True, 'version': '1.0.0', 'ready': '1.1.0', 'notice': 'no_access'}


def test_status_wakes_the_checker_after_sign_in(tmp_store, packaged, monkeypatch):
    woke = []
    monkeypatch.setattr(updates, 'wake', lambda: woke.append(1))
    monkeypatch.setattr(updates.oauth, 'status', lambda: {'connected': True})
    monkeypatch.setitem(updates._last, 'result', 'not_connected')
    tmp_store.get('/api/updates/status')
    assert woke == [1]


def test_version_is_plain_text(tmp_store, packaged):
    response = tmp_store.get('/api/updates/version')
    assert response.data == b'1.0.0' and response.mimetype == 'text/plain'


def test_restart_needs_json(tmp_store, packaged):
    _ready(packaged)
    assert tmp_store.post('/api/updates/restart', data='{}').status_code == 415
    assert not (packaged / '.update' / 'restart').exists()


def test_restart_needs_a_ready_update(tmp_store, packaged):
    response = tmp_store.post('/api/updates/restart', json={})
    assert response.status_code == 409 and response.get_json() == {'error': 'No update is ready.'}
    assert not (packaged / '.update' / 'restart').exists()


def test_restart_writes_marker_and_is_idempotent(tmp_store, packaged):
    _ready(packaged)
    for _ in range(2):
        response = tmp_store.post('/api/updates/restart', json={})
        assert response.status_code == 202 and response.get_json() == {'restarting': True}
    assert (packaged / '.update' / 'restart').exists()


def test_restart_refuses_foreign_host(tmp_store, packaged):
    _ready(packaged)
    response = tmp_store.post('/api/updates/restart', json={}, headers={'Host': 'evil.example.com'})
    assert response.status_code == 403 and not (packaged / '.update' / 'restart').exists()
