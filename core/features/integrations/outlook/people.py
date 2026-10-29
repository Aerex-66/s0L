"""
People lookups through the Outlook app on this computer. As a person types a name, s0L shows
who Outlook thinks it is, each with an email so there's no doubt: Outlook's own autocomplete
list first (the people this person writes to), then the directory's match. Outlook does the
searching over its own connection; s0L only reads, and never starts Outlook to do it.
"""
import re
import struct
import time

_INBOX = 6
_BY_MESSAGE_CLASS = 2
_AUTOCOMPLETE_CLASS = 'IPM.Configuration.Autocomplete'
_ROAMING_BINARY = 'http://schemas.microsoft.com/mapi/proptag/0x7C090102'
_MAGIC = 0xBAADF00D
_CACHE_SECONDS = 600
_SINGLE_NAME = 6  # olDefaultSingleName: Outlook's address book picking one person

# Autocomplete row properties (tag = id << 16 | type)
_DISPLAY_NAME = 0x3001001F
_ADDRESS_TYPE = 0x3002001F
_EMAIL = 0x3003001F
_SMTP = 0x39FE001F
_WEIGHT = 0x60040003

_FIXED_SIZES = {0x0002: 2, 0x0003: 4, 0x0004: 4, 0x0005: 8, 0x0006: 8, 0x0007: 8, 0x000A: 4,
                0x000B: 2, 0x0014: 8, 0x0040: 8}
_VARIABLE = {0x001E, 0x001F, 0x0102}
_GUID = 0x0048
_MULTI = 0x1000

# Address entry kinds that are people
_EXCHANGE_USERS = {0, 5}  # olExchangeUserAddressEntry, olExchangeRemoteUserAddressEntry
_OUTLOOK_CONTACT = 10
_SMTP_ADDRESS = 30

MAX_QUERY = 120
MAX_PEOPLE = 8

_cache = {'at': None, 'people': []}
_details_cache = {}
_MAX_DETAILS = 1000


def _text(raw, kind):
    if kind == 0x001F:
        return raw.decode('utf-16-le', errors='ignore').rstrip('\x00')
    return raw.decode('cp1252', errors='ignore').rstrip('\x00')


def parse_autocomplete(stream):
    """The people in Outlook's autocomplete list, [{name, email, weight}]; whatever can't be read is left out."""
    data = bytes(stream or b'')
    people = []

    def skip(at, size):
        if at + size > len(data):
            raise ValueError('the list stops mid-row')
        return at + size

    try:
        magic, _major, _minor, rows = struct.unpack_from('<IIII', data, 0)
        if magic != _MAGIC:
            return []
        at = 16
        for _ in range(rows):
            (count,) = struct.unpack_from('<I', data, at)
            at += 4
            values = {}
            for _ in range(count):
                tag, _reserved = struct.unpack_from('<II', data, at)
                union = data[at + 8:at + 16]
                at = skip(at, 16)
                kind = tag & 0xFFFF
                if kind in _VARIABLE:
                    (size,) = struct.unpack_from('<I', data, at)
                    values[tag] = data[at + 4:at + 4 + size]
                    at = skip(at, 4 + size)
                elif kind == _GUID:
                    at = skip(at, 16)
                elif kind & _MULTI:
                    base = kind & ~_MULTI
                    (items,) = struct.unpack_from('<I', data, at)
                    at += 4
                    for _ in range(items):
                        if base in _VARIABLE:
                            (size,) = struct.unpack_from('<I', data, at)
                            at = skip(at, 4 + size)
                        elif base == _GUID:
                            at = skip(at, 16)
                        elif base in _FIXED_SIZES:
                            at = skip(at, _FIXED_SIZES[base])
                        else:
                            raise ValueError(f'unknown multi-valued type {base:#06x}')
                elif kind in _FIXED_SIZES:
                    values[tag] = union
                else:
                    raise ValueError(f'unknown property type {kind:#06x}')
            name = _text(values.get(_DISPLAY_NAME, b''), 0x001F).strip()
            email = _text(values.get(_SMTP, b''), 0x001F).strip()
            if not email and _text(values.get(_ADDRESS_TYPE, b''), 0x001F).upper() == 'SMTP':
                email = _text(values.get(_EMAIL, b''), 0x001F).strip()
            weight = struct.unpack('<i', values[_WEIGHT][:4])[0] if _WEIGHT in values else 0
            if '@' in email:
                people.append({'name': name or email, 'email': email, 'weight': weight})
    except (struct.error, ValueError):
        pass  # a format this reader doesn't know: keep the rows read so far
    return people


