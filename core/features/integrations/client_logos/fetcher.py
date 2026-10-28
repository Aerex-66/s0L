"""
The only outside fetches for client logos (sources approved by the user, 2026-10-27):
name lookups on Wikidata's query service, and image downloads from Wikimedia's image
server or the client's own website. Downloads must be HTTPS, from public addresses, small,
and an image by both declared type and content; SVGs that could run or load anything are
refused.
"""
import ipaddress
import json
import socket
import urllib.error
import urllib.parse
import urllib.request

from defusedxml import ElementTree as SafeET
from defusedxml.common import DefusedXmlException

USER_AGENT = 's0L/1.0 (IBM internal deal tracker; client logos; https://github.com/Aerex-66/s0L)'
# The query service, not the Action API: Wikimedia's 2026 per-minute API limits refuse most
# requests from a shared office network.
WIKIDATA_QUERY = 'https://query.wikidata.org/sparql'
WIKIDATA_QUERY_HOSTS = frozenset({'query.wikidata.org'})
TIMEOUT_SECONDS = 5  # images are small; a site that hangs on an icon path is skipped quickly
QUERY_TIMEOUT_SECONDS = 60
MAX_IMAGE_BYTES = 512 * 1024
MAX_JSON_BYTES = 8 * 1024 * 1024
MAX_REDIRECTS = 3
THROTTLE_CODES = frozenset({429, 503})

