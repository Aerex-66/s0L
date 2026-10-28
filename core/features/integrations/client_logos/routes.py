"""
Client logo routes: what's cached, start the background lookups, serve cached images
(sandboxed, never fetched at request time), the client library for review, and fixes.
"""
from collections import Counter
from urllib.parse import quote, urlsplit

from flask import Blueprint, jsonify, request, send_file

from core.shared.security import is_local_host, parse_frontend_origins
from core.shared.state import load_data
from core.features.integrations.client_logos import fetcher, resolver, store, worker

client_logos_blueprint = Blueprint('client_logos', __name__)
_files_named = False


def _name_files_once():
    # Older caches named files by hash; renamed on the first request rather than at app start.
    global _files_named
    if not _files_named:
        store.name_files_after_clients()
        _files_named = True

_MIME = {'svg': 'image/svg+xml', 'png': 'image/png', 'ico': 'image/x-icon', 'jpg': 'image/jpeg', 'webp': 'image/webp'}


@client_logos_blueprint.before_request
def _only_local_hosts():
    if not is_local_host(request.host):
        return jsonify({'error': 'Forbidden host'}), 403
    return None


def _json_only():
    # JSON bodies force a CORS preflight, so other sites can't trigger these routes.
    if not request.is_json:
        return jsonify({'error': 'Expected a JSON request'}), 415
    return None


def _url(entry):
    return f'/api/client-logos/file/{quote(entry["file"], safe="")}'


def _client_names():
    return [deal.get('client_name') for deal in load_data().get('deals', []) if deal.get('client_name')]


_LIBRARY_FIELDS = ('source', 'entity', 'label', 'description', 'website', 'matched', 'reason',
                   'alternatives', 'confident', 'searched', 'manual', 'checked_at')


@client_logos_blueprint.route('/api/client-logos', methods=['GET'])
def list_logos():
    """The logos the tiles show: approved by a person, or a sure match."""
    _name_files_once()
    index = store.load_index()
    logos = {key: {'url': _url(entry), 'source': entry.get('source')}
             for key, entry in index.items()
             if entry.get('status') == 'found' and entry.get('file') and (entry.get('validated') or entry.get('confident'))}
    hidden = sorted(key for key, entry in index.items() if entry.get('status') == 'hidden')
    return jsonify({'logos': logos, 'hidden': hidden, **worker.status()})


@client_logos_blueprint.route('/api/client-logos/resolve', methods=['POST'])
def resolve():
    """Look up clients never checked; with retry_failed, also the ones whose lookup failed."""
    refused = _json_only()
    if refused:
        return refused
    retry_failed = bool((request.get_json(silent=True) or {}).get('retry_failed'))
    return jsonify({'started': worker.start(_client_names(), retry_failed=retry_failed), **worker.status()})


@client_logos_blueprint.route('/api/client-logos/library', methods=['GET'])
def library():
    """Every client on a deal, with its logo, where it came from and whether a person has checked it."""
    _name_files_once()
    index = store.load_index()
    spellings = {}
    for name in _client_names():
        name = ' '.join(str(name).split())
        key = resolver.normalize(name)
        if key:
            spellings.setdefault(key, Counter())[name] += 1
    clients = []
    for key, names in spellings.items():
        entry = index.get(key) or {}
        has_file = store.has_file(entry)
        clients.append({
            'key': key, 'name': names.most_common(1)[0][0], 'deals': sum(names.values()),
            'status': entry.get('status', 'pending'), 'validated': bool(entry.get('validated')),
            'url': _url(entry) if has_file else None,
            **{field: entry.get(field) for field in _LIBRARY_FIELDS},
        })
    clients.sort(key=lambda client: client['name'].lower())
    return jsonify({'clients': clients, **worker.status()})


@client_logos_blueprint.route('/api/client-logos/file/<file_name>', methods=['GET'])
def logo_file(file_name):
    path = store.file_path(file_name)
    if not path:
        return jsonify({'error': 'Not found'}), 404
    response = send_file(path, mimetype=_MIME[file_name.rsplit('.', 1)[1].lower()], max_age=86400)
    # Opened on its own, an image can't run anything or reach the app's other routes.
    response.headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


_WIKI_HOSTS = ('wikipedia.org', 'wikidata.org', 'wikimedia.org')


def _use_website(client, website):
    if not website.lower().startswith('https://'):
        return None, (jsonify({'error': "Use the full https:// address of the client's website."}), 400)
    host = (urlsplit(website).hostname or '').lower()
    if any(host == wiki or host.endswith('.' + wiki) for wiki in _WIKI_HOSTS):
        # Its icon would be Wikipedia's, not the client's.
        return None, (jsonify({'error': "That's a Wikipedia or Wikidata page, not the client's website. "
                                        "Paste the article's address (…wikipedia.org/wiki/…) or the Q-id."}), 400)
    logo = resolver.logo_from_website(website)
    if not logo:
        return None, (jsonify({'error': 'No icon was found on that website.'}), 404)
    return store.record(client, 'found', logo, manual=True, validated=True), None


