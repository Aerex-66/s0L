"""
Client name -> logo, through Wikidata's query service. Names are cleaned (legal suffixes,
region tags, deal notes) and matched exactly against English labels and aliases, many
clients per query. Companies are preferred over other organizations, and places never count
except for city/state/county clients, whose logo is the place's own. The logo is Wikidata's
"logo image" (P154) from Wikimedia's image server, else the icon of the "official website"
(P856). No logo is better than the wrong one: only sure matches show before a person
confirms them on the client library page.
"""
import hashlib
import re
import urllib.parse

from core.features.integrations.client_logos import fetcher

UPLOAD_HOST = 'https://upload.wikimedia.org'
COMMONS = 'wikipedia/commons'
WIKIMEDIA_HOSTS = frozenset({'upload.wikimedia.org'})
ICON_PATHS = ('/favicon.svg', '/apple-touch-icon.png', '/favicon.ico')
THUMB_WIDTH = 250  # one of Wikimedia's standard thumbnail sizes
ORGANIZATION, COMPANY, PLACE, HUMAN = 'Q43229', 'Q783794', 'Q56061', 'Q5'
COMPANY_TYPES = frozenset({'Q4830453', 'Q6881511'})  # "business" / "enterprise" given directly as the type
CLASSES_PER_QUERY = 250
ITEMS_PER_QUERY = 150
TERMS_PER_QUERY = 5  # each term is one call to Wikidata's rate-limited search behind the query service
SEARCH_HITS = 5
MAX_SEARCH_TERMS = 3
PLACEHOLDERS = frozenset({'tbd', 'tba', 'n/a', 'na', 'none', 'unknown', 'test', 'nda client', 'confidential'})
SMALL_WORDS = frozenset({'of', 'and', 'the', 'for', 'de', 'du', 'des', 'la', 'le', 'et', 'a', 'an', 'in', 'on', 'at', 'by', '&'})
# Wikidata often labels a company by its full legal name: "Eli Lilly and Company", "Mars, Incorporated".
LEGAL_SUFFIXES = (' Inc.', ', Inc.', ' Inc', ' Incorporated', ', Incorporated', ' Corporation', ' Corp.',
                  ' Company', ' and Company', ' & Co.', ' Co.', ' plc', ' Limited', ' Ltd')
# Common name tails ("Micron Technology"); a guess, so a match on one is never sure ("Horizon Technologies").
NAME_TAILS = (' Group', ' Holdings', ' Technologies', ' Technology')
# Tails too generic to search on: "Barclays Services" is also searched as "Barclays".
GENERIC_TAILS = frozenset({'services', 'service', 'solutions', 'systems', 'group', 'holdings', 'international',
                           'industries', 'enterprises', 'global', 'worldwide', 'technologies', 'technology',
                           'electronics', 'products', 'partners'})
ARTICLE_SAFE = "_;@$!*(),/~:"  # characters Wikipedia leaves unescaped in article links

_NOTE = re.compile(r'\s*\(([^)]*)\)?')
_REGION_TAG = re.compile(r'\s*-\s*(?:us|usa|ca|can|canada|uk|na)$|\s+(?:us|usa)$', re.I)
_LEGAL = re.compile(r'[\s,]+(?:inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|lp|llp|ulc|sa|ag|gmbh|nv)\.?$', re.I)
_DEAL_NOTE = re.compile(r'\s+(?:pcr(?:\s*#?\s*\d+)?|rfp|rfi|erp|hcm|#\s*\d+)$', re.I)
_PARTS = re.compile(r'\s*/\s*|\s+-\s+|(?<=\w)-\s+')
_GOV_PREFIX = re.compile(r'^(?:the\s+)?(city|town|village|county|state|province|commonwealth|government|gouvernement'
                         r'|region|district|municipality|ville)\s+(?:of|de|du|des)\s+(.+)$', re.I)
_GOV_SUFFIX = re.compile(r'^(.+?)\s+gov(?:ernment)?$', re.I)
_GOV_WORDS = re.compile(r'\b(?:county|gov|government|gouvernement|municipality|ville de'
                        r'|(?:city|town|state|province|commonwealth|region|district) of)\b', re.I)
