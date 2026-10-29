"""
Quick contacts: the people directory and the SRR/PRR review forms, global reference
data in deals_data.json next to the deals. One entry per person; a person holds roles
(Deal Team, SAL, SLDL, SRR or PRR reviewer). Review forms are kept per sector.
"""
import re
from urllib.parse import urlparse

from deal_structure import ACTIVITY_CATEGORIES

KINDS = ('deal_team', 'sal', 'sldl', 'srr', 'prr')
REVIEW_KINDS = ('srr', 'prr')
HOWS = ('', 'form', 'word', 'invite', 'none')
PAL_TITLE = 'PAL (functional SME)'
PERSON_FIELDS = ('name', 'email', 'title', 'department', 'company', 'phone', 'slack', 'notes')
_ROLE_KEYS = {'deal_team': ('title', 'area'), 'sal': ('area',), 'sldl': ('area',), 'srr': ('sector',), 'prr': ('sector',)}
_LEGACY_KEYS = ('role', 'area', 'approver_key')
_EMAIL = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
_MAX = 500
_MAX_DETAIL = 100
_MAX_URL = 2000


class DirectoryError(ValueError):
    """A person, role or review form that can't be stored as given."""


def _text(value, limit=_MAX):
    return ' '.join(str(value or '').split())[:limit]


def _fold(value):
    return _text(value).casefold()


def sal_areas():
    """The service areas new deals get a SAL row for, in deal_structure order."""
    rows = ACTIVITY_CATEGORIES['service_area_approvals']['activities']
    return [row['area'] for row in rows if row.get('owner_type') == 'SAL']


def area_key(area):
    return re.sub(r'[\s_/&]+', '', str(area or '')).casefold()


def _canonical_area(area):
    """The service area as deal_structure spells it; old keys wrote PTP_Ariba, FTPL, Group_Reporting."""
    return next((known for known in sal_areas() if area_key(known) == area_key(area)), area)


def clean_role(raw):
    if not isinstance(raw, dict):
        raise DirectoryError('Each role must be an object')
    kind = raw.get('kind')
    if kind not in KINDS:
        raise DirectoryError(f'Unknown role: {kind!r}')
    role = {'kind': kind}
    for key in _ROLE_KEYS[kind]:
        value = _text(raw.get(key), _MAX_DETAIL)
        if value:
            role[key] = value
    if kind == 'sal':
        if not role.get('area'):
            raise DirectoryError('A SAL needs a service area')
        role['area'] = _canonical_area(role['area'])
    if kind in REVIEW_KINDS and not role.get('sector'):
        raise DirectoryError(f'An {kind.upper()} reviewer needs a sector')
    return role


def _role_key(role):
    return tuple(sorted((key, str(value).casefold()) for key, value in role.items()))


def _unique(roles):
    seen, out = set(), []
    for role in roles:
        if _role_key(role) not in seen:
            seen.add(_role_key(role))
            out.append(role)
    return out


def clean_person(payload, partial=False):
    """Checked person fields from a request body; with partial, only the fields sent."""
    if not isinstance(payload, dict):
        raise DirectoryError('Expected a JSON object')
    person = {}
    for field in PERSON_FIELDS:
        if partial and field not in payload:
            continue
        person[field] = _text(payload.get(field), 50 if field == 'phone' else _MAX)
    if 'name' in person and not person['name']:
        raise DirectoryError('Name is required')
    email = person.get('email', '')
    if email and not _EMAIL.match(email):
        raise DirectoryError('Invalid email format')
    if not partial or 'roles' in payload:
        roles = payload.get('roles') or []
        if not isinstance(roles, list):
            raise DirectoryError('roles must be a list')
        person['roles'] = _unique([clean_role(role) for role in roles])
    return person


def same_person(people, name, email):
    """The stored person this is: the same email, or the same name when either has no email."""
    email = _fold(email)
    if email:
        match = next((p for p in people if _fold(p.get('email')) == email), None)
        if match:
            return match
    name = _fold(name)
    return next((p for p in people if _fold(p.get('name')) == name and not (email and p.get('email'))), None)


def merge_into(person, incoming):
    """Add incoming's roles to the person and fill the person's blanks; True when anything changed."""
    changed = False
    for field in PERSON_FIELDS:
        if incoming.get(field) and not person.get(field):
            person[field] = incoming[field]
            changed = True
    roles = person.setdefault('roles', [])
    seen = {_role_key(role) for role in roles}
    for role in incoming.get('roles', []):
        if _role_key(role) not in seen:
            roles.append(role)
            seen.add(_role_key(role))
            changed = True
    return changed


def _legacy_role(entry):
    role, area = _text(entry.get('role'), _MAX_DETAIL), _text(entry.get('area'), _MAX_DETAIL)
    kind = role.upper()
    if kind == 'SAL' and area:
        return {'kind': 'sal', 'area': _canonical_area(area)}
    if kind == 'SLDL':
        return {'kind': 'sldl', **({'area': area} if area else {})}
    title = PAL_TITLE if kind == 'PAL' else role
    return {'kind': 'deal_team', **({'title': title} if title else {}), **({'area': area} if area else {})}


