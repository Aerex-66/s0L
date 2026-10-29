import base64
import json

import pytest

from core.features.integrations.monday import config, credentials, publish, releases


def _session(scopes):
    def part(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b'=').decode()
    credentials.save_app('cid', 'sec')
    credentials.save_token({'access_token': f"{part({'alg': 'none'})}.{part({'per': scopes})}.sig",
                            'refresh_token': 'r1', 'expires_at': None, 'user': {'id': '7', 'name': 'Abide'}})


def _files(*names):
    files = [{'name': name, 'asset': {'file_size': 10, 'public_url': 'https://files-monday-com.s3.amazonaws.com/x'}}
             for name in names]
    return {'data': {'boards': [{'id': '9535661088'}], 'items_page_by_column_values': {
        'items': [{'id': '777', 'column_values': [{'files': files}]}]}}}


@pytest.fixture
def repo(tmp_path, monkeypatch):
    package = tmp_path / 'package.json'
    package.write_text('{\n  "name": "s0l",\n  "version": "1.0.1"\n}\n', encoding='utf-8')
    (tmp_path / 'release').mkdir()
    monkeypatch.setattr(publish, 'PACKAGE_JSON', str(package))
    monkeypatch.setattr(publish, 'RELEASE_DIR', str(tmp_path / 'release'))
    return tmp_path


def test_next_version_bumps_what_is_on_monday():
    assert publish.next_version((1, 0, 0), (1, 0, 0)) == (1, 0, 1)


def test_next_version_keeps_a_higher_package_version():
    assert publish.next_version((1, 0, 0), (1, 2, 0)) == (1, 2, 0)


def test_next_version_first_release():
    assert publish.next_version(None, (1, 0, 0)) == (1, 0, 0)


def test_requested_version_must_be_newer():
    with pytest.raises(ValueError):
        publish.next_version((1, 2, 0), (1, 0, 0), (1, 2, 0))
    assert publish.next_version((1, 2, 0), (1, 0, 0), (1, 3, 0)) == (1, 3, 0)
    assert publish.next_version(None, (1, 0, 0), (1, 1, 0)) == (1, 1, 0)


def test_write_package_version_changes_only_the_version(tmp_path):
    original = ('{\r\n  "name": "s0l",\r\n  "version": "1.0.1",\r\n  "dependencies": {\r\n'
                '    "x": { "version": "9.9.9" }\r\n  }\r\n}\r\n')
    path = tmp_path / 'package.json'
    path.write_bytes(original.encode('utf-8'))
    publish.write_package_version(str(path), '1.1.0')
    assert path.read_bytes() == original.replace('"version": "1.0.1"', '"version": "1.1.0"').encode('utf-8')


def test_upload_sends_multipart_with_the_mutation(tmp_path, vault, fake_monday):
    _session('me:read,boards:read,boards:write')
    fake_monday.queue(config.API_URL, 200, _files('s0L-1.0.0.zip'))
    archive = tmp_path / 's0L-1.0.1.zip'
    archive.write_bytes(b'PK-bytes')
    sent = {}

    def post(url, body, headers):
        sent.update(url=url, body=body, headers=headers)
        return 200, {'data': {'add_file_to_column': {'id': '555'}}}

    assert releases.upload(str(archive), post=post) == '555'
    body = sent['body']
    assert sent['url'] == config.FILE_API_URL and sent['headers']['Authorization']
    assert sent['headers']['Content-Type'].startswith('multipart/form-data; boundary=')
    assert b'name="query"' in body and b'item_id: 777' in body and b'file_mksmcq4v' in body
    assert b'name="variables[file]"; filename="s0L-1.0.1.zip"' in body and b'PK-bytes' in body


def test_upload_needs_an_s0L_item(tmp_path, vault, fake_monday):
    _session('me:read,boards:read,boards:write')
    fake_monday.queue(config.API_URL, 200, {'data': {'boards': [{'id': '9535661088'}], 'items_page_by_column_values': {'items': []}}})
    archive = tmp_path / 's0L-1.0.1.zip'
    archive.write_bytes(b'PK')
    with pytest.raises(releases.ReleaseError) as caught:
        releases.upload(str(archive), post=lambda url, body, headers: (200, {}))
    assert caught.value.kind == 'upload_failed' and 'named s0L' in str(caught.value)


def test_upload_reports_monday_refusal(tmp_path, vault, fake_monday):
    _session('me:read,boards:read,boards:write')
    fake_monday.queue(config.API_URL, 200, _files('s0L-1.0.0.zip'))
    archive = tmp_path / 's0L-1.0.1.zip'
    archive.write_bytes(b'PK')
    with pytest.raises(releases.ReleaseError) as caught:
        releases.upload(str(archive), post=lambda url, body, headers: (200, {'errors': [{'message': 'Unsupported file type'}]}))
    assert caught.value.kind == 'upload_failed' and 'Unsupported file type' in str(caught.value)


def test_main_refuses_without_board_write(vault, repo, capsys):
    _session('me:read,boards:read')
    builds = []
    assert publish.main([], run_build=lambda: builds.append(1)) == 1
    assert builds == [] and 'connect monday again' in capsys.readouterr().out.lower()


def test_main_refuses_an_old_requested_version(vault, fake_monday, repo):
    _session('me:read,boards:read,boards:write')
    fake_monday.queue(config.API_URL, 200, _files('s0L-1.2.0.zip'))
    builds = []
    assert publish.main(['--version', '1.1.0'], run_build=lambda: builds.append(1)) == 1
    assert builds == [] and '"version": "1.0.1"' in (repo / 'package.json').read_text(encoding='utf-8')


def test_main_publishes_and_confirms(vault, fake_monday, repo, monkeypatch, capsys):
    _session('me:read,boards:read,boards:write')
    fake_monday.queue(config.API_URL, 200, _files('s0L-1.0.0.zip'))
    fake_monday.queue(config.API_URL, 200, _files('s0L-1.0.0.zip', 's0L-1.0.1.zip'))
    uploads = []
    monkeypatch.setattr(releases, 'upload', lambda path: uploads.append(path) or '555')

    def build():
        (repo / 'release' / 's0L-1.0.1.zip').write_bytes(b'PK')

    assert publish.main([], run_build=build) == 0
    assert uploads == [str(repo / 'release' / 's0L-1.0.1.zip')]
    assert 'Published s0L 1.0.1 to monday.' in capsys.readouterr().out