_STATE_CODE = re.compile(r'\s[A-Za-z]{2}$')
_ENTITY = re.compile(r'^(?:https?://(?:www\.|m\.)?wikidata\.org/(?:wiki|entity)/)?(Q[1-9][0-9]{0,11})/?$', re.I)
_WIKIPEDIA = re.compile(r'^https://([a-z][a-z0-9-]{1,11})\.(?:m\.)?wikipedia\.org/wiki/([^?#]+)(?:[?#].*)?$', re.I)
_WIKIMEDIA_FILE = re.compile(r'^https://(?:upload|thumb)\.wikimedia\.org/(wikipedia/[a-z0-9-]+)/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?#]+)')
_QID = re.compile(r'^Q[1-9][0-9]{0,11}$')


def normalize(name):
    return ' '.join(str(name or '').lower().split())


def is_placeholder(name):
    return normalize(name) in PLACEHOLDERS


def parse_entity(text):
    """'Q95' from 'Q95' or a wikidata.org item link; None for anything else."""
    match = _ENTITY.match(str(text or '').strip())
    return match.group(1).upper() if match else None


def wikipedia_article(url):
    """A Wikipedia article link in the form Wikidata stores it (desktop host, encoded title), or None."""
    match = _WIKIPEDIA.match(str(url or '').strip())
    if not match:
        return None
    title = urllib.parse.unquote(match.group(2)).replace(' ', '_')
    return f'https://{match.group(1).lower()}.wikipedia.org/wiki/{urllib.parse.quote(title, safe=ARTICLE_SAFE)}'


# --- Client name -> the exact names to look for -------------------------------------------

def _cases(text):
    """The text as written and, when it's all one case, title-cased (with and without acronyms kept)."""
    forms = [text]
    if text.isupper() or text.islower():
        words = text.split()

        def cap(word):
            return '-'.join(piece[:1].upper() + piece[1:].lower() for piece in word.split('-'))
        title = [word.lower() if i and word.lower() in SMALL_WORDS else cap(word) for i, word in enumerate(words)]
        forms.append(' '.join(title))
        forms.append(' '.join(word if word.isupper() and len(word) <= 4 and word.lower() not in SMALL_WORDS else t
                              for word, t in zip(words, title)))
    return list(dict.fromkeys(forms))


def _clean(part):
    while True:
        cleaned = _DEAL_NOTE.sub('', _LEGAL.sub('', _REGION_TAG.sub('', part))).strip(' ,.-&')
        if cleaned == part:
            return part
        part = cleaned


def is_acronym(text):
    """'AEP', 'KNPC': short all-caps names, which many unrelated organizations share."""
    return text.isalpha() and text.isupper() and len(text) <= 4


def _government_tiers(part):
    """Extra names for a government part: 'County of X' -> 'X County', 'City of X' -> 'X', 'X Gov' -> 'Government of X'."""
    match = _GOV_PREFIX.match(part)
    if match:
        kind, rest = match.group(1).lower(), match.group(2).strip()
        if kind in ('county', 'region'):
            return [[f'{form} {kind.title()}' for form in _cases(rest)]]
        tiers = [_cases(rest)]
        if ',' in rest:
            tiers.append(_cases(rest.split(',')[0].strip()))
        elif _STATE_CODE.search(rest):
            tiers.append(_cases(rest[:-3].strip()))
        return tiers
    match = _GOV_SUFFIX.match(part)
    if match:
        return [[f'Government of {form}' for form in _cases(match.group(1))], _cases(match.group(1))]
    return []


