import email.message
import io
import json
import socket
import urllib.error

import pytest

from core.features.integrations.client_logos import fetcher, resolver, store, worker

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32
SAFE_SVG = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/></svg>'


class FakeResponse:
    def __init__(self, content_type, body):
        self.headers = {'Content-Type': content_type}
        self._body = body

    def read(self, limit=-1):
        return self._body if limit < 0 else self._body[:limit]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeOpener:
    def __init__(self, routes):
        self.routes, self.urls, self.requests = routes, [], []

    def open(self, request, timeout=None):
        self.urls.append(request.full_url)
        self.requests.append(request)
        result = self.routes[request.full_url]
        if isinstance(result, Exception):
            raise result
        return result


def redirect(url, location):
    headers = email.message.Message()
    headers['Location'] = location
    return urllib.error.HTTPError(url, 302, 'Found', headers, None)


@pytest.fixture
def network(monkeypatch):
    """Public DNS for every host except the ones a test marks private; HTTP answers come from `routes`."""
    private = {}

    def getaddrinfo(host, port, proto=0):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (private.get(host, '93.184.216.34'), port))]

    monkeypatch.setattr(fetcher.socket, 'getaddrinfo', getaddrinfo)
    opener = FakeOpener({})
    monkeypatch.setattr(fetcher, '_opener', opener)
    opener.private = private
    return opener


def test_only_public_https_images_are_fetched(network):
    network.private['intranet.example'] = '10.0.0.7'
    with pytest.raises(fetcher.FetchRefused):
        fetcher.fetch_image('http://example.com/logo.png')
    with pytest.raises(fetcher.FetchRefused):
        fetcher.fetch_image('https://intranet.example/logo.png')
    assert network.urls == []


def test_non_images_are_refused(network):
    network.routes['https://example.com/logo.png'] = FakeResponse('text/html', b'<html></html>')
    with pytest.raises(fetcher.FetchRefused, match='not an image'):
        fetcher.fetch_image('https://example.com/logo.png')


def test_image_bytes_must_match_the_type(network):
    network.routes['https://example.com/a.png'] = FakeResponse('image/png', b'GIF89a not a png')
    network.routes['https://example.com/b.png'] = FakeResponse('image/png', PNG)
    with pytest.raises(fetcher.FetchRefused):
        fetcher.fetch_image('https://example.com/a.png')
    assert fetcher.fetch_image('https://example.com/b.png') == ('png', PNG)


def test_oversized_images_are_refused(network):
    network.routes['https://example.com/big.png'] = FakeResponse('image/png', PNG + b'\x00' * fetcher.MAX_IMAGE_BYTES)
    with pytest.raises(fetcher.FetchRefused, match='too large'):
        fetcher.fetch_image('https://example.com/big.png')


def test_redirects_are_rechecked(network):
    network.private['metadata.internal'] = '169.254.169.254'
    network.routes['https://example.com/logo.png'] = redirect('https://example.com/logo.png', 'https://metadata.internal/latest')
    with pytest.raises(fetcher.FetchRefused, match='not a public address'):
        fetcher.fetch_image('https://example.com/logo.png')
    network.routes['https://commons.wikimedia.org/x'] = redirect('https://commons.wikimedia.org/x', 'https://evil.example/x.svg')
    with pytest.raises(fetcher.FetchRefused, match='not an allowed host'):
        fetcher.fetch_image('https://commons.wikimedia.org/x', allowed_hosts={'commons.wikimedia.org'})


