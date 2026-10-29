import base64
import json
import logging

import pytest

from core.features.integrations.monday import config, credentials, releases

LINK = ('https://files-monday-com.s3.amazonaws.com/123/resources/456/s0L-1.10.0.zip'
        '?X-Amz-Expires=3600&X-Amz-Signature=sekret')


def _session():
    def part(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b'=').decode()
    credentials.save_app('cid', 'sec')
    credentials.save_token({'access_token': f"{part({'alg': 'none'})}.{part({'per': 'me:read,boards:read'})}.sig",
                            'refresh_token': 'r1', 'expires_at': None, 'user': {'id': '7', 'name': 'Abide'}})


def _files(*names, size=100, item_id='777'):
    files = [{'name': name, 'asset': {'file_size': size, 'public_url': LINK.replace('s0L-1.10.0.zip', name)}}
             for name in names]
    return {'data': {'boards': [{'id': '9535661088'}], 'items_page_by_column_values': {
        'items': [{'id': item_id, 'column_values': [{'files': files}]}]}}}


class FakeResponse:
    def __init__(self, body, url):
        self._body, self._url, self.status = body, url, 200

    def read(self, size=-1):
        if size is None or size < 0:
            size = len(self._body)
        chunk, self._body = self._body[:size], self._body[size:]
        return chunk

    def geturl(self):
        return self._url

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeOpener:
    def __init__(self, body=b'', final_url=None):
        self.body, self.final_url, self.requests = body, final_url, []

    def open(self, request, timeout=None):
        self.requests.append(request.full_url)
        return FakeResponse(self.body, self.final_url or request.full_url)


def test_release_version_reads_only_release_zips():
    assert releases.release_version('s0L-1.10.0.zip') == (1, 10, 0)
    for name in ('s0L-1.0.0-unsigned.zip', 's0L-1.0.zip', 'notes.txt', 'S0L-1.0.0.ZIP', 's0L-1.0.0.zip.exe'):
        assert releases.release_version(name) is None


def test_parse_version_reads_three_numbers_only():
    assert releases.parse_version('1.2.3') == (1, 2, 3)
    for text in ('1.2', '1.2.3.4', 'v1.2.3', '1.2.x', '', None):
        assert releases.parse_version(text) is None


def test_latest_release_picks_highest_version_numerically(vault, fake_monday):
    _session()
    fake_monday.queue(config.API_URL, 200, _files('s0L-1.9.0.zip', 's0L-1.10.0.zip', 's0L-2.0.0-unsigned.zip'))
    latest = releases.latest_release()
    assert latest['version'] == (1, 10, 0) and latest['name'] == 's0L-1.10.0.zip'
    assert latest['size'] == 100 and latest['url'] == LINK


def test_latest_release_finds_the_release_item_by_name(vault, fake_monday):
    _session()
    fake_monday.queue(config.API_URL, 200, _files('s0L-1.0.0.zip'))
    releases.latest_release()
    variables = fake_monday.calls[0][1]['variables']
    assert variables == {'board': '9535661088', 'boards': ['9535661088'], 'name': 's0L', 'column': ['file_mksmcq4v']}


def test_release_item_is_the_newest_item_named_s0L(vault, fake_monday):
    _session()
    answer = _files('s0L-1.0.0.zip')
    answer['data']['items_page_by_column_values']['items'].append({'id': '13411298619', 'column_values': []})
    fake_monday.queue(config.API_URL, 200, answer)
    assert releases.release_item_id() == '13411298619'


def test_no_s0L_item_means_no_releases(vault, fake_monday):
    _session()
    fake_monday.queue(config.API_URL, 200, {'data': {'boards': [{'id': '9535661088'}], 'items_page_by_column_values': {'items': []}}})
    assert releases.latest_release() is None


def test_latest_release_none_without_release_files(vault, fake_monday):
    _session()
    fake_monday.queue(config.API_URL, 200, _files('notes.txt', 's0L-1.0.0-unsigned.zip'))
    assert releases.latest_release() is None


def test_newest_release_skips_bad_and_old_versions(vault, fake_monday):
    _session()
    fake_monday.queue(config.API_URL, 200, _files('s0L-999.0.0.zip', 's0L-1.2.0.zip', 's0L-1.1.0.zip'))
    assert releases.newest_release(newer_than=(1, 1, 0), skip={'999.0.0'})['version'] == (1, 2, 0)
    assert releases.newest_release(newer_than=(1, 2, 0), skip={'999.0.0'}) is None
    assert releases.newest_release()['version'] == (999, 0, 0)


def test_latest_release_no_access_when_board_hidden(vault, fake_monday):
    _session()
    fake_monday.queue(config.API_URL, 200, {'data': {'boards': [], 'items_page_by_column_values': {'items': []}}})
    with pytest.raises(releases.ReleaseError) as caught:
        releases.latest_release()
    assert caught.value.kind == 'no_access'


def test_download_refuses_other_hosts(tmp_path):
    opener = FakeOpener(b'x')
    with pytest.raises(releases.ReleaseError) as caught:
        releases.download('https://evil.example.com/s0L-1.0.0.zip', 1, str(tmp_path / 'a.zip'), opener=opener)
    assert caught.value.kind == 'bad_download' and opener.requests == []


def test_download_refuses_http(tmp_path):
    opener = FakeOpener(b'x')
    with pytest.raises(releases.ReleaseError):
        releases.download(LINK.replace('https://', 'http://'), 1, str(tmp_path / 'a.zip'), opener=opener)
    assert opener.requests == []


def test_download_refuses_redirects(tmp_path):
    opener = FakeOpener(b'x', final_url='https://evil.example.com/s0L-1.10.0.zip')
    with pytest.raises(releases.ReleaseError) as caught:
        releases.download(LINK, 1, str(tmp_path / 'a.zip'), opener=opener)
    assert caught.value.kind == 'bad_download' and not (tmp_path / 'a.zip').exists()


def test_default_opener_refuses_redirects():
    handler = releases._NoRedirect()
    with pytest.raises(releases.ReleaseError):
        handler.redirect_request(None, None, 302, 'Found', {}, 'https://evil.example.com/x')


def test_download_refuses_size_mismatch_and_oversize(tmp_path):
    dest = tmp_path / 'a.zip'
    for body in (b'1234', b'123456'):
        with pytest.raises(releases.ReleaseError):
            releases.download(LINK, 5, str(dest), opener=FakeOpener(body))
        assert not dest.exists() and not (tmp_path / 'a.zip.part').exists()
    opener = FakeOpener(b'x')
    with pytest.raises(releases.ReleaseError):
        releases.download(LINK, releases.MAX_DOWNLOAD_BYTES + 1, str(dest), opener=opener)
    assert opener.requests == []


def test_download_writes_file(tmp_path):
    dest = tmp_path / 'a.zip'
    opener = FakeOpener(b'zipbytes')
    releases.download(LINK, 8, str(dest), opener=opener)
    assert dest.read_bytes() == b'zipbytes' and opener.requests == [LINK]


def test_download_never_logs_the_link(tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    with pytest.raises(releases.ReleaseError) as caught:
        releases.download(LINK, 5, str(tmp_path / 'a.zip'), opener=FakeOpener(b'12'))
    assert 'sekret' not in caplog.text and 'sekret' not in str(caught.value)