def name_forms(name):
    """{'tiers': [[exact names], ...] best first, 'primary': how many tiers come from the client's
    main name (not a second name or a note), 'guessed': names with a guessed tail, 'acronym': the
    client's name is an acronym, 'government': places count as a match}."""
    text = ' '.join(str(name or '').split())
    if not text or is_placeholder(text):
        return {'tiers': [], 'primary': 0, 'guessed': set(), 'acronym': False, 'government': False}
    # "(KHC)" restates the name; only a note in words ("(Discount Tire)") is worth a lookup.
    notes = [note.strip() for note in _NOTE.findall(text) if note.strip() and not is_acronym(note.strip())]
    government = bool(_GOV_WORDS.search(text))
    tiers, seen, guessed, primary, acronym = [], set(), set(), None, None

    def add(tier):
        fresh = [form for form in tier if len(form) >= 3 and form not in seen]
        seen.update(fresh)
        if fresh:
            tiers.append(fresh)

    for source in [_NOTE.sub(' ', text).strip(), *notes]:
        for i, part in enumerate(_PARTS.split(_REGION_TAG.sub('', source).strip())):
            cleaned = _clean(part)
            # A short acronym only counts as the first part ("IPG/Acxiom"), never later ("…ERP/HCM RFP").
            if len(cleaned) < 3 or (i and len(cleaned) <= 4 and cleaned.isupper()):
                continue
            government = government or bool(_GOV_PREFIX.match(cleaned))
            acronym = is_acronym(cleaned) if acronym is None else acronym
            cleaned_forms = _cases(cleaned)
            if not government and not is_acronym(cleaned):
                tails = [cleaned_forms[-1] + tail for tail in NAME_TAILS]
                guessed.update(tails)
                cleaned_forms += [cleaned_forms[-1] + suffix for suffix in LEGAL_SUFFIXES] + tails
            # As written, cleaned and with a legal suffix compete in one tier, so the best-known item wins.
            add(list(dict.fromkeys(_cases(part.strip()) + cleaned_forms)))
            for tier in _government_tiers(cleaned):
                add(tier)
            if primary is None:
                primary = len(tiers)
    return {'tiers': tiers, 'primary': primary or 0, 'guessed': guessed - set(_cases(text)),
            'acronym': bool(acronym), 'government': government}


# --- Wikidata queries ----------------------------------------------------------------------

def _literal(text, lang='en'):
    printable = ''.join(ch for ch in text if ch.isprintable())
    quoted = '"' + printable.replace('\\', '\\\\').replace('"', '\\"') + '"'
    return f'{quoted}@{lang}' if lang else quoted


def _value(binding, key):
    return (binding.get(key) or {}).get('value') or ''


def _qid(uri):
    qid = uri.rsplit('/', 1)[-1]
    return qid if _QID.match(qid) else None


_DETAILS = '''
  ?item wikibase:sitelinks ?links .
  OPTIONAL { ?item wdt:P154 ?logo }
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P31 ?class }
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "en") }
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "en") }'''


def _match_query(forms):
    # The optimizer hint keeps the name lookup first; reordered, the query times out.
    return ('SELECT ?name ?item ?links ?label ?desc ?logo ?website ?class WHERE {\n'
            '  hint:Query hint:optimizer "None" .\n'
            f'  VALUES ?name {{ {" ".join(_literal(form) for form in forms)} }}\n'
            '  ?item rdfs:label|skos:altLabel ?name .\n'
            '  FILTER EXISTS { ?item wdt:P154|wdt:P856 [] }\n'
            '  FILTER NOT EXISTS { ?item wdt:P576 [] }'
            f'{_DETAILS}\n}}')


def _item_query(entity):
    return f'SELECT ?item ?links ?label ?desc ?logo ?website ?class WHERE {{\n  VALUES ?item {{ wd:{entity} }}{_DETAILS}\n}}'


def _items_query(entities):
    return ('SELECT ?item ?links ?label ?desc ?logo ?website ?class WHERE {\n'
            f'  VALUES ?item {{ {" ".join("wd:" + entity for entity in entities)} }}\n'
            '  FILTER EXISTS { ?item wdt:P154|wdt:P856 [] }\n'
            '  FILTER NOT EXISTS { ?item wdt:P576 [] }'
            f'{_DETAILS}\n}}')


def _search_query(terms):
    # Wikidata's own search, run by the query service on its side; it ignores case.
    return ('SELECT ?term ?item ?ordinal WHERE {\n'
            f'  VALUES ?term {{ {" ".join(_literal(term, lang=None) for term in terms)} }}\n'
            '  SERVICE wikibase:mwapi {\n'
            '    bd:serviceParam wikibase:api "EntitySearch" . bd:serviceParam wikibase:endpoint "www.wikidata.org" .\n'
            '    bd:serviceParam mwapi:search ?term . bd:serviceParam mwapi:language "en" .\n'
            '    ?item wikibase:apiOutputItem mwapi:item . ?ordinal wikibase:apiOrdinal true .\n'
            '  }\n'
            f'  FILTER(?ordinal < {SEARCH_HITS})\n}}')


def _kinds_query(classes):
    return ('SELECT ?class ?root WHERE {\n'
            f'  VALUES ?class {{ {" ".join("wd:" + c for c in classes)} }}\n'
            f'  VALUES ?root {{ wd:{ORGANIZATION} wd:{COMPANY} wd:{PLACE} wd:{HUMAN} }}\n'
            '  ?class wdt:P279* ?root .\n}')


