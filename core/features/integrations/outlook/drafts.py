"""
Real Outlook emails and meeting invites, opened (never sent) in the classic Outlook
app for the person to check and send. Attachments are only the named deal's own
stored documents, copied under their real names for Outlook and removed afterwards.
"""
import contextlib
import html
import os
import re
import shutil
import tempfile
from datetime import datetime

from core.shared import state
from core.shared.state import get_deal_by_id

MAX_RECIPIENTS = 100
MAX_SUBJECT = 500
MAX_LOCATION = 255
MAX_BODY = 100_000
MAX_ATTACHMENTS = 20

_OL_MAIL_ITEM = 0
_OL_APPOINTMENT_ITEM = 1
_OL_MEETING = 1
_EMAIL = re.compile(r'^[^\s@;,<>"]+@[^\s@;,<>"]+\.[^\s@;,<>"]+$')
_BODY_TAG = re.compile(r'<body\b[^>]*>', re.IGNORECASE)
_UNSAFE_NAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


class DraftError(Exception):
    def __init__(self, message, status=400, kind='invalid'):
        super().__init__(message)
        self.status = status
        self.kind = kind


def clean_addresses(values, field):
    if values is None:
        return []
    if not isinstance(values, list):
        raise DraftError(f'{field} must be a list of email addresses.')
    cleaned = []
    for value in values:
        address = str(value or '').strip()
        if not _EMAIL.match(address):
            raise DraftError(f'{address or "An empty value"} is not an email address.')
        if address.lower() not in {known.lower() for known in cleaned}:
            cleaned.append(address)
    return cleaned


def check_recipients(*lists):
    if sum(len(found) for found in lists) > MAX_RECIPIENTS:
        raise DraftError(f'At most {MAX_RECIPIENTS} recipients.')


def clean_text(value, what, limit):
    text = '' if value is None else str(value)
    if len(text) > limit:
        raise DraftError(f'{what} is too long (at most {limit:,} characters).')
    return text


def local_time(value, what):
    """A local date and time as the composer sends it: YYYY-MM-DDTHH:MM (seconds allowed)."""
    for pattern in ('%Y-%m-%dT%H:%M', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(str(value or ''), pattern)
        except ValueError:
            continue
    raise DraftError(f'{what} must be a date and time like 2026-10-29T10:00.')


def _inside(root, path):
    try:
        return os.path.commonpath([root, path]) == root and path != root
    except ValueError:  # another drive
        return False


def resolve_attachments(data, deal_id, ids):
    """[(stored path, document name)] for the deal's own documents; a DraftError names anything else."""
    if not ids:
        return []
    if not isinstance(ids, list):
        raise DraftError('attachments must be a list of document ids.')
    if len(ids) > MAX_ATTACHMENTS:
        raise DraftError(f'At most {MAX_ATTACHMENTS} attachments.')
    deal = get_deal_by_id(data, deal_id) if deal_id else None
    if deal is None:
        raise DraftError('Attachments need the deal they belong to.')
    documents = {str(doc.get('id')): doc for doc in deal.get('documents') or []}
    root = os.path.realpath(state.DOCUMENTS_ROOT)
    files = []
    for doc_id in ids:
        doc = documents.get(str(doc_id))
        if doc is None:
            raise DraftError(f"Document {doc_id} isn't one of this deal's documents.")
        name = str(doc.get('name') or 'document')
        path = os.path.realpath(str(doc.get('stored_path') or ''))
        if not _inside(root, path):
            raise DraftError(f"{name} isn't stored in s0L's documents folder.")
        if not os.path.isfile(path):
            raise DraftError(f"{name} is missing from s0L's documents folder.")
        files.append((path, name))
    return files


def _file_name(name):
    cleaned = _UNSAFE_NAME.sub('_', name).strip().rstrip('. ')
    return cleaned or 'document'


@contextlib.contextmanager
def attachment_copies(files):
    """Copies named as the documents (stored files carry a token prefix), deleted once Outlook has taken them."""
    folder = tempfile.mkdtemp(prefix='s0l-outlook-')
    try:
        paths = []
        for index, (path, name) in enumerate(files):
            target = os.path.join(folder, str(index), _file_name(name))
            os.makedirs(os.path.dirname(target))
            try:
                shutil.copyfile(path, target)
            except OSError:
                raise DraftError(f'Could not copy {name} for Outlook.', 500, 'attachments') from None
            paths.append(target)
        yield paths
    finally:
        shutil.rmtree(folder, ignore_errors=True)


def text_to_html(text):
    lines = html.escape(text).replace('\r\n', '\n').replace('\n', '<br>\n')
    return f'<div style="font-family: Aptos, Calibri, Arial, sans-serif; font-size: 11pt;">{lines}</div>'


def _above_signature(block, current):
    match = _BODY_TAG.search(current or '')
    if not match:
        return block + (current or '')
    return current[:match.end()] + block + current[match.end():]


def _bring_forward(item):
    try:
        item.GetInspector.Activate()
    except Exception:  # Windows may keep the browser in front; the draft is still open
        pass


def open_email(app, *, to, cc, subject, body, files):
    item = app.CreateItem(_OL_MAIL_ITEM)
    if to:
        item.To = '; '.join(to)
    if cc:
        item.CC = '; '.join(cc)
    item.Subject = subject
    for path in files:
        item.Attachments.Add(path)
    item.Display()
    if body:
        try:
            item.HTMLBody = _above_signature(text_to_html(body), item.HTMLBody)
        except Exception:  # Outlook's programmatic-access guard may refuse the read; lose the signature, keep the text
            item.Body = body
    _bring_forward(item)


def open_invite(app, *, attendees, subject, start, end, location, body, files):
    item = app.CreateItem(_OL_APPOINTMENT_ITEM)
    item.MeetingStatus = _OL_MEETING
    if attendees:
        item.RequiredAttendees = '; '.join(attendees)
    item.Subject = subject
    item.Start = start
    item.End = end
    if location:
        item.Location = location
    if body:
        item.Body = body
    for path in files:
        item.Attachments.Add(path)
    item.Display()
    _bring_forward(item)
