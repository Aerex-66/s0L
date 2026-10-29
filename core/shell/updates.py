"""
s0L updating itself (packaged app only). A check finds a newer release on monday,
downloads and unpacks it into the s0L folder's `.update\\staging`, has the installed
launcher check it, and then leaves a `ready` file. The launcher does the swap; its side
of the folder contract is in packaging/launcher/Updates.cs.
"""
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import zipfile

from flask import Blueprint, Response, jsonify, request

from core.features.integrations.monday import client, oauth, releases
from core.shared.security import is_local_host

log = logging.getLogger(__name__)

MAX_UNPACKED_BYTES = 1024 * 1024 * 1024
VERIFY_TIMEOUT_SECONDS = 180
FIRST_CHECK_SECONDS = 30
CHECK_EVERY_SECONDS = 4 * 60 * 60
_CHUNK = 1024 * 1024
_REJECTED = frozenset({1, 2, 3, 6})
_UNSIGNED_LAUNCHER = 4
_NOTICES = frozenset({'no_access', 'reconnect'})

_last = {'result': ''}
_wake = threading.Event()


class UpdateError(Exception):
    pass


def current_version():
    return os.environ.get('S0L_VERSION', '').strip()


def launcher_path():
    path = os.environ.get('S0L_LAUNCHER', '').strip()
    return path if path and os.path.isfile(path) else ''


def enabled():
    return bool(releases.parse_version(current_version()) and launcher_path())


def root_dir():
    return os.path.dirname(launcher_path()) if enabled() else ''


def update_dir():
    return os.path.join(root_dir(), '.update') if enabled() else ''


def _path(name):
    return os.path.join(update_dir(), name)


def last_result():
    return _last['result']


def _read_text(path):
    try:
        with open(path, encoding='utf-8') as handle:
            return handle.read()
    except OSError:
        return ''


def _write_text(path, text):
    fd, temp_path = tempfile.mkstemp(dir=os.path.dirname(path))
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        handle.write(text)
    os.replace(temp_path, path)


def _remove(path):
    try:
        os.remove(path)
    except OSError:
        pass


def ready_version():
    """The version a checked update is waiting to install, while its files are still staged; '' when none."""
    if not enabled() or not os.path.isfile(os.path.join(_path('staging'), 's0L.exe')):
        return ''
    text = _read_text(_path('ready')).strip()
    return text if releases.parse_version(text) else ''


def bad_versions():
    if not enabled():
        return set()
    return {line.strip() for line in _read_text(_path('bad-versions')).splitlines() if line.strip()}


def mark_bad(version):
    if version not in bad_versions():
        with open(_path('bad-versions'), 'a', encoding='utf-8') as handle:
            handle.write(version + '\n')


def _probe(path):
    with open(path, 'w', encoding='utf-8') as handle:
        handle.write('')
    os.remove(path)


def _writable():
    try:
        os.makedirs(update_dir(), exist_ok=True)
        _probe(_path('.probe'))
        return True
    except OSError:
        return False


def _clear_staging():
    # `ready` goes first: the launcher must never find it beside a half-deleted staging folder.
    for name in ('ready', 'download.zip', 'download.zip.part'):
        _remove(_path(name))
    shutil.rmtree(_path('staging'), ignore_errors=True)


def _planned_entries(entries):
    tops, planned, declared = set(), [], 0
    for info in entries:
        raw = info.filename
        if raw.startswith(('/', '\\')) or ':' in raw:
            raise UpdateError('The release holds an absolute path.')
        parts = [part for part in raw.replace('\\', '/').split('/') if part]
        if not parts or any(part in ('.', '..') for part in parts):
            raise UpdateError('The release holds a path that leaves its folder.')
        if len(parts) == 1 and not info.is_dir():
            raise UpdateError('The release holds a file outside its top folder.')
        tops.add(parts[0])
        declared += info.file_size
        if len(parts) > 1:
            planned.append((info, parts[1:]))
    if len(tops) != 1:
        raise UpdateError('The release must hold exactly one top folder.')
    if declared > MAX_UNPACKED_BYTES:
        raise UpdateError('The release unpacks to more than s0L allows.')
    return planned


def extract_package(zip_path, dest):
    """Unpack the release into dest without its top folder, refusing anything unsafe."""
    root = os.path.abspath(dest)
    try:
        with zipfile.ZipFile(zip_path) as archive:
            planned = _planned_entries(archive.infolist())
            os.makedirs(root)
            written = 0
            for info, parts in planned:
                target = os.path.abspath(os.path.join(root, *parts))
                if os.path.commonpath([target, root]) != root:
                    raise UpdateError('The release holds a path that leaves its folder.')
                if info.is_dir():
                    os.makedirs(target, exist_ok=True)
                    continue
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with archive.open(info) as source, open(target, 'wb') as out:
                    while True:
                        chunk = source.read(_CHUNK)
                        if not chunk:
                            break
                        written += len(chunk)
                        if written > MAX_UNPACKED_BYTES:
                            raise UpdateError('The release unpacks to more than s0L allows.')
                        out.write(chunk)
    except UpdateError:
        shutil.rmtree(root, ignore_errors=True)
        raise
    except (zipfile.BadZipFile, OSError, ValueError, RuntimeError) as error:
        shutil.rmtree(root, ignore_errors=True)
        raise UpdateError(f'The release could not be unpacked ({type(error).__name__}).') from None