def commons_file(value):
    """'Name.svg' from a Wikidata logo value (a Special:FilePath link)."""
    text = str(value or '')
    if '/Special:FilePath/' in text:
        text = text.split('/Special:FilePath/', 1)[1]
    return urllib.parse.unquote(text).strip() or None


def _merge(bindings):
    """One candidate per (name, item) from the query rows (one row per logo x website x type)."""
    merged = {}
    for binding in bindings:
        entity = _qid(_value(binding, 'item'))
        if not entity:
            continue
        name = _value(binding, 'name')
        found = merged.setdefault((name, entity), {
            'entity': entity, 'matched': name or None, 'links': 0,
            'label': None, 'description': None, 'logos': set(), 'websites': set(), 'classes': set()})
        found['links'] = max(found['links'], int(_value(binding, 'links') or 0))
        found['label'] = found['label'] or _value(binding, 'label') or None
        found['description'] = found['description'] or _value(binding, 'desc') or None
        for key, target in (('logo', 'logos'), ('website', 'websites')):
            if _value(binding, key):
                found[target].add(_value(binding, key))
        if _qid(_value(binding, 'class')):
            found['classes'].add(_qid(_value(binding, 'class')))
    return list(merged.values())


def _finish(found, kinds):
    roots = set().union(*(kinds.get(c, set()) for c in found['classes']))
    company = COMPANY in roots or bool(found['classes'] & COMPANY_TYPES)
    logos = sorted(found['logos'], key=lambda logo: (not logo.lower().endswith('.svg'), logo))
    # The main site over a language one: https first, then "www.", then the shortest address.
    websites = sorted(found['websites'], key=lambda site: (not site.startswith('https://'), '://www.' not in site, len(site), site))
    return {
        'entity': found['entity'], 'matched': found['matched'],
        'is_label': bool(found['matched']) and found['label'] == found['matched'],
        'links': found['links'], 'label': found['label'], 'description': found['description'],
        'logo': commons_file(logos[0]) if logos else None, 'website': websites[0] if websites else None,
        'organization': ORGANIZATION in roots or company, 'company': company, 'place': PLACE in roots,
        'person': HUMAN in roots,
    }


def _class_kinds(classes, kinds):
    """Fill kinds {class: {roots}} for classes not seen yet (organization, company, place)."""
    unknown = sorted(set(classes) - kinds.keys())
    for start in range(0, len(unknown), CLASSES_PER_QUERY):
        chunk = unknown[start:start + CLASSES_PER_QUERY]
        for binding in fetcher.query_wikidata(_kinds_query(chunk)):
            kinds.setdefault(_qid(_value(binding, 'class')), set()).add(_qid(_value(binding, 'root')))
        for qid in chunk:
            kinds.setdefault(qid, set())
    return kinds


def _eligible(candidate, government):
    if government:
        return candidate['organization'] or candidate['place']
    return candidate['organization'] and not candidate['place']


def _search_eligible(candidate, government):
    """Looser for search hits, which a person always confirms (Wikidata files PayPal as a "creative work"):
    anything with a logo or website except a person, or a place when the client isn't a government."""
    return not candidate['person'] and (government or not candidate['place'])


def _preferred(candidate, government):
    """A company, or for a government client the place itself."""
    return candidate['place'] if government else candidate['company']


def _score(candidate, government):
    """Best-known first; an exact label counts triple, and a company (or for a government client,
    the place) five times, so a famous association still beats an obscure company sharing its acronym."""
    return (candidate['links'] + 1) * (3 if candidate['is_label'] else 1) * (5 if _preferred(candidate, government) else 1)


def _rank(candidate, government):
    return (_score(candidate, government), candidate['is_label'], bool(candidate['logo']), candidate['entity'])


def _choose(forms, candidates_by_name):
    """The best candidate from the first tier that has any, how many others it beat there, and
    whether it's sure: the exact label of a company (or for a government client, a place or agency)
    for the client's own main name (not an acronym, a second name, a note or a guessed tail), well
    ahead of any other candidate."""
    government = forms['government']
    for tier_index, tier in enumerate(forms['tiers']):
        best_per_item = {}
        for name in tier:
            for candidate in candidates_by_name.get(name, ()):
                if not _eligible(candidate, government):
                    continue
                held = best_per_item.get(candidate['entity'])
                if held is None or _rank(candidate, government) > _rank(held, government):
                    best_per_item[candidate['entity']] = candidate
        if best_per_item:
            ranked = sorted(best_per_item.values(), key=lambda candidate: _rank(candidate, government), reverse=True)
            winner = ranked[0]
            runner_up = _score(ranked[1], government) if len(ranked) > 1 else 0
            confident = (winner['is_label'] and tier_index < forms['primary'] and not forms['acronym']
                         and winner['matched'] not in forms['guessed'] and (government or winner['company'])
                         and _score(winner, government) >= 3 * runner_up)
            return {**winner, 'alternatives': len(ranked) - 1, 'confident': confident}
    return None


