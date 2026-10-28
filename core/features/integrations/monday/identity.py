"""
Who the signed-in person is on the board: a name they pick once from the board's name
columns, bound to their monday email. TT Execs are the names in the TT Exec column.
"""
from core.shared import field_index as fi
from core.features.integrations.monday import client, credentials

NAME_KEYS = ('lead_ssc', 'tt_executive', 'solution_consultant_2', 'solution_consultant_3', 'solution_consultant_4')
EXEC_KEY = 'tt_executive'
PLACEHOLDERS = frozenset({'tbd'})


def name_columns():
    """{field key: board column id} for the columns that hold people's names."""
    bindings = dict(fi.monday_bindings())
    return {key: bindings[key]['column_id'] for key in NAME_KEYS}


def find(name, labels):
    """The column's own spelling of a name (case-insensitive), or None; placeholders never match."""
    wanted = str(name or '').strip().casefold()
    if not wanted or wanted in PLACEHOLDERS:
        return None
    return next((label for label in labels if label.strip().casefold() == wanted), None)


def board_names(labels_by_key):
    """Every person on the board once: case-only variants collapse, keeping a spelling that isn't all capitals."""
    chosen = {}
    for labels in labels_by_key.values():
        for label in labels:
            name = label.strip()
            key = name.casefold()
            if not name or key in PLACEHOLDERS:
                continue
            current = chosen.get(key)
            if current is None or (current.isupper() and not name.isupper()):
                chosen[key] = name
    return sorted(chosen.values(), key=str.casefold)


def who(preferences, email, labels_by_key):
    prefs = preferences or {}
    bound = bool(email) and str(prefs.get('solutioner_email') or '').casefold() == email.casefold()
    name = prefs.get('solutioner', '') if bound else ''
    return {
        'email': email,
        'name': name,
        'is_exec': find(name, labels_by_key.get(EXEC_KEY, [])) is not None,
        'names': board_names(labels_by_key),
    }


def remember(preferences, email, name):
    return {**(preferences or {}), 'solutioner': name, 'solutioner_email': email}


def me(preferences):
    """Who the signed-in person is on the board (asks monday for the name columns); raises client.MondayError."""
    columns = name_columns()
    labels = client.status_labels(sorted(set(columns.values())))
    by_key = {key: list(labels.get(column_id, {})) for key, column_id in columns.items()}
    return who(preferences, signed_in_email(), by_key)


def signed_in_email():
    """The monday email of this sign-in; older sign-ins saved none, so ask monday once and keep it."""
    saved = credentials.load_token() or {}
    email = (saved.get('user') or {}).get('email')
    if email:
        return email
    email = ((client.graphql('{ me { id name email } }').get('me') or {}).get('email')) or ''
    latest = credentials.load_token() or {}  # the call may have refreshed the token meanwhile
    if email and latest.get('access_token'):
        latest['user'] = {**(latest.get('user') or {}), 'email': email}
        credentials.save_token(latest)
    return email
