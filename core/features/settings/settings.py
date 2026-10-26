import re

from flask import Blueprint, jsonify, request

from deal_structure import ACTIVITY_CATEGORIES, KEY_RESOURCES
from core.shared.defaults import DEFAULT_APPROVERS, APPROVER_KEY_META
from core.shared.state import load_data, next_string_id, save_data

_EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
_MAX_FIELD_LEN = 500
_CONTACT_FIELDS = ('name', 'email', 'role', 'area', 'company', 'phone', 'slack', 'notes')


settings_blueprint = Blueprint('settings', __name__)


@settings_blueprint.route('/api/activity-structure', methods=['GET'])
def get_activity_structure():
    return jsonify(ACTIVITY_CATEGORIES)


@settings_blueprint.route('/api/resource-structure', methods=['GET'])
def get_resource_structure():
    return jsonify(KEY_RESOURCES)


@settings_blueprint.route('/api/default-approvers', methods=['GET'])
def get_default_approvers():
    """Return approvers keyed by role (RTR_SAL etc.) — backed by master_contacts directory."""
    data = load_data()
    directory = data.get('master_contacts', [])
    result = {}
    for c in directory:
        akey = c.get('approver_key')
        if akey:
            result[akey] = {
                'name': c.get('name', ''),
                'email': c.get('email', ''),
                'slack': c.get('slack', ''),
                'phone': c.get('phone', ''),
            }
    # Fill in keys that have no directory entry yet
    for key in DEFAULT_APPROVERS:
        if key not in result:
            result[key] = {'name': '', 'email': '', 'slack': '', 'phone': ''}
    return jsonify(result)


@settings_blueprint.route('/api/default-approvers', methods=['PUT'])
def update_default_approvers():
    """Update approvers — writes through to master_contacts directory."""
    data = load_data()
    incoming = request.json or {}
    directory = data.get('master_contacts', [])
    # Index by approver_key
    by_key = {c['approver_key']: c for c in directory if c.get('approver_key')}

    for key, value in incoming.items():
        if not isinstance(value, dict):
            continue
        name = value.get('name', '').strip()
        if key in by_key:
            # Update existing directory entry
            entry = by_key[key]
            entry['name'] = name
            entry['email'] = value.get('email', entry.get('email', ''))
            entry['slack'] = value.get('slack', entry.get('slack', ''))
            entry['phone'] = value.get('phone', entry.get('phone', ''))
        elif name:
            # Create new directory entry for this approver key
            meta = APPROVER_KEY_META.get(key, {})
            new_entry = {
                'id': next_string_id(directory),
                'name': name,
                'email': value.get('email', ''),
                'role': meta.get('role', ''),
                'area': meta.get('area', ''),
                'company': '',
                'phone': value.get('phone', ''),
                'slack': value.get('slack', ''),
                'notes': '',
                'approver_key': key,
            }
            directory.append(new_entry)
            by_key[key] = new_entry

    # Also keep default_approvers in sync for backward compat during transition
    existing_da = data.get('default_approvers', {})
    for key, value in incoming.items():
        if isinstance(value, dict):
            if isinstance(existing_da.get(key), dict):
                existing_da[key].update(value)
            else:
                existing_da[key] = value
    data['default_approvers'] = existing_da
    data['master_contacts'] = directory
    save_data(data)

    # Return in the legacy keyed format
    result = {}
    for c in directory:
        akey = c.get('approver_key')
        if akey:
            result[akey] = {'name': c.get('name', ''), 'email': c.get('email', ''), 'slack': c.get('slack', ''), 'phone': c.get('phone', '')}
    for key in DEFAULT_APPROVERS:
        if key not in result:
            result[key] = {'name': '', 'email': '', 'slack': '', 'phone': ''}
    return jsonify(result)


@settings_blueprint.route('/api/contacts', methods=['GET'])
def get_contacts():
    data = load_data()
    return jsonify(data.get('master_contacts', []))


@settings_blueprint.route('/api/contacts', methods=['POST'])
def create_contact():
    data = load_data()
    if 'master_contacts' not in data:
        data['master_contacts'] = []

    contact_data = request.json or {}
    name = str(contact_data.get('name', '')).strip()[:_MAX_FIELD_LEN]
    email = str(contact_data.get('email', '')).strip()[:_MAX_FIELD_LEN]

    if not name:
        return jsonify({'error': 'Name is required'}), 400
    if email and not _EMAIL_RE.match(email):
        return jsonify({'error': 'Invalid email format'}), 400

    new_contact = {
        'id': next_string_id(data['master_contacts']),
        'name': name,
        'email': email,
        'role': str(contact_data.get('role', '')).strip()[:_MAX_FIELD_LEN],
        'area': str(contact_data.get('area', '')).strip()[:_MAX_FIELD_LEN],
        'company': str(contact_data.get('company', '')).strip()[:_MAX_FIELD_LEN],
        'phone': str(contact_data.get('phone', '')).strip()[:50],
        'slack': str(contact_data.get('slack', '')).strip()[:_MAX_FIELD_LEN],
        'notes': str(contact_data.get('notes', '')).strip()[:_MAX_FIELD_LEN],
    }
    # If an approver_key is provided (SAL/PAL role), store it
    akey = str(contact_data.get('approver_key', '')).strip()
    if akey:
        new_contact['approver_key'] = akey

    data['master_contacts'].append(new_contact)
    save_data(data)
    return jsonify(new_contact)


@settings_blueprint.route('/api/contacts/<contact_id>', methods=['PUT'])
def update_master_contact(contact_id):
    data = load_data()
    if 'master_contacts' not in data:
        return jsonify({'error': 'No contacts found'}), 404

    contact_data = request.json or {}
    contact_id = str(contact_id)
    for contact in data['master_contacts']:
        if str(contact['id']) == contact_id:
            new_email = str(contact_data.get('email', contact.get('email', ''))).strip()[:_MAX_FIELD_LEN]
            if new_email and not _EMAIL_RE.match(new_email):
                return jsonify({'error': 'Invalid email format'}), 400
            contact['name'] = str(contact_data.get('name', contact['name'])).strip()[:_MAX_FIELD_LEN]
            contact['email'] = new_email
            contact['role'] = str(contact_data.get('role', contact.get('role', ''))).strip()[:_MAX_FIELD_LEN]
            contact['area'] = str(contact_data.get('area', contact.get('area', ''))).strip()[:_MAX_FIELD_LEN]
            contact['company'] = str(contact_data.get('company', contact.get('company', ''))).strip()[:_MAX_FIELD_LEN]
            contact['phone'] = str(contact_data.get('phone', contact.get('phone', ''))).strip()[:50]
            contact['slack'] = str(contact_data.get('slack', contact.get('slack', ''))).strip()[:_MAX_FIELD_LEN]
            contact['notes'] = str(contact_data.get('notes', contact.get('notes', ''))).strip()[:_MAX_FIELD_LEN]
            save_data(data)
            return jsonify(contact)

    return jsonify({'error': 'Contact not found'}), 404


@settings_blueprint.route('/api/contacts/<contact_id>', methods=['DELETE'])
def delete_master_contact(contact_id):
    data = load_data()
    if 'master_contacts' not in data:
        return jsonify({'error': 'No contacts found'}), 404

    data['master_contacts'] = [c for c in data['master_contacts'] if str(c['id']) != str(contact_id)]
    save_data(data)
    return jsonify({'message': 'Contact deleted'})