def match_batch(names, kinds=None):
    """{client name: best match or None} for a batch of clients, in two queries.
    `kinds` caches what each Wikidata type is, across batches."""
    kinds = {} if kinds is None else kinds
    plans = {name: name_forms(name) for name in names}
    forms = sorted({form for plan in plans.values() for tier in plan['tiers'] for form in tier})
    if not forms:
        return {name: None for name in names}
    found = _merge(fetcher.query_wikidata(_match_query(forms)))
    _class_kinds({qid for candidate in found for qid in candidate['classes']}, kinds)
    by_name = {}
    for candidate in found:
        by_name.setdefault(candidate['matched'], []).append(_finish(candidate, kinds))
    return {name: _choose(plan, by_name) for name, plan in plans.items()}


def match_item(entity):
    """A Wikidata item picked by hand (Q-id): its label, description, logo and website, or None."""
    found = _merge(fetcher.query_wikidata(_item_query(entity)))
    if not found:
        return None
    match = {**_finish(found[0], {}), 'matched': entity}
    return match if (match['label'] or match['logo'] or match['website']) else None


def entity_for_article(url):
    """The Wikidata item (Q-id) a Wikipedia article is about, or None."""
    article = wikipedia_article(url)
    if not article:
        return None
    rows = fetcher.query_wikidata(f'SELECT ?item WHERE {{ <{article}> schema:about ?item . }}')
    return next((qid for qid in (_qid(_value(row, 'item')) for row in rows) if qid), None)


def search_terms(name):
    """What to type into Wikidata's search for a client with no exact match: its cleaned main name,
    then shorter versions of it (two words at least, never ending on "of" or "and")."""
    text = ' '.join(str(name or '').split())
    if not text or is_placeholder(text):
        return []
    cleaned = _clean(_PARTS.split(_REGION_TAG.sub('', _NOTE.sub(' ', text).strip()).strip())[0])
    if len(cleaned) < 3:
        return []
    words = cleaned.split()
    core = list(words)
    while len(core) > 1 and core[-1].lower() in GENERIC_TAILS:
        core.pop()
    shorter = [' '.join(words[:n]) for n in range(len(words) - 1, 1, -1) if words[n - 1].lower() not in SMALL_WORDS]
    terms = [cleaned, *([' '.join(core)] if len(core) < len(words) and len(' '.join(core)) >= 3 else []), *shorter]
    return list(dict.fromkeys(terms))[:MAX_SEARCH_TERMS]


def _details(entities, known, kinds):
    """Fill known {entity: candidate or None} for items not seen yet (None: no logo or website)."""
    fresh = sorted(set(entities) - known.keys())
    for start in range(0, len(fresh), ITEMS_PER_QUERY):
        chunk = fresh[start:start + ITEMS_PER_QUERY]
        merged = _merge(fetcher.query_wikidata(_items_query(chunk)))
        _class_kinds({qid for candidate in merged for qid in candidate['classes']}, kinds)
        known.update({candidate['entity']: _finish(candidate, kinds) for candidate in merged})
        known.update({entity: None for entity in chunk if entity not in known})
    return known


