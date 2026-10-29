from flask import Blueprint, jsonify, request

from deal_structure import ACTIVITY_CATEGORIES, KEY_RESOURCES
from core.shared import directory
from core.shared.state import SYNC_LOCK, load_data, next_string_id, save_data

_MAX_FIELD_LEN = 500


settings_blueprint = Blueprint('settings', __name__)


@settings_blueprint.route('/api/activity-structure', methods=['GET'])
def get_activity_structure():
    return jsonify(ACTIVITY_CATEGORIES)


@settings_blueprint.route('/api/resource-structure', methods=['GET'])
def get_resource_structure():
    return jsonify(KEY_RESOURCES)


_SCOPES = ('mine', 'everyone')
_PREFERENCE_KEYS = frozenset({'solutioner', 'scope'})


def _preferences(data):
    prefs = data.get('preferences') or {}
    return {'solutioner': prefs.get('solutioner', ''), 'scope': prefs.get('scope', 'mine')}


@settings_blueprint.route('/api/preferences', methods=['GET'])
def get_preferences():
    """Whose deals this computer's dashboard shows: the user's own (as a solutioner on the board) or everyone's."""
    return jsonify(_preferences(load_data()))


@settings_blueprint.route('/api/preferences', methods=['PUT'])
def update_preferences():
    payload = request.json
    if not isinstance(payload, dict):
        return jsonify({'error': 'Expected a JSON object'}), 400
    unknown = sorted(set(payload) - _PREFERENCE_KEYS)
    if unknown:
        return jsonify({'error': f'Unknown preference(s): {", ".join(unknown)}'}), 400
    if 'scope' in payload and payload['scope'] not in _SCOPES:
        return jsonify({'error': 'scope must be "mine" or "everyone"'}), 400
    name = str(payload.get('solutioner') or '').strip()
    if len(name) > _MAX_FIELD_LEN:
        return jsonify({'error': 'solutioner is too long'}), 400

    data = load_data()
    prefs = _preferences(data)
    if 'solutioner' in payload:
        prefs['solutioner'] = name
    if 'scope' in payload:
        prefs['scope'] = payload['scope']
    # Keep what other features store here (the monday email the name was picked under).
    data['preferences'] = {**(data.get('preferences') or {}), **prefs}
    save_data(data)
    return jsonify(prefs)


@settings_blueprint.route('/api/quick-contacts', methods=['GET'])
def get_quick_contacts():
    """People, service areas, sectors and their SRR/PRR review forms: Outlook → Quick contacts and a deal's forms."""
    return jsonify(directory.quick_contacts(load_data()))


@settings_blueprint.route('/api/contacts', methods=['GET'])
def get_contacts():
    return jsonify(load_data().get('master_contacts', []))


@settings_blueprint.route('/api/contacts', methods=['POST'])
def create_contact():
    """Add a person with their roles; the same person (email, or name without one) gets the roles instead."""
    try:
        incoming = directory.clean_person(request.json)
    except directory.DirectoryError as error:
        return jsonify({'error': str(error)}), 400
    with SYNC_LOCK:
        data = load_data()
        people = data.setdefault('master_contacts', [])
        person = directory.same_person(people, incoming['name'], incoming['email'])
        if person:
            directory.merge_into(person, incoming)
        else:
            person = {'id': next_string_id(people), **incoming}
            people.append(person)
        save_data(data)
    return jsonify(person)


@settings_blueprint.route('/api/contacts/<contact_id>', methods=['PUT'])
def update_master_contact(contact_id):
    """Change a person's details; roles, when sent, replace theirs."""
    try:
        changes = directory.clean_person(request.json, partial=True)
    except directory.DirectoryError as error:
        return jsonify({'error': str(error)}), 400
    with SYNC_LOCK:
        data = load_data()
        person = next((p for p in data.get('master_contacts', []) if str(p.get('id')) == str(contact_id)), None)
        if person is None:
            return jsonify({'error': 'Contact not found'}), 404
        person.update(changes)
        save_data(data)
    return jsonify(person)


@settings_blueprint.route('/api/contacts/<contact_id>', methods=['DELETE'])
def delete_master_contact(contact_id):
    with SYNC_LOCK:
        data = load_data()
        people = data.get('master_contacts', [])
        kept = [p for p in people if str(p.get('id')) != str(contact_id)]
        if len(kept) == len(people):
            return jsonify({'error': 'Contact not found'}), 404
        data['master_contacts'] = kept
        save_data(data)
    return jsonify({'message': 'Contact deleted'})


@settings_blueprint.route('/api/review-forms', methods=['PUT'])
def save_review_form():
    """One sector's SRR or PRR form: how the review works, its link and a note. s0L never opens the link itself."""
    try:
        kind, sector, entry = directory.clean_review_form(request.json)
    except directory.DirectoryError as error:
        return jsonify({'error': str(error)}), 400
    with SYNC_LOCK:
        data = load_data()
        forms = directory.save_review_form(data, kind, sector, entry)
        save_data(data)
    return jsonify(forms)