@pytest.mark.parametrize('svg,safe', [
    (SAFE_SVG, True),
    (b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', False),
    (b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', False),
    (b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xlink"><image x:href="https://t.example/p.gif"/></svg>', False),
    (b'<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>', False),
    (b'<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://t.example/a.css);</style></svg>', False),
    (b'<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///c:/windows/win.ini">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>', False),
    (b'<html><body/></html>', False),
])
def test_svgs_that_could_run_or_load_anything_are_refused(svg, safe):
    assert fetcher.is_safe_svg(svg) is safe


def test_queries_go_to_the_wikidata_query_service_as_a_post(network):
    rows = [{'item': {'value': 'http://www.wikidata.org/entity/Q1'}}]
    network.routes[fetcher.WIKIDATA_QUERY] = FakeResponse('application/sparql-results+json',
                                                          json.dumps({'results': {'bindings': rows}}).encode())
    assert fetcher.query_wikidata('SELECT ?item WHERE {}') == rows
    request = network.requests[-1]
    assert request.get_method() == 'POST' and request.data.startswith(b'query=SELECT')


def test_query_answers_must_be_json(network):
    network.routes[fetcher.WIKIDATA_QUERY] = FakeResponse('text/html', b'<html></html>')
    with pytest.raises(fetcher.FetchRefused, match='JSON'):
        fetcher.query_wikidata('SELECT ?item WHERE {}')


def test_rate_limits_say_when_to_retry(network):
    headers = email.message.Message()
    headers['Retry-After'] = '42'
    network.routes['https://example.com/a.png'] = urllib.error.HTTPError('https://example.com/a.png', 429, 'Too Many Requests', headers, None)
    with pytest.raises(fetcher.FetchRefused) as refused:
        fetcher.fetch_image('https://example.com/a.png')
    assert (refused.value.status, refused.value.retry_after, refused.value.throttled) == (429, 42, True)


# --- Client name -> exact names to look for ---------------------------------------------

def test_names_lose_legal_suffixes_region_tags_and_deal_notes():
    assert {'AMCOR', 'Amcor', 'Amcor plc'} <= set(resolver.name_forms('AMCOR PLC-US')['tiers'][0])
    assert resolver.name_forms('Iron Mountain PCR')['tiers'][0][:3] == ['Iron Mountain PCR', 'Iron Mountain', 'Iron Mountain Inc.']
    assert 'Eli Lilly and Company' in resolver.name_forms('Eli Lilly')['tiers'][0]
    assert resolver.name_forms('TBD')['tiers'] == []


def test_notes_and_second_names_come_after_the_main_name():
    aes = resolver.name_forms('AES (Guidehouse)')
    assert aes['tiers'][0] == ['AES', 'Aes'] and aes['tiers'][1][0] == 'Guidehouse' and aes['primary'] == 1
    kimberly = resolver.name_forms('Kimberly Clark/Kenvue')
    assert (kimberly['tiers'][0][0], kimberly['tiers'][1][0], kimberly['primary']) == ('Kimberly Clark', 'Kenvue', 1)
    # A short acronym after the first part, or in a note, is noise, not a client.
    assert all('HCM' not in tier for tier in resolver.name_forms('Fort Collins CO ERP/HCM RFP')['tiers'])
    assert all('KHC' not in tier for tier in resolver.name_forms('Kraft Heinz (KHC)')['tiers'])


def test_government_names_also_try_the_place():
    county = resolver.name_forms('COUNTY OF LOS ANGELES')
    assert county['government'] and 'Los Angeles County' in county['tiers'][-1]
    assert not any('Los Angeles' in tier for tier in county['tiers'])
    assert resolver.name_forms('City of St. Petersburg, Florida')['tiers'] == [
        ['City of St. Petersburg, Florida'], ['St. Petersburg, Florida'], ['St. Petersburg']]
    assert resolver.name_forms('Ontario Gov')['tiers'] == [['Ontario Gov'], ['Government of Ontario'], ['Ontario']]
    montreal = resolver.name_forms('SO/VILLE DE MONTREAL')
    assert montreal['government'] and ['MONTREAL', 'Montreal'] in montreal['tiers']
    assert not any('SO' in tier for tier in montreal['tiers'])
    # Two letters match far too much ("NY" is also a herbarium's code).
    assert resolver.name_forms('State of NY')['tiers'] == [['State of NY']]


def test_names_are_escaped_in_queries():
    assert '"Say \\"hi\\" \\\\ now"@en' in resolver._match_query(['Say "hi" \\ now'])


# --- Picking the right Wikidata item -----------------------------------------------------

COMPANY_TYPE, ORG_TYPE, PLACE_TYPE, OTHER_TYPE, PERSON_TYPE = 'Q10', 'Q11', 'Q12', 'Q13', 'Q14'
TYPE_ROOTS = {COMPANY_TYPE: (resolver.ORGANIZATION, resolver.COMPANY), ORG_TYPE: (resolver.ORGANIZATION,),
              PLACE_TYPE: (resolver.ORGANIZATION, resolver.PLACE), OTHER_TYPE: (), PERSON_TYPE: (resolver.HUMAN,)}


def _hit(name, qid, *, links=10, label=True, types=(COMPANY_TYPE,), logo=None, website='https://example.com', title=None):
    """Query rows for an item matching `name` by its English label (label=True) or by an alias."""
    title = title or (name if label else f'{name} Holdings')
    rows = []
    for item_type in types:
        row = {'name': {'value': name}, 'item': {'value': f'http://www.wikidata.org/entity/{qid}'},
               'links': {'value': str(links)}, 'label': {'value': title},
               'class': {'value': f'http://www.wikidata.org/entity/{item_type}'}}
        if logo:
            row['logo'] = {'value': f'http://commons.wikimedia.org/wiki/Special:FilePath/{logo.replace(" ", "%20")}'}
        if website:
            row['website'] = {'value': website}
        rows.append(row)
    return rows


def _kind_rows(sparql):
    return [{'class': {'value': f'http://www.wikidata.org/entity/{item_type}'}, 'root': {'value': f'http://www.wikidata.org/entity/{root}'}}
            for item_type, roots in TYPE_ROOTS.items() if f'wd:{item_type} ' in f'{sparql} ' for root in roots]


def _wikidata(monkeypatch, *hits):
    rows = [row for hit in hits for row in hit]
    queries = []

    def query(sparql):
        queries.append(sparql)
        if 'VALUES ?root' in sparql:
            return _kind_rows(sparql)
        return rows
    monkeypatch.setattr(fetcher, 'query_wikidata', query)
    return queries


def test_companies_beat_other_organizations_and_places_never_count(monkeypatch):
    _wikidata(monkeypatch,
              _hit('CSL', 'Q1', links=47, label=False, types=(ORG_TYPE,)),
              _hit('CSL', 'Q2', links=10, label=False, logo='CSL logo.svg', title='CSL Limited'),
              _hit('Bose', 'Q3', links=42, label=False, types=(PLACE_TYPE,)),
              _hit('Arrow', 'Q4', links=57, types=(OTHER_TYPE,)))
    matches = resolver.match_batch(['CSL', 'Bose', 'Arrow'])
    assert (matches['CSL']['entity'], matches['CSL']['label'], matches['CSL']['logo']) == ('Q2', 'CSL Limited', 'CSL logo.svg')
    assert matches['CSL']['alternatives'] == 1
    assert matches['Bose'] is None and matches['Arrow'] is None


def test_places_count_for_government_clients(monkeypatch):
    _wikidata(monkeypatch, _hit('Toronto', 'Q172', links=225, types=(PLACE_TYPE,)))
    match = resolver.match_batch(['City of Toronto'])['City of Toronto']
    assert (match['entity'], match['confident']) == ('Q172', True)


def test_exact_labels_beat_aliases_unless_far_better_known(monkeypatch):
    _wikidata(monkeypatch,
              _hit('Delta', 'Q5', links=5), _hit('Delta', 'Q6', links=74, label=False),
              _hit('Contoso', 'Q7', links=10), _hit('Contoso', 'Q8', links=20, label=False))
    matches = resolver.match_batch(['Delta', 'Contoso'])
    assert (matches['Delta']['entity'], matches['Contoso']['entity']) == ('Q6', 'Q7')


def test_a_famous_association_beats_an_obscure_company_with_its_acronym(monkeypatch):
    _wikidata(monkeypatch, _hit('IATA', 'Q1', links=70, label=False, types=(ORG_TYPE,)), _hit('IATA', 'Q2', links=1, label=False))
    assert resolver.match_batch(['IATA'])['IATA']['entity'] == 'Q1'


def test_only_sure_matches_are_marked_confident(monkeypatch):
    _wikidata(monkeypatch,
              _hit('Contoso', 'Q1', links=30),
              _hit('AEP', 'Q2', links=30),
              _hit('Fabrikam', 'Q3', links=30, label=False),
              _hit('Kenvue', 'Q4', links=30),
              _hit('Northwind', 'Q5', links=30), _hit('Northwind', 'Q6', links=25),
              _hit('Horizon Technologies', 'Q7', links=30), _hit('Teva', 'Q8', links=30))
    matches = resolver.match_batch(['Contoso', 'AEP', 'Fabrikam', 'Litware/Kenvue', 'Northwind', 'Horizon', 'TEVA'])
    assert {name: match['confident'] for name, match in matches.items()} == {
        'Contoso': True,  # the exact label of a company
        'AEP': False,  # an acronym
        'Fabrikam': False,  # an alias
        'Litware/Kenvue': False,  # the second name, not the client's own
        'Northwind': False,  # another item is nearly as likely
        'Horizon': False,  # only with a tail we guessed ("Horizon Technologies")
        'TEVA': False,  # an acronym, even once title-cased
    }


def test_the_main_name_beats_a_note(monkeypatch):
    _wikidata(monkeypatch, _hit('AES', 'Q9', links=5, label=False), _hit('Guidehouse', 'Q10', links=50))
    assert resolver.match_batch(['AES (Guidehouse)'])['AES (Guidehouse)']['entity'] == 'Q9'


def test_placeholders_are_never_looked_up(monkeypatch):
    queries = _wikidata(monkeypatch)
    assert resolver.match_batch(['TBD']) == {'TBD': None} and queries == []


def test_search_terms_shorten_a_long_name_but_keep_two_words():
    assert resolver.search_terms('ABBVIE INC') == ['ABBVIE']
    # A generic tail goes first: "Barclays Services" is a subsidiary's name, "Barclays" the brand.
    assert resolver.search_terms('Barclays Services Corp') == ['Barclays Services', 'Barclays']
    assert resolver.search_terms('AMERICAN EXPRESS TRAVEL RELATED') == [
        'AMERICAN EXPRESS TRAVEL RELATED', 'AMERICAN EXPRESS TRAVEL', 'AMERICAN EXPRESS']
    assert resolver.search_terms('Blue Cross Blue Shield of Massachusettes') == [
        'Blue Cross Blue Shield of Massachusettes', 'Blue Cross Blue Shield', 'Blue Cross Blue']
    assert resolver.search_terms('TBD') == []


def _item(qid, label, *, types=(COMPANY_TYPE,), logo='Logo.svg'):
    return [{'item': {'value': f'http://www.wikidata.org/entity/{qid}'}, 'links': {'value': '20'}, 'label': {'value': label},
             'logo': {'value': f'http://commons.wikimedia.org/wiki/Special:FilePath/{logo}'},
             'class': {'value': f'http://www.wikidata.org/entity/{item_type}'}} for item_type in types]


def test_search_finds_what_the_exact_pass_missed(monkeypatch):
    search = {'ABBVIE': ['Q1', 'Q2'], 'AMERICAN EXPRESS': ['Q3'], 'Bose': ['Q4'], 'Paypal': ['Q5'], 'Kearney': ['Q6']}
    items = (_item('Q1', 'AbbVie') + _item('Q2', 'AbbVie s.r.o.') + _item('Q3', 'American Express')
             + _item('Q4', 'Baise', types=(PLACE_TYPE,)) + _item('Q5', 'PayPal', types=(OTHER_TYPE,))
             + _item('Q6', 'Kearney', types=(PERSON_TYPE,)))

    def query(sparql):
        if 'mwapi' in sparql:
            return [{'term': {'value': term}, 'item': {'value': f'http://www.wikidata.org/entity/{qid}'}, 'ordinal': {'value': str(rank)}}
                    for term, qids in search.items() if f'"{term}"' in sparql for rank, qid in enumerate(qids)]
        if 'VALUES ?root' in sparql:
            return _kind_rows(sparql)
        return [row for row in items if f"wd:{row['item']['value'].rsplit('/', 1)[1]} " in f'{sparql} ']
    monkeypatch.setattr(fetcher, 'query_wikidata', query)
    found = resolver.search_batch(['ABBVIE INC', 'AMERICAN EXPRESS TRAVEL RELATED', 'Bose', 'Paypal', 'Kearney'])
    assert (found['ABBVIE INC']['entity'], found['ABBVIE INC']['searched']) == ('Q1', True)
    # Found only once the name was shortened.
    assert found['AMERICAN EXPRESS TRAVEL RELATED']['entity'] == 'Q3'
    # Wikidata doesn't file PayPal as a company; a search hit only has to be something other than a place or a person.
    assert found['Paypal']['entity'] == 'Q5'
    assert found['Bose'] is None and found['Kearney'] is None
    # A search hit is never sure: it waits for a person.
    assert not any(match['confident'] for match in found.values() if match)


# --- Images -------------------------------------------------------------------------------

MASTERCARD_SVG = 'https://upload.wikimedia.org/wikipedia/commons/b/b7/MasterCard_Logo.svg'
MASTERCARD_PNG = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/MasterCard_Logo.svg/250px-MasterCard_Logo.svg.png'


def test_wikidata_logos_come_from_the_image_server(monkeypatch):
    fetched = []
    monkeypatch.setattr(fetcher, 'fetch_image', lambda url, allowed_hosts=None: fetched.append((url, allowed_hosts)) or ('svg', SAFE_SVG))
    logo = resolver.download({'logo': 'MasterCard Logo.svg', 'website': 'https://www.mastercard.com'})
    assert (logo['source'], logo['ext']) == ('wikidata', 'svg')
    assert fetched == [(MASTERCARD_SVG, resolver.WIKIMEDIA_HOSTS)]


def test_unsafe_svg_falls_back_to_a_png_thumbnail(monkeypatch):
    def fetch(url, allowed_hosts=None):
        if url == MASTERCARD_SVG:
            raise fetcher.FetchRefused('not a valid or safe svg image')
        assert url == MASTERCARD_PNG
        return 'png', PNG
    monkeypatch.setattr(fetcher, 'fetch_image', fetch)
    assert resolver.download({'logo': 'MasterCard Logo.svg'})['ext'] == 'png'


def test_rate_limits_on_the_image_server_are_not_swallowed(monkeypatch):
    def fetch(url, allowed_hosts=None):
        raise fetcher.FetchRefused('HTTP 429', status=429, retry_after=3)
    monkeypatch.setattr(fetcher, 'fetch_image', fetch)
    with pytest.raises(fetcher.FetchRefused):
        resolver.download({'logo': 'MasterCard Logo.svg'})


def test_website_icon_over_https_when_wikidata_has_no_logo(monkeypatch):
    tried = []

    def fetch(url, allowed_hosts=None):
        tried.append(url)
        if url.endswith('/favicon.svg'):
            raise fetcher.FetchRefused('HTTP 404')
        return 'png', PNG
    monkeypatch.setattr(fetcher, 'fetch_image', fetch)
    logo = resolver.download({'website': 'http://www.fabrikam.example/about'})
    assert (logo['source'], logo['website']) == ('website', 'https://www.fabrikam.example')
    assert tried == ['https://www.fabrikam.example/favicon.svg', 'https://www.fabrikam.example/apple-touch-icon.png']


# --- The worker ---------------------------------------------------------------------------

def test_bulk_run_records_every_outcome_with_its_reason(tmp_store, monkeypatch):
    matches = {'Alpha': {'entity': 'Q1', 'label': 'Alpha Inc', 'logo': 'A.svg'}, 'Beta': None,
               'Gamma': {'entity': 'Q3', 'website': 'https://gamma.example'}}
    monkeypatch.setattr(resolver, 'match_batch', lambda names, kinds=None: {name: matches[name] for name in names})
    monkeypatch.setattr(resolver, 'search_batch', lambda names, kinds=None, pause=None: {name: None for name in names})
    monkeypatch.setattr(resolver, 'download', lambda match: {'ext': 'png', 'body': PNG, 'source': 'wikidata'} if match.get('logo') else None)
    worker.run(['Alpha', 'Beta', 'Gamma', 'TBD'], sleep=lambda seconds: None)
    index = store.load_index()
    assert (index['alpha']['status'], index['alpha']['entity'], index['alpha']['label']) == ('found', 'Q1', 'Alpha Inc')
    assert (index['beta']['status'], index['beta']['reason']) == ('missing', 'Not found on Wikidata')
    assert index['gamma']['status'] == 'missing' and index['gamma']['entity'] == 'Q3'
    assert index['tbd']['reason'].startswith('Placeholder')
    assert {entry['lookup'] for entry in index.values()} == {worker.LOOKUP_VERSION}


def test_clients_are_looked_up_once(tmp_store):
    current, older = worker.LOOKUP_VERSION, worker.LOOKUP_VERSION - 1
    store.record('Alpha', 'found', {'ext': 'png', 'body': PNG, 'source': 'wikidata'}, lookup=current)
    store.record('Beta', 'error', lookup=current)
    store.record('Gamma', 'missing', lookup=older)  # no logo with the old matcher: worth another look
    store.record('Zeta', 'found', {'ext': 'png', 'body': PNG, 'source': 'wikidata'}, lookup=older)  # has one: kept
    store.record('Delta', 'missing', validated=True)  # confirmed by a person
    names = ['Alpha', 'Beta', 'Gamma', 'Zeta', 'Delta', 'Epsilon']
    assert worker.pending_names(names) == ['Gamma', 'Epsilon']
    assert worker.pending_names(names, retry_failed=True) == ['Beta', 'Gamma', 'Epsilon']


def test_a_lookup_never_overwrites_what_a_person_decided(tmp_store, monkeypatch):
    store.record('Alpha', 'missing', validated=True)  # "No logo is fine", pressed while a run was going
    monkeypatch.setattr(resolver, 'match_batch', lambda names, kinds=None: {name: {'entity': 'Q1', 'logo': 'A.svg'} for name in names})
    monkeypatch.setattr(resolver, 'download', lambda match: {'ext': 'png', 'body': PNG, 'source': 'wikidata'})
    worker.run(['Alpha'], sleep=lambda seconds: None)
    entry = store.load_index()['alpha']
    assert (entry['status'], entry['validated']) == ('missing', True)


def test_a_failed_search_waits_for_a_retry(tmp_store, monkeypatch):
    monkeypatch.setattr(resolver, 'match_batch', lambda names, kinds=None: {name: None for name in names})
    attempts = []

    def search_batch(names, kinds=None, pause=None):
        attempts.append(names)
        raise fetcher.FetchRefused('HTTP 500', status=500)
    monkeypatch.setattr(resolver, 'search_batch', search_batch)
    waits = []
    worker.run(['Alpha'], sleep=waits.append)
    # A busy search is waited out (a minute, then two) before the client is marked failed.
    assert len(attempts) == worker.ATTEMPTS and [wait for wait in waits if wait >= 60] == [60, 120]
    entry = store.load_index()['alpha']
    assert entry['status'] == 'error' and 'search failed' in entry['reason']
    assert worker.pending_names(['Alpha'], retry_failed=True) == ['Alpha']


def test_the_worker_waits_when_asked_to_retry_later(tmp_store, monkeypatch):
    calls = []

    def match_batch(names, kinds=None):
        calls.append(names)
        if len(calls) == 1:
            raise fetcher.FetchRefused('HTTP 503', status=503, retry_after=7)
        return {name: None for name in names}
    monkeypatch.setattr(resolver, 'match_batch', match_batch)
    monkeypatch.setattr(resolver, 'search_batch', lambda names, kinds=None, pause=None: {name: None for name in names})
    waits = []
    worker.run(['Alpha'], sleep=waits.append)
    assert waits[0] == 7 and store.load_index()['alpha']['status'] == 'missing'


def test_a_batch_that_keeps_failing_is_marked_failed_with_the_reason(tmp_store, monkeypatch):
    def match_batch(names, kinds=None):
        raise fetcher.FetchRefused('HTTP 503', status=503, retry_after=1)
    monkeypatch.setattr(resolver, 'match_batch', match_batch)
    worker.run(['Alpha', 'Beta'], sleep=lambda seconds: None)
    index = store.load_index()
    assert [index[key]['status'] for key in ('alpha', 'beta')] == ['error', 'error']
    assert 'HTTP 503' in index['alpha']['reason']


# --- Routes -------------------------------------------------------------------------------

def _deals(*client_names):
    from core.shared import state
    data = state.load_data()
    data['deals'] = [{'id': str(i), 'client_name': name} for i, name in enumerate(client_names)]
    state.save_data(data)


def test_logo_files_are_named_after_their_clients(tmp_store):
    svg = {'ext': 'svg', 'body': SAFE_SVG, 'source': 'upload'}
    assert store.record('Barclays Services Corp', 'found', svg)['file'] == 'Barclays Services Corp.svg'
    assert store.record('IPG/Acxiom: "US"', 'found', svg)['file'] == 'IPG Acxiom US.svg'  # not allowed in Windows names
    assert store.record('Hubs Inc.', 'found', svg)['file'] == 'Hubs Inc.svg'
    assert store.record('CON', 'found', svg)['file'] == 'CON logo.svg'  # a reserved Windows name
    assert store.record('IPG Acxiom US', 'found', svg)['file'] == 'IPG Acxiom US (2).svg'  # another client, same safe name
    url = tmp_store.get('/api/client-logos/library').get_json()
    assert url and tmp_store.get('/api/client-logos/file/Barclays%20Services%20Corp.svg').status_code == 200


def test_only_files_the_index_lists_are_served(tmp_store):
    import os
    store.record('Contoso', 'found', {'ext': 'png', 'body': PNG, 'source': 'upload'})
    with open(os.path.join(store.cache_dir(), 'stray.png'), 'wb') as handle:
        handle.write(PNG)
    assert tmp_store.get('/api/client-logos/file/Contoso.png').status_code == 200
    assert tmp_store.get('/api/client-logos/file/stray.png').status_code == 404
    assert tmp_store.get('/api/client-logos/file/..%2Fdeals_data.json').status_code == 404


def test_hashed_files_from_an_older_cache_are_renamed_once(tmp_store):
    import os
    store.record('Contoso', 'found', {'ext': 'png', 'body': PNG, 'source': 'wikidata'})
    index = store.load_index()
    os.replace(os.path.join(store.cache_dir(), 'Contoso.png'), os.path.join(store.cache_dir(), '0123456789abcdef0123.png'))
    index['contoso']['file'] = '0123456789abcdef0123.png'
    store._write_index(index)
    assert store.name_files_after_clients() == 1
    assert store.load_index()['contoso']['file'] == 'Contoso.png'
    assert sorted(os.listdir(store.cache_dir())) == ['Contoso.png', 'index.json']
    assert store.name_files_after_clients() == 0


def test_logo_files_are_served_sandboxed(tmp_store):
    store.record('Contoso', 'found', {'ext': 'svg', 'body': SAFE_SVG, 'source': 'wikidata', 'entity': 'Q2'}, confident=True)
    listing = tmp_store.get('/api/client-logos').get_json()
    response = tmp_store.get(listing['logos']['contoso']['url'])
    assert response.status_code == 200 and response.mimetype == 'image/svg+xml'
    assert 'sandbox' in response.headers['Content-Security-Policy']
    assert response.headers['X-Content-Type-Options'] == 'nosniff'
    assert tmp_store.get('/api/client-logos/file/index.json').status_code == 404


def test_the_library_lists_every_client_once(tmp_store):
    _deals('Contoso', 'contoso ', 'CONTOSO', 'Fabrikam', '')
    store.record('Contoso', 'found', {'ext': 'png', 'body': PNG, 'source': 'wikidata'}, entity='Q2', label='Contoso Ltd')
    clients = {client['key']: client for client in tmp_store.get('/api/client-logos/library').get_json()['clients']}
    assert set(clients) == {'contoso', 'fabrikam'}
    contoso = clients['contoso']
    assert (contoso['name'], contoso['deals'], contoso['status'], contoso['label']) == ('Contoso', 3, 'found', 'Contoso Ltd')
    assert contoso['url'].startswith('/api/client-logos/file/') and contoso['validated'] is False
    assert clients['fabrikam']['status'] == 'pending'


def _review(client, action, **body):
    return client.post('/api/client-logos/override', json={'client_name': 'Contoso', 'action': action, **body})


def test_unsure_logos_stay_off_the_tiles_until_approved(tmp_store):
    store.record('Contoso', 'found', {'ext': 'png', 'body': PNG, 'source': 'wikidata'}, confident=False)
    assert tmp_store.get('/api/client-logos').get_json()['logos'] == {}
    _review(tmp_store, 'approve')
    assert list(tmp_store.get('/api/client-logos').get_json()['logos']) == ['contoso']


def test_a_person_can_approve_or_hide_a_logo(tmp_store):
    store.record('Contoso', 'found', {'ext': 'png', 'body': PNG, 'source': 'wikidata'}, confident=True)
    assert _review(tmp_store, 'approve').get_json()['validated'] is True
    assert _review(tmp_store, 'unapprove').get_json()['validated'] is False
    hidden = _review(tmp_store, 'hide').get_json()
    assert (hidden['status'], hidden['validated']) == ('hidden', True)
    listing = tmp_store.get('/api/client-logos').get_json()
    assert listing['logos'] == {} and listing['hidden'] == ['contoso']
    assert _review(tmp_store, 'show').get_json()['status'] == 'found'


def test_confirming_a_failed_lookup_means_no_logo(tmp_store):
    store.record('Contoso', 'error', reason='HTTP 503')
    assert _review(tmp_store, 'approve').get_json() == {'client': 'contoso', 'status': 'missing', 'validated': True, 'url': None}


def test_a_logo_can_come_from_a_website_or_a_wikidata_item(tmp_store, monkeypatch):
    assert _review(tmp_store, 'use', source='contoso.example').status_code == 400
    assert _review(tmp_store, 'website', website='http://contoso.example').status_code == 400
    monkeypatch.setattr(resolver, 'match_item', lambda entity: {'entity': entity, 'label': 'Contoso Ltd', 'logo': 'C.svg'})
    monkeypatch.setattr(resolver, 'download', lambda match: {'ext': 'svg', 'body': SAFE_SVG, 'source': 'wikidata'})
    assert _review(tmp_store, 'use', source='https://www.wikidata.org/wiki/Q95').get_json()['status'] == 'found'
    entry = store.load_index()['contoso']
    assert (entry['entity'], entry['label'], entry['manual'], entry['validated']) == ('Q95', 'Contoso Ltd', True, True)
    monkeypatch.setattr(resolver, 'logo_from_website', lambda site: {'ext': 'png', 'body': PNG, 'source': 'website', 'website': site})
    assert _review(tmp_store, 'use', source='https://contoso.example').get_json()['status'] == 'found'
    assert store.load_index()['contoso']['source'] == 'website'


def test_lookups_start_for_new_clients_and_failed_ones_on_request(tmp_store, monkeypatch):
    _deals('Contoso', 'contoso ', '')
    started = []
    monkeypatch.setattr(worker, 'start', lambda names, **options: started.append((names, options)) or True)
    assert tmp_store.post('/api/client-logos/resolve', json={}).get_json()['started'] is True
    tmp_store.post('/api/client-logos/resolve', json={'retry_failed': True})
    assert started == [(['Contoso', 'contoso '], {'retry_failed': False}), (['Contoso', 'contoso '], {'retry_failed': True})]
    assert _review(tmp_store, 'retry').status_code == 200
    assert started[-1] == (['Contoso'], {'force': True})


def test_logo_routes_refuse_foreign_hosts(tmp_store):
    assert tmp_store.get('/api/client-logos', base_url='http://evil.example:5121').status_code == 403
    assert tmp_store.get('/api/client-logos/library', base_url='http://evil.example:5121').status_code == 403


def test_wikipedia_links_are_read_the_way_wikidata_stores_them():
    assert resolver.wikipedia_article('https://en.m.wikipedia.org/wiki/AT%26T#History') == 'https://en.wikipedia.org/wiki/AT%26T'
    assert resolver.wikipedia_article('https://en.wikipedia.org/wiki/Procter & Gamble') == 'https://en.wikipedia.org/wiki/Procter_%26_Gamble'
    assert resolver.wikipedia_article('https://www.wikipedia.org/') is None
    assert resolver.wikipedia_article('https://evil.example/wiki/Avangrid') is None


def test_an_article_logo_that_only_wikipedia_has(monkeypatch):
    monkeypatch.setattr(resolver, 'entity_for_article', lambda url: 'Q5983823')
    monkeypatch.setattr(resolver, 'match_item', lambda entity: {'entity': entity, 'label': 'Avangrid', 'logo': None, 'website': None})
    lead = 'https://thumb.wikimedia.org/wikipedia/en/thumb/d/df/Avangrid_Logo_2023.svg/960px-Avangrid_Logo_2023.svg.png?utm_source=x'
    monkeypatch.setattr(fetcher, 'wikipedia_summary', lambda lang, title: {'originalimage': {'source': lead}})
    fetched = []
    monkeypatch.setattr(fetcher, 'fetch_image', lambda url, allowed_hosts=None: fetched.append(url) or ('svg', SAFE_SVG))
    logo, match = resolver.logo_from_article('https://en.wikipedia.org/wiki/Avangrid')
    assert (logo['source'], match['entity']) == ('wikipedia', 'Q5983823')
    # Taken from Wikimedia's own image server, the original file rather than the thumbnail it linked.
    assert fetched == [resolver.upload_url('Avangrid_Logo_2023.svg', project='wikipedia/en')]
    assert fetched[0].startswith('https://upload.wikimedia.org/wikipedia/en/')


def test_a_pasted_wikipedia_link_is_never_used_as_a_website(tmp_store, monkeypatch):
    assert _review(tmp_store, 'use', source='https://www.wikipedia.org/').status_code == 400
    monkeypatch.setattr(resolver, 'logo_from_article', lambda url: ({'ext': 'svg', 'body': SAFE_SVG, 'source': 'wikipedia'}, {'entity': 'Q1'}))
    assert _review(tmp_store, 'use', source='https://en.wikipedia.org/wiki/Contoso').get_json()['status'] == 'found'
    entry = store.load_index()['contoso']
    assert (entry['source'], entry['entity'], entry['validated']) == ('wikipedia', 'Q1', True)


def _upload(client, body, *, file_name='logo.png', origin=None):
    return client.post('/api/client-logos/upload', data={'client_name': 'Contoso', 'file': (io.BytesIO(body), file_name)},
                       content_type='multipart/form-data', headers={'Origin': origin} if origin else {})


def test_an_uploaded_logo_is_checked_by_its_bytes(tmp_store):
    assert _upload(tmp_store, b'<html><body>hello</body></html>', file_name='logo.svg').status_code == 400
    assert _upload(tmp_store, b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', file_name='logo.svg').status_code == 400
    assert _upload(tmp_store, PNG + b'\x00' * fetcher.MAX_IMAGE_BYTES).status_code == 400
    # The bytes decide the type, never the file name.
    assert _upload(tmp_store, SAFE_SVG, file_name='logo.png').status_code == 200
    entry = store.load_index()['contoso']
    assert (entry['status'], entry['source'], entry['validated'], entry['file'].endswith('.svg')) == ('found', 'upload', True, True)


def test_uploads_from_other_sites_are_refused(tmp_store):
    assert _upload(tmp_store, PNG, origin='https://evil.example').status_code == 403
    assert _upload(tmp_store, PNG, origin='http://localhost:5120').status_code == 200