def search_batch(names, kinds=None, pause=lambda: None):
    """Second pass for clients with no exact match: Wikidata's own search, which ignores case and
    finds longer names ("ABBVIE" -> AbbVie). The best-ranked eligible hit wins, and always waits for
    a person ("Sunlife" finds a UK insurer first). `pause` runs between search queries."""
    kinds = {} if kinds is None else kinds
    plans = {name: name_forms(name) for name in names}
    terms = {name: search_terms(name) for name in names}
    known, results, searched = {}, {}, False
    for round_index in range(MAX_SEARCH_TERMS):
        todo = {name: terms[name][round_index] for name in names
                if name not in results and len(terms[name]) > round_index}
        if not todo:
            break
        hits, unique = {}, sorted(set(todo.values()))
        for start in range(0, len(unique), TERMS_PER_QUERY):
            if searched:
                pause()
            searched = True
            for binding in fetcher.query_wikidata(_search_query(unique[start:start + TERMS_PER_QUERY])):
                entity = _qid(_value(binding, 'item'))
                if entity:
                    hits.setdefault(_value(binding, 'term'), []).append((int(_value(binding, 'ordinal') or 0), entity))
        _details({entity for found in hits.values() for _, entity in found}, known, kinds)
        for name, term in todo.items():
            government = plans[name]['government']
            ranked = sorted(((ordinal, known[entity]) for ordinal, entity in hits.get(term, ())
                             if known.get(entity) and _search_eligible(known[entity], government)),
                            key=lambda hit: (not _preferred(hit[1], government), not hit[1]['organization'], hit[0]))
            if not ranked:
                continue
            results[name] = {**ranked[0][1], 'matched': term, 'searched': True,
                             'alternatives': len(ranked) - 1, 'confident': False}
    return {name: results.get(name) for name in names}


# --- Images -------------------------------------------------------------------------------

def upload_url(file_name, width=None, project=COMMONS):
    """A file's address on Wikimedia's image server; with a width, its PNG/JPEG thumbnail."""
    name = file_name.replace(' ', '_')
    name = name[:1].upper() + name[1:]
    digest = hashlib.md5(name.encode('utf-8'), usedforsecurity=False).hexdigest()
    path = f'{digest[0]}/{digest[:2]}/{urllib.parse.quote(name)}'
    if width is None:
        return f'{UPLOAD_HOST}/{project}/{path}'
    thumb = f'{width}px-{name}' + ('.png' if name.lower().endswith('.svg') else '')
    return f'{UPLOAD_HOST}/{project}/thumb/{path}/{urllib.parse.quote(thumb)}'


def _from_wikimedia(file_name, project=COMMONS):
    """(ext, body) of a Wikimedia logo file: a safe SVG itself, else a thumbnail. Rate limits propagate."""
    original, thumbnail = upload_url(file_name, project=project), upload_url(file_name, THUMB_WIDTH, project)
    for url in ((original, thumbnail) if file_name.lower().endswith('.svg') else (thumbnail, original)):
        try:
            return fetcher.fetch_image(url, allowed_hosts=WIKIMEDIA_HOSTS)
        except fetcher.FetchRefused as refused:
            if refused.throttled:
                raise
    return None


def logo_from_website(website):
    """The site's own icon, tried at its well-known paths over HTTPS (no pages are fetched)."""
    parts = urllib.parse.urlsplit(str(website or '').strip())
    if parts.scheme not in ('http', 'https') or not parts.hostname:
        return None
    origin = f'https://{parts.netloc}'
    for path in ICON_PATHS:
        try:
            ext, body = fetcher.fetch_image(f'{origin}{path}')
            return {'ext': ext, 'body': body, 'source': 'website', 'website': origin}
        except fetcher.FetchRefused:
            continue
    return None


def download(match):
    """{'ext', 'body', 'source', 'website'?} for a match: its Wikidata logo, else its website's icon."""
    if match.get('logo'):
        image = _from_wikimedia(match['logo'])
        if image:
            return {'ext': image[0], 'body': image[1], 'source': 'wikidata'}
    return logo_from_website(match['website']) if match.get('website') else None


def logo_from_article(url):
    """(logo, match) for a Wikipedia article a person pasted: the article's Wikidata item logo, else the
    article's lead image. Many company logos can't be on Wikimedia Commons, so only Wikipedia has them."""
    article = wikipedia_article(url)
    if not article:
        return None, None
    entity = entity_for_article(article)
    match = match_item(entity) if entity else None
    if match and match.get('logo'):
        image = _from_wikimedia(match['logo'])
        if image:
            return {'ext': image[0], 'body': image[1], 'source': 'wikidata'}, match
    lang, title = article.split('://', 1)[1].split('.', 1)[0], urllib.parse.unquote(article.rsplit('/wiki/', 1)[1])
    lead = fetcher.wikipedia_summary(lang, title).get('originalimage') or {}
    found = _WIKIMEDIA_FILE.match(str(lead.get('source') or ''))
    image = _from_wikimedia(urllib.parse.unquote(found.group(2)), found.group(1)) if found else None
    if not image:
        return None, match
    return {'ext': image[0], 'body': image[1], 'source': 'wikipedia'}, match