def _people_from_legacy(entry):
    """An old one-role entry as people: 'A / B' without an email is two people sharing the role."""
    fields = {field: _text(entry.get(field), 50 if field == 'phone' else _MAX) for field in PERSON_FIELDS}
    if not fields['name']:
        fields['name'] = fields['email']
    if not fields['name']:
        return []
    names = [fields['name']]
    if not fields['email'] and '/' in fields['name']:
        names = [name for name in (_text(part) for part in fields['name'].split('/')) if name] or names
    role = _legacy_role(entry)
    return [{'id': str(entry.get('id', '')), **fields, 'name': name, 'roles': [dict(role)]} for name in names]


def _repair_sal_areas(people):
    """Spell every SAL area as deal_structure does, dropping a role that becomes a duplicate."""
    changed = False
    for person in people:
        roles = person.get('roles') or []
        for role in roles:
            if role.get('kind') == 'sal' and role.get('area') and _canonical_area(role['area']) != role['area']:
                role['area'] = _canonical_area(role['area'])
                changed = True
        unique = _unique(roles)
        if len(unique) != len(roles):
            person['roles'] = unique
            changed = True
    return changed


def migrate_directory(data):
    """Bring master_contacts onto one entry per person with roles; False when already current."""
    entries = data.get('master_contacts')
    if not isinstance(entries, list):
        return False
    if all(isinstance(entry, dict) and isinstance(entry.get('roles'), list) for entry in entries):
        return _repair_sal_areas(entries)
    next_id = max((int(e['id']) for e in entries if isinstance(e, dict) and str(e.get('id', '')).isdigit()), default=0)
    people = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if isinstance(entry.get('roles'), list):
            found = [{key: value for key, value in entry.items() if key not in _LEGACY_KEYS}]
        else:
            found = _people_from_legacy(entry)
        for person in found:
            existing = same_person(people, person['name'], person.get('email'))
            if existing:
                merge_into(existing, person)
                continue
            if not person.get('id') or any(p['id'] == person['id'] for p in people):
                next_id += 1
                person['id'] = str(next_id)
            people.append(person)
    data['master_contacts'] = people
    return True


def sal_people(people):
    """Service area (as area_key) → the people who are its SAL, in directory order."""
    by_area = {}
    for person in people:
        for role in person.get('roles') or []:
            if role.get('kind') == 'sal' and role.get('area'):
                by_area.setdefault(area_key(role['area']), []).append(person)
    return by_area


def split_sectors(value):
    """A deal's sectors: the board writes several as 'Distribution, Canada'."""
    return [part for part in (_text(piece, _MAX_DETAIL) for piece in str(value or '').split(',')) if part]


def sectors(data):
    """Every sector on a deal, or with a review form or reviewer recorded, A to Z."""
    found = {}
    for deal in data.get('deals', []):
        for sector in split_sectors(deal.get('sector')):
            found.setdefault(sector.casefold(), sector)
    for slots in review_forms(data).values():
        for sector in slots:
            found.setdefault(sector.casefold(), sector)
    for person in data.get('master_contacts', []):
        for role in person.get('roles') or []:
            if role.get('kind') in REVIEW_KINDS and role.get('sector'):
                found.setdefault(role['sector'].casefold(), role['sector'])
    return sorted(found.values(), key=str.casefold)


def review_forms(data):
    forms = data.get('review_forms') or {}
    return {kind: dict(forms.get(kind) or {}) for kind in REVIEW_KINDS}


def _is_web_link(url):
    parsed = urlparse(url)
    return parsed.scheme in ('http', 'https') and bool(parsed.netloc) and not any(c.isspace() for c in url)


def clean_review_form(payload):
    """(kind, sector, entry) from a request body; the link must be a web address."""
    if not isinstance(payload, dict):
        raise DirectoryError('Expected a JSON object')
    kind = payload.get('kind')
    if kind not in REVIEW_KINDS:
        raise DirectoryError('kind must be "srr" or "prr"')
    sector = _text(payload.get('sector'), _MAX_DETAIL)
    if not sector:
        raise DirectoryError('A sector is required')
    how = payload.get('how') or ''
    if how not in HOWS:
        raise DirectoryError(f'Unknown review type: {how!r}')
    url = str(payload.get('url') or '').strip()
    if url and (len(url) > _MAX_URL or not _is_web_link(url)):
        raise DirectoryError('The link must be a web address starting with https:// or http://')
    return kind, sector, {'how': how, 'url': url, 'note': _text(payload.get('note'))}


def save_review_form(data, kind, sector, entry):
    """Store one sector's form (an empty one is removed); returns every review form."""
    slots = data.setdefault('review_forms', {}).setdefault(kind, {})
    key = next((stored for stored in slots if stored.casefold() == sector.casefold()), sector)
    if any(entry.values()):
        slots[key] = entry
    else:
        slots.pop(key, None)
    return review_forms(data)


def quick_contacts(data):
    """What Outlook → Quick contacts and a deal's review forms need, in one read."""
    people = data.get('master_contacts', [])
    areas = sal_areas()
    known = {area.casefold() for area in areas}
    for person in people:
        for role in person.get('roles') or []:
            area = role.get('area') if role.get('kind') == 'sal' else None
            if area and area.casefold() not in known:
                known.add(area.casefold())
                areas.append(area)
    return {'people': people, 'sal_areas': areas, 'sectors': sectors(data), 'review_forms': review_forms(data)}