def _use_article(client, url):
    try:
        logo, match = resolver.logo_from_article(url)
    except fetcher.FetchRefused as refused:
        return None, (jsonify({'error': f'Wikipedia could not be reached ({refused}). Try again in a minute.'}), 503)
    if not logo:
        return None, (jsonify({'error': 'That article has no logo s0L can use. Download it and use Upload.'}), 404)
    details = {key: match[key] for key in ('entity', 'label', 'description', 'website') if match and match.get(key)}
    return store.record(client, 'found', logo, manual=True, validated=True, matched=url, **details), None


def _use_wikidata(client, entity):
    try:
        match = resolver.match_item(entity)
        logo = resolver.download(match) if match else None
    except fetcher.FetchRefused as refused:
        return None, (jsonify({'error': f'Wikidata could not be reached ({refused}). Try again in a minute.'}), 503)
    if not match:
        return None, (jsonify({'error': f'{entity} was not found on Wikidata.'}), 404)
    if not logo:
        return None, (jsonify({'error': f'{match.get("label") or entity} has no logo or website icon on Wikidata.'}), 404)
    details = {key: match[key] for key in ('entity', 'label', 'description', 'website') if match.get(key)}
    return store.record(client, 'found', logo, manual=True, validated=True, matched=entity, **details), None


@client_logos_blueprint.route('/api/client-logos/upload', methods=['POST'])
def upload():
    """A logo file a person picked for a client, checked by its own bytes like any download."""
    # A file upload skips the CORS preflight, so the page's origin is checked here instead.
    origin = request.headers.get('Origin')
    if origin and origin not in parse_frontend_origins():
        return jsonify({'error': 'Forbidden origin'}), 403
    if (request.content_length or 0) > 2 * fetcher.MAX_IMAGE_BYTES:
        return jsonify({'error': 'The file is over 512 KB.'}), 413
    client = str(request.form.get('client_name') or '').strip()
    uploaded = request.files.get('file')
    if not client or not uploaded:
        return jsonify({'error': 'client_name and a file are required'}), 400
    body = uploaded.read(fetcher.MAX_IMAGE_BYTES + 1)
    try:
        ext = fetcher.sniff_image(body)
    except fetcher.FetchRefused as refused:
        return jsonify({'error': f'That file was refused: {refused}. Use an SVG, PNG, JPEG, WebP or ICO up to 512 KB.'}), 400
    entry = store.record(client, 'found', {'ext': ext, 'body': body, 'source': 'upload'}, manual=True, validated=True)
    return jsonify({'client': resolver.normalize(client), 'status': 'found', 'validated': True, 'url': _url(entry)})


@client_logos_blueprint.route('/api/client-logos/override', methods=['POST'])
def override():
    """Review a client's logo: approve it (or that it has none), hide or show it, look it up again,
    or take it from a source picked by hand: the client's website, a Wikipedia article or a Wikidata item."""
    refused = _json_only()
    if refused:
        return refused
    body = request.get_json(silent=True) or {}
    client = str(body.get('client_name') or '').strip()
    action = body.get('action')
    if not client:
        return jsonify({'error': 'client_name is required'}), 400

    if action in ('approve', 'unapprove'):
        entry = store.set_validated(client, action == 'approve')
        if entry is None:
            return jsonify({'error': 'This client has not been looked up yet.'}), 409
    elif action in ('hide', 'show'):
        entry = store.set_hidden(client, action == 'hide')
        if entry is None:
            worker.start([client], force=True)
    elif action == 'retry':
        if not worker.start([client], force=True):
            return jsonify({'error': 'Lookups are already running. Try again when they finish.'}), 409
        entry = None
    elif action in ('use', 'website'):
        source = str(body.get('source') or body.get('website') or '').strip()
        entity = resolver.parse_entity(source)
        if not entity and not source.lower().startswith('https://'):
            return jsonify({'error': "Paste the client's website (https://…), a Wikipedia article link, "
                                     "or a Wikidata item (Q95 or its wikidata.org link)."}), 400
        if resolver.wikipedia_article(source):
            entry, failed = _use_article(client, source)
        else:
            entry, failed = _use_wikidata(client, entity) if entity else _use_website(client, source)
        if failed:
            return failed
    else:
        return jsonify({'error': 'action must be approve, unapprove, hide, show, retry, use or website'}), 400

    status = (entry or {}).get('status', 'pending')
    return jsonify({'client': resolver.normalize(client), 'status': status,
                    'validated': bool((entry or {}).get('validated')),
                    'url': _url(entry) if status == 'found' else None})
