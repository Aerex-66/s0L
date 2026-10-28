"""
Background lookups. Every client is looked up once: a bulk run the first time, then only
clients that are new. Failures wait for someone to press retry on the client library page.
Wikidata is asked about many clients per query, spaced out, and whenever a server answers
"retry after", the worker waits that long. Clients with no exact match then go through
Wikidata's search, slowly: it runs the rate-limited API behind the query service.
"""
import threading
import time

from core.features.integrations.client_logos import fetcher, resolver, store

LOOKUP_VERSION = 5  # raise after a matching change: clients still without a logo are looked up again
NAMES_PER_QUERY = 30
NAMES_PER_SEARCH = 5
SPACING_SECONDS = 0.5
SEARCH_SPACING_SECONDS = 3
MAX_WAIT_SECONDS = 120
ATTEMPTS = 3
# The search answers 500 when the API behind it is busy; that's worth a wait, not a give-up.
SEARCH_RETRY_CODES = frozenset({429, 500, 503})

_lock = threading.Lock()
_state = {'running': False, 'pending': 0}


def _needs_lookup(entry, retry_failed):
    if not entry:
        return True
    if entry.get('manual') or entry.get('validated') or entry.get('status') == 'hidden':
        return False
    if entry.get('lookup', 1) < LOOKUP_VERSION:
        return entry.get('status') != 'found'
    return retry_failed and entry.get('status') == 'error'


def pending_names(names, index=None, retry_failed=False):
    """Clients never looked up (or by an older matcher); failed ones only when retry_failed."""
    index = store.load_index() if index is None else index
    seen, todo = set(), []
    for name in names:
        key = resolver.normalize(name)
        if key and key not in seen:
            seen.add(key)
            if _needs_lookup(index.get(key), retry_failed):
                todo.append(name)
    return todo


def _patiently(call, sleep, retry_codes=None, first_wait=5):
    """Run a fetch, waiting out 'retry after' answers a couple of times before giving up."""
    for attempt in range(ATTEMPTS):
        try:
            return call()
        except fetcher.FetchRefused as refused:
            retryable = refused.status in retry_codes if retry_codes else refused.throttled
            if not retryable or attempt == ATTEMPTS - 1:
                raise
            wait = refused.retry_after if refused.retry_after is not None else first_wait * 2 ** attempt
            sleep(min(wait, MAX_WAIT_SECONDS))
    return None


def _details(match):
    keys = ('entity', 'label', 'description', 'matched', 'website', 'alternatives', 'confident', 'searched')
    return {key: match[key] for key in keys if match.get(key) not in (None, '')}


def _one_done():
    with _lock:
        _state['pending'] = max(0, _state['pending'] - 1)


def _save(name, status, logo=None, **extra):
    # A person may approve, hide or set a client while a run is going; their call stands.
    return store.record(name, status, logo, keep_reviewed=True, lookup=LOOKUP_VERSION, **extra)


def _record_match(name, match, sleep):
    """Record one client's outcome; True when an image was downloaded (or tried)."""
    if not match:
        _save(name, 'missing', reason='Not found on Wikidata')
        return False
    try:
        logo = _patiently(lambda: resolver.download(match), sleep)
    except fetcher.FetchRefused as refused:
        _save(name, 'error', reason=f'Logo download failed ({refused})', **_details(match))
        return True
    reason = None if logo else 'Found on Wikidata, but without a usable logo or website icon'
    _save(name, 'found' if logo else 'missing', logo, reason=reason, **_details(match))
    return True


def _search(names, kinds, sleep):
    """The slow second pass, a few clients at a time; a group whose search keeps failing waits for a retry."""
    for start in range(0, len(names), NAMES_PER_SEARCH):
        group = names[start:start + NAMES_PER_SEARCH]
        try:
            found = _patiently(lambda: resolver.search_batch(group, kinds, pause=lambda: sleep(SEARCH_SPACING_SECONDS)),
                               sleep, retry_codes=SEARCH_RETRY_CODES, first_wait=60)
        except fetcher.FetchRefused as refused:
            for name in group:
                _save(name, 'error', reason=f'Wikidata search failed ({refused}); try again later')
                _one_done()
        else:
            for name in group:
                if _record_match(name, found.get(name), sleep):
                    sleep(SPACING_SECONDS)
                _one_done()
        sleep(SEARCH_SPACING_SECONDS)


def run(names, *, sleep=time.sleep):
    kinds = {}
    try:
        lookups, unmatched = [], []
        for name in names:
            if resolver.is_placeholder(name):
                _save(name, 'missing', reason='Placeholder, not a client name')
                _one_done()
            else:
                lookups.append(name)
        for start in range(0, len(lookups), NAMES_PER_QUERY):
            batch = lookups[start:start + NAMES_PER_QUERY]
            try:
                matches = _patiently(lambda: resolver.match_batch(batch, kinds), sleep)
            except fetcher.FetchRefused as refused:
                for name in batch:
                    _save(name, 'error', reason=f'Wikidata lookup failed ({refused})')
                    _one_done()
            else:
                for name in batch:
                    if not matches.get(name):
                        unmatched.append(name)
                        continue
                    if _record_match(name, matches[name], sleep):
                        sleep(SPACING_SECONDS)
                    _one_done()
            sleep(SPACING_SECONDS)
        _search(unmatched, kinds, sleep)
    finally:
        with _lock:
            _state.update(running=False, pending=0)


def start(names, *, retry_failed=False, force=False):
    """Look up the clients that need it in the background; False when there are none or a run is going."""
    todo = list(dict.fromkeys(names)) if force else pending_names(names, retry_failed=retry_failed)
    with _lock:
        if _state['running'] or not todo:
            return False
        _state.update(running=True, pending=len(todo))
    threading.Thread(target=run, args=(todo,), name='client-logos', daemon=True).start()
    return True


def status():
    with _lock:
        return dict(_state)
