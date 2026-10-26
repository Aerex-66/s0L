"""
Deals blueprint — thin HTTP routes for deal CRUD and nested resources.
Business logic lives in services.py; every write is validated against
shared/field_index.json by writes.py (unknown fields 400, foreign-owned 409).
"""
from flask import Blueprint, jsonify, request

from core.shared.state import load_data, next_string_id, save_data, get_deal_by_id
from core.shared.field_index import RECORDS, canonical_key, owner_of, required_keys
from core.features.deals.services import (
    build_new_deal,
    cleanup_deal_documents,
)
from core.features.deals.writes import apply_deal_write, prepare_deal_write

deals_blueprint = Blueprint('deals', __name__)

# Client routes write deal-owned fields only; GSSM values arrive through /gssm-sync.
_DEAL_WRITERS = {'deal'}
_ACTIVITY_FIELDS = frozenset(RECORDS['activity']['mutable'])
_CONTACT_FIELDS = tuple(RECORDS['contact']['fields'])


def _missing_required(changes):
    return [f for f in required_keys() if not str(changes.get(f) or '').strip()]


@deals_blueprint.route('/api/deals', methods=['GET'])
def get_deals():
    data = load_data()
    return jsonify(data['deals'])


@deals_blueprint.route('/api/deals', methods=['POST'])
def create_deal():
    data = load_data()
    deal_data = request.json or {}

    changes, error = prepare_deal_write({}, deal_data, owners={'deal'})
    if error:
        return jsonify({'error': error[1]}), error[0]

    missing = _missing_required(changes)
    if missing:
        return jsonify({'error': f'Missing required fields: {", ".join(missing)}'}), 400

    opp_num = str(changes.get('opportunity_number', '')).strip()
    if opp_num and any(d.get('opportunity_number') == opp_num for d in data['deals']):
        return jsonify({'error': f'Opportunity number {opp_num} already exists'}), 409

    new_deal = build_new_deal(next_string_id(data['deals']), changes)

    data['deals'].append(new_deal)
    save_data(data)
    return jsonify(new_deal)


@deals_blueprint.route('/api/deals/<deal_id>', methods=['GET'])
def get_deal(deal_id):
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if deal:
        return jsonify(deal)
    return jsonify({'error': 'Deal not found'}), 404


@deals_blueprint.route('/api/deals/<deal_id>', methods=['PUT'])
def update_deal(deal_id):
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if not deal:
        return jsonify({'error': 'Deal not found'}), 404

    payload = request.json or {}
    changes, error = prepare_deal_write(deal, payload, owners=_DEAL_WRITERS)
    if error:
        return jsonify({'error': error[1]}), error[0]

    # Prevent duplicate opportunity numbers
    new_opp = str(changes.get('opportunity_number', '')).strip()
    if new_opp and new_opp != deal.get('opportunity_number', ''):
        if any(d.get('opportunity_number') == new_opp for d in data['deals'] if str(d['id']) != str(deal_id)):
            return jsonify({'error': f'Opportunity number {new_opp} already exists'}), 409

    apply_deal_write(deal, changes)
    save_data(data)
    return jsonify(deal)


@deals_blueprint.route('/api/deals/<deal_id>/gssm-sync', methods=['PUT'])
def gssm_sync(deal_id):
    """The only writer of GSSM-owned fields. The GSSM part of financials is
    replaced as a whole (a cleared cell clears the deal); deal-owned values stay."""
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if not deal:
        return jsonify({'error': 'Deal not found'}), 404

    changes, error = prepare_deal_write(deal, request.json or {}, owners={'gssm'})
    if error:
        return jsonify({'error': error[1]}), error[0]

    if 'financials' in changes:
        current = deal.get('financials') if isinstance(deal.get('financials'), dict) else {}
        kept = {k: v for k, v in current.items() if owner_of(canonical_key(k)) != 'gssm'}
        deal['financials'] = {**kept, **changes.pop('financials')}
    apply_deal_write(deal, changes)
    save_data(data)
    return jsonify(deal)


@deals_blueprint.route('/api/deals/<deal_id>', methods=['DELETE'])
def delete_deal(deal_id):
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if not deal:
        return jsonify({'error': 'Deal not found'}), 404

    # Cascade: remove document files from disk
    cleanup_deal_documents(deal)

    data['deals'] = [d for d in data['deals'] if str(d['id']) != str(deal_id)]
    save_data(data)
    return jsonify({'success': True})


@deals_blueprint.route('/api/deals/bulk', methods=['POST'])
def bulk_create_deals():
    data = load_data()
    bulk_data = request.json or {}
    deals_to_create = bulk_data.get('deals', [])

    created = []
    failed = 0
    errors = []
    next_id = int(next_string_id(data['deals']))
    existing_opps = {d.get('opportunity_number') for d in data['deals'] if d.get('opportunity_number')}

    for idx, deal_data in enumerate(deals_to_create):
        try:
            changes, error = prepare_deal_write({}, deal_data, owners={'deal'})
            if error:
                errors.append(f'Row {idx + 1}: {error[1]}')
                failed += 1
                continue

            missing = _missing_required(changes)
            if missing:
                errors.append(f'Row {idx + 1}: missing {missing}')
                failed += 1
                continue

            opp_num = str(changes.get('opportunity_number', '')).strip()
            if opp_num in existing_opps:
                errors.append(f'Row {idx + 1}: duplicate opportunity_number {opp_num}')
                failed += 1
                continue
            existing_opps.add(opp_num)

            created.append(build_new_deal(str(next_id), changes))
            next_id += 1
        except Exception as error:
            print(f'Error creating deal: {error}')
            failed += 1

    data['deals'].extend(created)
    save_data(data)

    return jsonify({
        'created': len(created),
        'failed': failed,
        'total': len(deals_to_create),
        'errors': errors[:20],
    })


