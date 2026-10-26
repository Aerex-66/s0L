"""
Deal services — business logic for deal creation, activity initialization,
and cascade cleanup. Route handlers in deals.py stay thin and call these.
"""
import os
import shutil
from datetime import datetime

from deal_structure import ACTIVITY_CATEGORIES
from core.shared.state import load_data, DOCUMENTS_ROOT
from core.features.deals.writes import apply_deal_write


def cleanup_deal_documents(deal):
    """Remove document files and rendered slides for a deal from disk."""
    for doc in deal.get('documents', []):
        stored = doc.get('stored_path', '')
        if stored and os.path.isfile(stored):
            try:
                os.remove(stored)
            except OSError as e:
                print(f"Failed to remove document file {stored}: {e}")
        doc_id = doc.get('id', '')
        if doc_id:
            slides_dir = os.path.join(DOCUMENTS_ROOT, f'{doc_id}_slides')
            if os.path.isdir(slides_dir):
                shutil.rmtree(slides_dir, ignore_errors=True)


def get_activities_with_defaults():
    """Build the initial activity list for a new deal, resolving SAL/PAL
    approvers from the master contact directory. Returns (activities,
    auto_contacts) where auto_contacts are directory entries to attach
    to the deal."""
    data = load_data()
    defaults = data.get('default_approvers', {})
    directory = data.get('master_contacts', [])
    # Index directory by approver_key for contact_id lookup
    dir_by_key = {c['approver_key']: c for c in directory if c.get('approver_key')}

    activities = []
    auto_contacts = []  # contacts to auto-add to the deal
    seen_contact_ids = set()
    act_id = 0
    for category_data in ACTIVITY_CATEGORIES.values():
        for activity in category_data.get('activities', []):
            act = dict(activity)
            act_id += 1

            owner_type = activity.get('owner_type', '')
            if owner_type in ['SAL', 'PAL']:
                area = activity.get('area', '')
                key = f"{area.replace('/', '_').replace('&', '')}_{owner_type}"
                approver_info = defaults.get(key, {})
                act['reviewer_approver'] = approver_info.get('name', '') if isinstance(approver_info, dict) else approver_info
                act['owner'] = f"{area} {owner_type}"
                # Link to directory contact
                dir_entry = dir_by_key.get(key)
                if dir_entry and dir_entry.get('name', '').strip():
                    act['contact_id'] = dir_entry['id']
                    if dir_entry['id'] not in seen_contact_ids:
                        seen_contact_ids.add(dir_entry['id'])
                        auto_contacts.append({
                            'name': dir_entry.get('name', ''),
                            'email': dir_entry.get('email', ''),
                            'role': f"{area} {owner_type}",
                            'company': dir_entry.get('company', ''),
                            'phone': dir_entry.get('phone', ''),
                            'notes': '',
                            'source_id': dir_entry['id'],
                        })
            else:
                act['reviewer_approver'] = ''
                act['owner'] = ''

            act['id'] = act_id
            act['activity'] = activity['name']
            act['date'] = ''
            act['status'] = 'Not Started'
            act['comments'] = ''
            activities.append(act)

    return activities, auto_contacts


def build_new_deal(deal_id, changes):
    """Assemble a new deal from validated write changes (see writes.py),
    with initialized activities and auto-populated contacts."""
    activities, auto_contacts = get_activities_with_defaults()
    for i, c in enumerate(auto_contacts, 1):
        c['id'] = i

    deal = {
        'id': deal_id,
        'status': 'Active',
        'created_date': datetime.now().isoformat(),
        'activities': activities,
        'timelines': [],
        'contacts': auto_contacts,
        'resources': {},
        'financials': {},
    }
    apply_deal_write(deal, changes)
    for key in ('opportunity_number', 'client_name', 'project_name'):
        deal[key] = str(deal.get(key, '')).strip()
    return deal
