"""
Outlook blueprint: which Outlook this computer uses (the classic app through its
own local connection, or the browser), opening real Outlook drafts and meeting
invites in the app, and finding people in Outlook's address book. No sign-in,
no registration; localhost-only.
"""
from flask import Blueprint, jsonify, request

from core.shared import outlook_app
from core.shared.security import is_local_host
from core.shared.state import SYNC_LOCK, load_data, save_data
from core.features.integrations.outlook import drafts, people

outlook_blueprint = Blueprint('outlook', __name__)

_NO_APP = ("The Outlook app isn't set up on this computer. Pick Outlook in the browser from the Outlook icon "
           'at the top.')


@outlook_blueprint.before_request
def _only_local_hosts():
    if not is_local_host(request.host):
        return jsonify({'error': 'Forbidden host'}), 403
    return None


def _json_only():
    # JSON bodies force a CORS preflight, so other sites can't trigger these routes.
    if not request.is_json:
        return jsonify({'error': 'Expected a JSON request'}), 415
    return None


def _status(preferences):
    found = outlook_app.usable()
    running = False
    if found:
        with outlook_app.com_thread():
            running = outlook_app.running_app() is not None
    chosen = (preferences or {}).get('outlook_mode')
    return {
        'app': {'found': found, 'running': running},
        'mode': chosen if chosen in outlook_app.MODES else None,
        'effective': outlook_app.effective_mode(preferences),
    }


@outlook_blueprint.route('/api/outlook/status', methods=['GET'])
def outlook_status():
    return jsonify(_status(load_data().get('preferences')))


@outlook_blueprint.route('/api/outlook/mode', methods=['PUT'])
def choose_mode():
    """Remember, for this computer, whether s0L uses the Outlook app or Outlook in the browser."""
    refused = _json_only()
    if refused:
        return refused
    mode = (request.get_json(silent=True) or {}).get('mode')
    if mode not in outlook_app.MODES:
        return jsonify({'error': "Choose 'app' or 'web'."}), 400
    if mode == 'app' and not outlook_app.usable():
        return jsonify({'error': "The Outlook app isn't set up on this computer."}), 409
    with SYNC_LOCK:
        data = load_data()
        data['preferences'] = {**(data.get('preferences') or {}), 'outlook_mode': mode}
        save_data(data)
    return jsonify(_status(data['preferences']))


def _one_line(error):
    return ' '.join(str(error).split())[:300] or type(error).__name__


def _in_outlook(open_item, files):
    """Open the item in the Outlook app (starting it if needed: a person clicked for this)."""
    if not outlook_app.usable():
        return jsonify({'error': _NO_APP, 'kind': 'no_app'}), 409
    failure = None
    try:
        with drafts.attachment_copies(files) as paths, outlook_app.com_thread():
            # Handled in here, so the error and the Outlook objects its traceback holds are gone before COM shuts down.
            try:
                open_item(outlook_app.open_app(), paths)
            except outlook_app.OutlookUnavailable:
                failure = (_NO_APP, 'no_app', 409)
            except Exception as error:  # Outlook's own failures arrive as COM errors
                failure = (f"Outlook didn't open it: {_one_line(error)}", 'outlook_failed', 502)
    except drafts.DraftError as error:
        return jsonify({'error': str(error), 'kind': error.kind}), error.status
    if failure:
        message, kind, status = failure
        return jsonify({'error': message, 'kind': kind}), status
    return jsonify({'opened': True})


@outlook_blueprint.route('/api/outlook/draft', methods=['POST'])
def open_draft():
    """Open a filled-in email in Outlook; the person checks it and presses Send."""
    refused = _json_only()
    if refused:
        return refused
    body = request.get_json(silent=True) or {}
    try:
        to = drafts.clean_addresses(body.get('to'), 'to')
        cc = drafts.clean_addresses(body.get('cc'), 'cc')
        drafts.check_recipients(to, cc)
        subject = drafts.clean_text(body.get('subject'), 'The subject', drafts.MAX_SUBJECT)
        text = drafts.clean_text(body.get('body'), 'The message', drafts.MAX_BODY)
        files = drafts.resolve_attachments(load_data(), body.get('deal_id'), body.get('attachments'))
    except drafts.DraftError as error:
        return jsonify({'error': str(error), 'kind': error.kind}), error.status
    return _in_outlook(
        lambda app, paths: drafts.open_email(app, to=to, cc=cc, subject=subject, body=text, files=paths), files)


@outlook_blueprint.route('/api/outlook/invite', methods=['POST'])
def open_invite():
    """Open a filled-in meeting invite in Outlook; the person checks it and presses Send."""
    refused = _json_only()
    if refused:
        return refused
    body = request.get_json(silent=True) or {}
    try:
        attendees = drafts.clean_addresses(body.get('attendees'), 'attendees')
        drafts.check_recipients(attendees)
        subject = drafts.clean_text(body.get('subject'), 'The subject', drafts.MAX_SUBJECT)
        location = drafts.clean_text(body.get('location'), 'The location', drafts.MAX_LOCATION)
        text = drafts.clean_text(body.get('body'), 'The invite text', drafts.MAX_BODY)
        start = drafts.local_time(body.get('start'), 'The start')
        end = drafts.local_time(body.get('end'), 'The end')
        if end <= start:
            raise drafts.DraftError('The meeting must end after it starts.')
        files = drafts.resolve_attachments(load_data(), body.get('deal_id'), body.get('attachments'))
    except drafts.DraftError as error:
        return jsonify({'error': str(error), 'kind': error.kind}), error.status
    return _in_outlook(lambda app, paths: drafts.open_invite(
        app, attendees=attendees, subject=subject, start=start, end=end, location=location, body=text, files=paths),
        files)


@outlook_blueprint.route('/api/outlook/people', methods=['GET'])
def find_people():
    """Who Outlook thinks the typed name is, each with an email. Asks the open Outlook only; never starts it."""
    if outlook_app.effective_mode(load_data().get('preferences')) != 'app':
        return jsonify({'status': 'web', 'people': []})
    if not outlook_app.usable():
        return jsonify({'status': 'no_app', 'people': []})
    status, found = 'not_running', []
    with outlook_app.com_thread():
        app = outlook_app.running_app()
        if app is not None:
            # Read inside, so no Outlook object outlives COM on this thread.
            try:
                status, found = 'ok', people.suggest(app.Session, request.args.get('q', ''))
            except Exception:  # Outlook's own failures arrive as COM errors
                status, found = 'failed', []
    return jsonify({'status': status, 'people': found})


@outlook_blueprint.route('/api/outlook/people/pick', methods=['POST'])
def pick_person():
    """Open Outlook's address book to pick one person (starting Outlook if needed: a person clicked for this)."""
    refused = _json_only()
    if refused:
        return refused
    if not outlook_app.usable():
        return jsonify({'error': _NO_APP, 'kind': 'no_app'}), 409
    person, failure = None, None
    with outlook_app.com_thread():
        try:
            person = people.pick(outlook_app.open_app().Session)
        except outlook_app.OutlookUnavailable:
            failure = (_NO_APP, 'no_app', 409)
        except Exception as error:
            failure = (f"Outlook's address book didn't open: {_one_line(error)}", 'outlook_failed', 502)
    if failure:
        message, kind, status = failure
        return jsonify({'error': message, 'kind': kind}), status
    return jsonify({'person': person})