IMAGE_TYPES = {
    'image/svg+xml': 'svg',
    'image/png': 'png',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
}
_SVG_BANNED_TAGS = frozenset({'script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'handler', 'listener'})
_REDIRECT_CODES = frozenset({301, 302, 303, 307, 308})


class FetchRefused(Exception):
    def __init__(self, message, status=None, retry_after=None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after

    @property
    def throttled(self):
        """The server asked us to slow down (rate limit or overload)."""
        return self.status in THROTTLE_CODES


def _retry_after(headers):
    try:
        return max(0, int(headers.get('Retry-After')))
    except (AttributeError, TypeError, ValueError):
        return None


class _NoAutoRedirect(urllib.request.HTTPRedirectHandler):
    # Every hop is re-checked by hand, so urllib must not follow redirects itself.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_opener = urllib.request.build_opener(_NoAutoRedirect)


def _check_url(url, allowed_hosts):
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != 'https' or not parts.hostname:
        raise FetchRefused('only https addresses are fetched')
    if parts.username or parts.password:
        raise FetchRefused('addresses with credentials are refused')
    host = parts.hostname.lower()
    if allowed_hosts is not None and host not in allowed_hosts:
        raise FetchRefused(f'{host} is not an allowed host')
    try:
        addresses = socket.getaddrinfo(host, parts.port or 443, proto=socket.IPPROTO_TCP)
    except OSError:
        raise FetchRefused(f'{host} could not be resolved') from None
    for address in addresses:
        if not ipaddress.ip_address(address[4][0]).is_global:
            raise FetchRefused(f'{host} is not a public address')


def _request(url, *, allowed_hosts, accept, limit, data=None, timeout=TIMEOUT_SECONDS):
    """GET (or a form POST, which never follows redirects) with every redirect re-checked;
    returns (content_type, body)."""
    for _ in range(MAX_REDIRECTS + 1):
        _check_url(url, allowed_hosts)
        headers = {'User-Agent': USER_AGENT, 'Accept': accept}
        if data is not None:
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        request = urllib.request.Request(url, data=data, headers=headers)
        try:
            with _opener.open(request, timeout=timeout) as response:
                content_type = (response.headers.get('Content-Type') or '').split(';')[0].strip().lower()
                body = response.read(limit + 1)
        except urllib.error.HTTPError as error:
            location = error.headers.get('Location') if error.headers else None
            if error.code in _REDIRECT_CODES and location and data is None:
                url = urllib.parse.urljoin(url, location)
                continue
            raise FetchRefused(f'HTTP {error.code}', status=error.code,
                               retry_after=_retry_after(error.headers)) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise FetchRefused('unreachable') from None
        if len(body) > limit:
            raise FetchRefused('response too large')
        return content_type, body
    raise FetchRefused('too many redirects')


def query_wikidata(sparql):
    """Result rows from Wikidata's query service (the only non-image request)."""
    data = urllib.parse.urlencode({'query': sparql}).encode('utf-8')
    content_type, body = _request(WIKIDATA_QUERY, allowed_hosts=WIKIDATA_QUERY_HOSTS,
                                  accept='application/sparql-results+json', limit=MAX_JSON_BYTES,
                                  data=data, timeout=QUERY_TIMEOUT_SECONDS)
    if content_type not in ('application/sparql-results+json', 'application/json'):
        raise FetchRefused('Wikidata did not answer with JSON')
    try:
        return json.loads(body.decode('utf-8'))['results']['bindings']
    except (ValueError, KeyError, TypeError):
        raise FetchRefused('Wikidata answered with broken JSON') from None


def wikipedia_summary(lang, title):
    """Wikipedia's summary of one article (its lead image), for a link a person pasted."""
    host = f'{lang}.wikipedia.org'
    url = f'https://{host}/api/rest_v1/page/summary/{urllib.parse.quote(title, safe="")}'
    content_type, body = _request(url, allowed_hosts={host}, accept='application/json', limit=MAX_JSON_BYTES)
    if content_type != 'application/json':
        raise FetchRefused('Wikipedia did not answer with JSON')
    try:
        return json.loads(body.decode('utf-8'))
    except ValueError:
        raise FetchRefused('Wikipedia answered with broken JSON') from None


def is_safe_svg(body):
    """An SVG that can't run script or load anything: no scripts, handlers or outside references."""
    try:
        root = SafeET.fromstring(body)
    except (SafeET.ParseError, DefusedXmlException, ValueError):
        return False
    if root.tag.rsplit('}', 1)[-1].lower() != 'svg':
        return False
    for element in root.iter():
        tag = str(element.tag).rsplit('}', 1)[-1].lower()
        if tag in _SVG_BANNED_TAGS:
            return False
        if tag == 'style' and ('@import' in (element.text or '') or 'url(' in (element.text or '').replace('url(#', '')):
            return False
        for name, value in element.attrib.items():
            local = name.rsplit('}', 1)[-1].lower()
            if local.startswith('on'):
                return False
            if local == 'href' and not value.strip().startswith('#'):
                return False
            if 'url(' in value.replace('url(#', '') or 'javascript:' in value.lower():
                return False
    return True


def _looks_like(ext, body):
    if ext == 'png':
        return body.startswith(b'\x89PNG\r\n\x1a\n')
    if ext == 'jpg':
        return body.startswith(b'\xff\xd8\xff')
    if ext == 'ico':
        return body.startswith(b'\x00\x00\x01\x00')
    if ext == 'webp':
        return body[:4] == b'RIFF' and body[8:12] == b'WEBP'
    if ext == 'svg':
        return is_safe_svg(body)
    return False


def fetch_image(url, *, allowed_hosts=None):
    """Download one image; returns (ext, body). Anything that isn't a valid, safe image is refused."""
    content_type, body = _request(url, allowed_hosts=allowed_hosts,
                                  accept='image/svg+xml,image/png,image/x-icon,image/*;q=0.8', limit=MAX_IMAGE_BYTES)
    ext = IMAGE_TYPES.get(content_type)
    if not ext:
        raise FetchRefused(f'not an image ({content_type or "no type"})')
    if not _looks_like(ext, body):
        raise FetchRefused(f'not a valid or safe {ext} image')
    return ext, body


def sniff_image(body):
    """The type of an uploaded logo, judged by its own bytes (never its name); refused unless
    it's a valid, safe image under the size limit."""
    if len(body) > MAX_IMAGE_BYTES:
        raise FetchRefused('the file is over 512 KB')
    for ext in ('png', 'jpg', 'webp', 'ico', 'svg'):
        if _looks_like(ext, body):
            return ext
    raise FetchRefused('not a valid or safe image')