def verify_with_launcher(staging, version):
    """The installed launcher's verdict on a staged release (exit codes in Updates.cs); -1 if it couldn't run."""
    try:
        return subprocess.run([launcher_path(), '--verify', staging, version], timeout=VERIFY_TIMEOUT_SECONDS).returncode
    except (subprocess.TimeoutExpired, OSError):
        return -1


def _stage(release, version, download, verify):
    _clear_staging()
    archive = _path('download.zip')
    try:
        download(release['url'], release['size'], archive)
        try:
            extract_package(archive, _path('staging'))
        finally:
            _remove(archive)
        code = verify(_path('staging'), version)
    except (releases.ReleaseError, UpdateError, OSError) as error:
        _clear_staging()
        log.warning('s0L %s was not staged: %s', version, error)
        return 'failed'
    if code == 0:
        _write_text(_path('ready'), version)
        return 'ready'
    _clear_staging()
    if code == _UNSIGNED_LAUNCHER:
        return 'unavailable'
    if code in _REJECTED:
        mark_bad(version)
        log.warning("s0L %s failed its check (code %s) and won't be offered again.", version, code)
        return 'rejected'
    log.warning('s0L %s could not be checked (code %s); trying again later.', version, code)
    return 'failed'


def _check(latest, download, verify):
    if not enabled():
        return 'disabled'
    if not _writable():
        log.warning("s0L can't write in its own folder, so it won't update itself.")
        return 'unwritable'
    if not ready_version():
        _clear_staging()
    try:
        release = latest(newer_than=releases.parse_version(current_version()), skip=bad_versions())
    except client.MondayError as error:
        if error.kind == 'not_connected':
            return 'not_connected'
        if 'missing required scopes' in str(error):
            return 'reconnect'
        log.warning('Update check failed: %s', error.kind)
        return 'failed'
    except releases.ReleaseError as error:
        if error.kind == 'no_access':
            return 'no_access'
        log.warning('Update check failed: %s', error.kind)
        return 'failed'
    if release is None or release['version'] <= releases.parse_version(current_version()):
        return 'up_to_date'
    version = '%d.%d.%d' % release['version']
    if version in bad_versions():
        return 'known_bad'
    if ready_version() == version:
        return 'already_ready'
    return _stage(release, version, download, verify)


def check_once(*, latest=releases.newest_release, download=releases.download, verify=verify_with_launcher):
    """One update check; returns a result code (see the plan's Task 2) and remembers it."""
    result = _check(latest, download, verify)
    _last['result'] = result
    return result


def status():
    """What the app shows: whether updates run, this version, a ready update and any notice."""
    if enabled() and last_result() == 'not_connected' and oauth.status().get('connected'):
        wake()
    return {
        'enabled': enabled(),
        'version': current_version() if enabled() else '',
        'ready': ready_version(),
        'notice': last_result() if last_result() in _NOTICES else None,
    }


def request_restart():
    """Ask the launcher to install the ready update; False when none is ready."""
    if not ready_version():
        return False
    _write_text(_path('restart'), '')
    return True


def wake():
    _wake.set()


def _run_checks(first_wait, every):
    _wake.wait(first_wait)
    while True:
        _wake.clear()
        try:
            check_once()
        except Exception as error:  # the loop must outlive any one failed check
            log.warning('Update check crashed (%s).', type(error).__name__)
        _wake.wait(every)


def start_checks():
    thread = threading.Thread(target=_run_checks, args=(FIRST_CHECK_SECONDS, CHECK_EVERY_SECONDS),
                              name='update-checks', daemon=True)
    thread.start()
    return thread


updates_blueprint = Blueprint('updates', __name__)


@updates_blueprint.before_request
def _only_local_hosts():
    if not is_local_host(request.host):
        return jsonify({'error': 'Forbidden host'}), 403
    return None


@updates_blueprint.route('/api/updates/status', methods=['GET'])
def update_status():
    return jsonify(status())


@updates_blueprint.route('/api/updates/version', methods=['GET'])
def update_version():
    return Response(current_version(), mimetype='text/plain')


@updates_blueprint.route('/api/updates/restart', methods=['POST'])
def restart():
    # A JSON body forces a CORS preflight, so other sites can't trigger a restart.
    if not request.is_json:
        return jsonify({'error': 'Expected a JSON request'}), 415
    if not request_restart():
        return jsonify({'error': 'No update is ready.'}), 409
    return jsonify({'restarting': True}), 202