@deals_blueprint.route('/api/deals/bulk/delete', methods=['POST'])
def bulk_delete_deals():
    data = load_data()
    deal_ids = {str(deal_id) for deal_id in (request.json or {}).get('ids', [])}

    to_delete = [d for d in data['deals'] if str(d.get('id')) in deal_ids]
    for deal in to_delete:
        cleanup_deal_documents(deal)

    original_count = len(data['deals'])
    data['deals'] = [d for d in data['deals'] if str(d.get('id')) not in deal_ids]
    deleted = original_count - len(data['deals'])

    save_data(data)
    return jsonify({'deleted': deleted})


@deals_blueprint.route('/api/deals/<deal_id>/activities/<int:activity_id>', methods=['PUT'])
def update_activity(deal_id, activity_id):
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if deal:
        activity = next((a for a in deal.get('activities', []) if a.get('id') == activity_id), None)
        if activity:
            payload = request.json or {}
            filtered = {k: v for k, v in payload.items() if k in _ACTIVITY_FIELDS}
            activity.update(filtered)
            save_data(data)
            return jsonify(activity)
    return jsonify({'error': 'Not found'}), 404


@deals_blueprint.route('/api/deals/<deal_id>/contacts', methods=['POST'])
def add_contact(deal_id):
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if deal:
        contact_data = request.json or {}
        existing_ids = [c.get('id', 0) for c in deal.get('contacts', [])]
        contact_id = max(existing_ids, default=0) + 1
        new_contact = {'id': contact_id, **{f: contact_data.get(f, '') for f in _CONTACT_FIELDS}}
        if contact_data.get('source_id'):
            new_contact['source_id'] = contact_data['source_id']
        deal.setdefault('contacts', []).append(new_contact)
        save_data(data)
        return jsonify(new_contact)
    return jsonify({'error': 'Deal not found'}), 404


@deals_blueprint.route('/api/deals/<deal_id>/contacts/<int:contact_id>', methods=['PUT'])
def update_contact(deal_id, contact_id):
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if deal:
        contact = next((c for c in deal.get('contacts', []) if c.get('id') == contact_id), None)
        if contact:
            payload = request.json or {}
            unknown = sorted(k for k in payload if k not in _CONTACT_FIELDS)
            if unknown:
                return jsonify({'error': f'Unknown contact field(s): {", ".join(unknown)}'}), 400
            contact.update(payload)
            save_data(data)
            return jsonify(contact)
    return jsonify({'error': 'Not found'}), 404


@deals_blueprint.route('/api/deals/<deal_id>/contacts/<int:contact_id>', methods=['DELETE'])
def delete_contact(deal_id, contact_id):
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if deal:
        deal['contacts'] = [c for c in deal.get('contacts', []) if c.get('id') != contact_id]
        save_data(data)
        return jsonify({'success': True})
    return jsonify({'error': 'Not found'}), 404


@deals_blueprint.route('/api/deals/<deal_id>/timeline', methods=['PUT'])
def update_timeline(deal_id):
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if not deal:
        return jsonify({'error': 'Deal not found'}), 404
    changes, error = prepare_deal_write(deal, request.json or {}, owners=_DEAL_WRITERS)
    if error:
        return jsonify({'error': error[1]}), error[0]
    apply_deal_write(deal, changes)
    save_data(data)
    return jsonify({'success': True})


@deals_blueprint.route('/api/deals/<deal_id>/financials', methods=['GET', 'PUT'])
def deal_financials(deal_id):
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if deal:
        if request.method == 'GET':
            return jsonify(deal.get('financials', {}))
        changes, error = prepare_deal_write(deal, {'financials': request.json or {}}, owners=_DEAL_WRITERS)
        if error:
            return jsonify({'error': error[1]}), error[0]
        apply_deal_write(deal, changes)
        save_data(data)
        return jsonify({'success': True})
    return jsonify({'error': 'Deal not found'}), 404


@deals_blueprint.route('/api/deals/<deal_id>/resources', methods=['GET', 'PUT'])
def deal_resources(deal_id):
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if deal:
        existing = deal.get('resources')
        existing = existing if isinstance(existing, dict) else {}
        if request.method == 'GET':
            return jsonify(existing)
        payload = request.json or {}
        if not isinstance(payload, dict):
            return jsonify({'error': 'Expected a JSON object'}), 400
        deal['resources'] = {**existing, **payload}
        save_data(data)
        return jsonify({'success': True})
    return jsonify({'error': 'Deal not found'}), 404


@deals_blueprint.route('/api/deals/<deal_id>/isbd', methods=['GET', 'PUT'])
def deal_isbd(deal_id):
    data = load_data()
    deal = get_deal_by_id(data, deal_id)
    if not deal:
        return jsonify({'error': 'Deal not found'}), 404
    if request.method == 'GET':
        return jsonify(deal.get('isbd_data', {}))
    payload = request.json or {}
    if not isinstance(payload, dict):
        return jsonify({'error': 'Expected a JSON object'}), 400
    clean, refused = {}, []
    for raw, value in payload.items():
        key = canonical_key(raw)
        owner = owner_of(key)
        # Table and region data the index doesn't model is still iSBD content.
        if owner in (None, 'isbd') or raw.startswith('_'):
            clean[key] = value
        else:
            refused.append(f'{key} ({owner})')
    if refused:
        return jsonify({'error': f'Field(s) owned by another source: {", ".join(sorted(refused))}'}), 409
    existing = deal.get('isbd_data') if isinstance(deal.get('isbd_data'), dict) else {}
    existing.update(clean)
    deal['isbd_data'] = existing
    save_data(data)
    return jsonify({'success': True, 'field_count': len(existing)})
