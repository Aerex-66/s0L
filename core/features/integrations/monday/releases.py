"""
s0L's own releases on monday: the newest s0L-<version>.zip in the release item's Files
column, its download, and (for `npm run release`) its upload. download() is the only code
that fetches from monday's file storage, and only with the one-hour link monday's API hands out.
"""
import json
import os
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request

from core.features.integrations.monday import client, config, oauth

DOWNLOAD_HOSTS = frozenset({'files-monday-com.s3.amazonaws.com'})
MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024
TIMEOUT_SECONDS = 60
UPLOAD_TIMEOUT_SECONDS = 600
_CHUNK = 1024 * 1024
_VERSION = re.compile(r'(\d+)\.(\d+)\.(\d+)')
_RELEASE_NAME = re.compile(r's0L-(\d+\.\d+\.\d+)\.zip')
_RELEASE_QUERY = (
    'query ($board: ID!, $boards: [ID!], $name: String!, $column: [String!]) { boards(ids: $boards) { id } '
    'items_page_by_column_values(board_id: $board, limit: 50, columns: [{column_id: "name", column_values: [$name]}]) { '
    'items { id column_values(ids: $column) { ... on FileValue { files { ... on FileAssetValue { '
    'name asset { file_size public_url } } } } } } } }'
)


class ReleaseError(Exception):
    def __init__(self, kind, message):
        super().__init__(message)
        self.kind = kind


def parse_version(text):
    """(major, minor, patch) for '1.2.3'; None for anything else."""
    match = _VERSION.fullmatch(text) if isinstance(text, str) else None
    return tuple(int(part) for part in match.groups()) if match else None


def release_version(file_name):
    """The version in a release file name ('s0L-1.2.3.zip'); None for any other file."""
    match = _RELEASE_NAME.fullmatch(file_name) if isinstance(file_name, str) else None
    return parse_version(match.group(1)) if match else None


def latest_release():
    """The newest release on the item as {version, name, size, url}; None when it holds none."""
    return newest_release()


def _release_items():
    """The active items named s0L on the Files board; ReleaseError('no_access') when the board isn't visible."""
    data = client.graphql(_RELEASE_QUERY, {
        'board': config.RELEASE_BOARD_ID, 'boards': [config.RELEASE_BOARD_ID],
        'name': config.RELEASE_ITEM_NAME, 'column': [config.RELEASE_COLUMN_ID],
    })
    if not data.get('boards'):
        raise ReleaseError('no_access', "This monday account can't see s0L's update board.")
    return (data.get('items_page_by_column_values') or {}).get('items') or []


def release_item_id():
    """The item new releases go to: the newest item named s0L; None when there is none."""
    ids = [item['id'] for item in _release_items() if item.get('id')]
    return max(ids, key=int) if ids else None


def newest_release(newer_than=None, skip=()):
    """The highest release above newer_than whose version isn't in skip; None when there is none."""
    newest = None
    for item in _release_items():
        for value in item.get('column_values') or []:
            for entry in value.get('files') or []:
                version = release_version(entry.get('name'))
                asset = entry.get('asset') or {}
                if not version or not asset.get('public_url') or '%d.%d.%d' % version in skip:
                    continue
                if newer_than is not None and version <= newer_than:
                    continue
                if newest is None or version > newest['version']:
                    newest = {'version': version, 'name': entry['name'],
                              'size': int(asset.get('file_size') or 0), 'url': asset['public_url']}
    return newest


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ReleaseError('bad_download', "The download tried to redirect; s0L only follows monday's own link.")


def _check_link(url):
    parts = urllib.parse.urlsplit(url or '')
    if parts.scheme != 'https' or parts.hostname not in DOWNLOAD_HOSTS:
        raise ReleaseError('bad_download', "The download link is not on monday's file storage.")


def _remove(path):
    try:
        os.remove(path)
    except OSError:
        pass


def download(url, size, dest, *, opener=None):
    """Stream monday's link into dest. The size must equal monday's file_size and stay under the cap."""
    _check_link(url)
    if not 0 < size <= MAX_DOWNLOAD_BYTES:
        raise ReleaseError('bad_download', f'The release is {size} bytes; s0L downloads up to {MAX_DOWNLOAD_BYTES}.')
    partial = dest + '.part'
    opener = opener or urllib.request.build_opener(_NoRedirect())
    try:
        with opener.open(urllib.request.Request(url, method='GET'), timeout=TIMEOUT_SECONDS) as response:
            _check_link(response.geturl())
            written = 0
            with open(partial, 'wb') as out:
                while True:
                    chunk = response.read(_CHUNK)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > size:
                        raise ReleaseError('bad_download', 'The download is bigger than monday said.')
                    out.write(chunk)
        if written != size:
            raise ReleaseError('bad_download', 'The download is smaller than monday said.')
        os.replace(partial, dest)
    except ReleaseError:
        _remove(partial)
        raise
    except (urllib.error.URLError, OSError, ValueError) as error:
        _remove(partial)
        # The type only: the error text could carry the signed link.
        raise ReleaseError('bad_download', f'The download failed ({type(error).__name__}).') from None


def _multipart(query, file_name, data):
    boundary = '----s0L' + secrets.token_hex(16)
    head = (f'--{boundary}\r\nContent-Disposition: form-data; name="query"\r\n\r\n{query}\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="variables[file]"; filename="{file_name}"\r\n'
            'Content-Type: application/zip\r\n\r\n')
    return head.encode('utf-8') + data + f'\r\n--{boundary}--\r\n'.encode('utf-8'), boundary


def _post_file(url, body, headers):
    request = urllib.request.Request(url, data=body, method='POST', headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=UPLOAD_TIMEOUT_SECONDS) as response:
            return response.status, json.loads(response.read() or b'{}')
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read() or b'{}')
        except ValueError:
            return error.code, {}
    except (urllib.error.URLError, OSError, ValueError):
        return 0, {}


def upload(zip_path, *, post=None):
    """Add a release zip to the release item's Files column; returns monday's asset id."""
    try:
        token = oauth.access_token()
    except (oauth.NotConnected, oauth.OAuthError):
        raise ReleaseError('upload_failed', 'Sign in to monday again.') from None
    item = release_item_id()
    if not item:
        raise ReleaseError('upload_failed', f'The Files board has no item named {config.RELEASE_ITEM_NAME}: {config.RELEASE_BOARD_URL}')
    query = ('mutation ($file: File!) { add_file_to_column(item_id: %s, column_id: "%s", file: $file) { id } }'
             % (item, config.RELEASE_COLUMN_ID))
    with open(zip_path, 'rb') as handle:
        body, boundary = _multipart(query, os.path.basename(zip_path), handle.read())
    headers = {**oauth.api_headers(token), 'Content-Type': f'multipart/form-data; boundary={boundary}'}
    status, answer = (post or _post_file)(config.FILE_API_URL, body, headers)
    answer = answer if isinstance(answer, dict) else {}
    errors = answer.get('errors') or []
    asset = ((answer.get('data') or {}).get('add_file_to_column') or {}).get('id')
    if status != 200 or errors or not asset:
        first = errors[0] if errors and isinstance(errors[0], dict) else {}
        reason = first.get('message') or answer.get('error_message') or f'HTTP {status}'
        raise ReleaseError('upload_failed', f'monday refused the upload: {reason}')
    return str(asset)