def _person(name, email, **details):
    email = ' '.join(str(email or '').split())
    if '@' not in email:
        return None
    person = {'name': ' '.join(str(name or '').split()) or email, 'email': email}
    for key, value in details.items():
        person[key] = ' '.join(str(value or '').split())
    return person


def person_from_entry(entry):
    """A person (name, email, title, department, company, phone) from an Outlook address entry; None for lists and rooms."""
    kind = entry.AddressEntryUserType
    if kind in _EXCHANGE_USERS:
        user = entry.GetExchangeUser()
        if user is None:
            return None
        return _person(user.Name, user.PrimarySmtpAddress, title=user.JobTitle, department=user.Department,
                       company=user.CompanyName, phone=user.BusinessTelephoneNumber or user.MobileTelephoneNumber)
    if kind == _OUTLOOK_CONTACT:
        contact = entry.GetContact()
        if contact is None:
            return None
        return _person(contact.FullName or entry.Name, contact.Email1Address, title=contact.JobTitle,
                       department=contact.Department, company=contact.CompanyName,
                       phone=contact.BusinessTelephoneNumber or contact.MobileTelephoneNumber)
    if kind == _SMTP_ADDRESS:
        return _person(entry.Name, entry.Address)
    return None


def _words(text):
    return [word for word in re.split(r'[\s.@_,()/-]+', text.lower()) if word]


def matches(person, query):
    """Every word typed starts a word of the person's name or email, as in Outlook's own suggestions."""
    words = _words(f"{person['name']} {person['email']}")
    return all(any(word.startswith(typed) for word in words) for typed in _words(query))


def _autocomplete(session):
    now = time.monotonic()
    if _cache['at'] is not None and now - _cache['at'] < _CACHE_SECONDS:
        return _cache['people']
    try:
        storage = session.GetDefaultFolder(_INBOX).GetStorage(_AUTOCOMPLETE_CLASS, _BY_MESSAGE_CLASS)
        people = parse_autocomplete(storage.PropertyAccessor.GetProperty(_ROAMING_BINARY))
    except Exception:  # Outlook's refusals arrive as COM errors: no list, the directory still answers
        people = []
    _cache.update(at=now, people=people)
    return people


def _resolved(session, text):
    """The one directory entry Outlook resolves the whole text to (a unique name, alias or address)."""
    try:
        recipient = session.CreateRecipient(text)
        return person_from_entry(recipient.AddressEntry) if recipient.Resolve() else None
    except Exception:
        return None


def _nearest(session, text):
    """The address book's nearest name, kept only when it starts with what was typed."""
    try:
        entry = session.GetGlobalAddressList().AddressEntries.Item(text)
        if entry is None or not str(entry.Name or '').lower().startswith(text.lower()):
            return None
        return person_from_entry(entry)
    except Exception:
        return None


def _details(session, email):
    """The directory's title, department, company and phone for an address, looked up once."""
    key = email.lower()
    if key not in _details_cache:
        if len(_details_cache) >= _MAX_DETAILS:
            _details_cache.clear()
        found = _resolved(session, email) or {}
        _details_cache[key] = {field: value for field, value in found.items() if field not in ('name', 'email')}
    return _details_cache[key]


def suggest(session, query, limit=MAX_PEOPLE):
    """Who Outlook thinks the typed text is: recent people first, then the directory; one row per address."""
    text = ' '.join(str(query or '').split())[:MAX_QUERY]
    if len(text) < 2:
        return []
    recent = [person for person in _autocomplete(session) if matches(person, text)]
    recent.sort(key=lambda person: (not person['name'].lower().startswith(text.lower()), -person['weight'],
                                    person['name'].lower()))
    found, seen = [], set()

    def add(person, source):
        if person and person['email'].lower() not in seen and len(found) < limit:
            seen.add(person['email'].lower())
            found.append({**{key: value for key, value in person.items() if key != 'weight'}, 'source': source})

    for person in recent[:limit]:
        add({**person, **_details(session, person['email'])}, 'recent')
    add(_resolved(session, text), 'directory')
    add(_nearest(session, text), 'directory')
    return found


def pick(session):
    """Outlook's own address book, to pick one person; None when the person closes it without choosing."""
    dialog = session.GetSelectNamesDialog()
    dialog.SetDefaultDisplayMode(_SINGLE_NAME)
    dialog.Caption = 'Pick a person for s0L'
    if not dialog.Display():
        return None
    recipients = dialog.Recipients
    for index in range(1, recipients.Count + 1):
        recipient = recipients.Item(index)
        recipient.Resolve()
        person = person_from_entry(recipient.AddressEntry) if recipient.AddressEntry is not None else None
        if person:
            return person
    return None
