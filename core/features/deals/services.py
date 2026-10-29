"""
Deal services — business logic for deal creation, activity initialization,
and cascade cleanup. Route handlers in deals.py stay thin and call these.
"""
import os
import shutil
from datetime import datetime

from deal_structure import ACTIVITY_CATEGORIES
from core.shared.directory import area_key, sal_people
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


def get_activities_with_defaults(data=None):
    """Build the initial activity list for a new deal; each SAL row names its
    service area's SALs from the directory (Quick contacts). Returns (activities,
    auto_contacts) where auto_contacts are those SALs, to attach to the deal.
    Pass `data` when the store is already loaded."""
    data = data if data is not None else load_data()
    by_area = sal_people(data.get('master_contacts', []))

    activities = []
    areas_of = {}  # person id -> (person, the areas they lead), in first-seen order
    act_id = 0
    for category_data in ACTIVITY_CATEGORIES.values():
        for activity in category_data.get('activities', []):
            act = dict(activity)
            act_id += 1
            act['reviewer_approver'] = ''
            act['owner'] = ''

            if activity.get('owner_type') == 'SAL':
                area = activity.get('area', '')
                people = by_area.get(area_key(area), [])
                act['owner'] = f'{area} SAL'
                act['reviewer_approver'] = ' / '.join(person['name'] for person in people)
                if people:
                    act['contact_id'] = people[0]['id']
                for person in people:
                    areas_of.setdefault(person['id'], (person, []))[1].append(area)

            act['id'] = act_id
            act['activity'] = activity['name']
            act['date'] = ''
            act['status'] = 'Not Started'
            act['comments'] = ''
            activities.append(act)

    auto_contacts = [{
        'name': person.get('name', ''),
        'email': person.get('email', ''),
        'role': f"{', '.join(areas)} SAL",
        'company': person.get('company', ''),
        'phone': person.get('phone', ''),
        'notes': '',
        'source_id': person['id'],
    } for person, areas in areas_of.values()]
    return activities, auto_contacts


def build_new_deal(deal_id, changes, data=None):
    """Assemble a new deal from validated write changes (see writes.py),
    with initialized activities and auto-populated contacts."""
    activities, auto_contacts = get_activities_with_defaults(data)
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
