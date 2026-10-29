"""Salesforce REST client. It only reads: it describes objects and queries opportunities by ID."""
import re
import urllib.parse

from core.features.integrations.salesforce import config, credentials, oauth

SIGN_IN_AGAIN = 'Sign in to Salesforce again: click the Salesforce icon at the top of s0L.'
NO_API = ("Your Salesforce profile doesn't have API access yet. IBM's Salesforce admins need to give you "
          "s0L's permission set.")
_OPPORTUNITY_ID = re.compile(r'006[A-Za-z0-9]{15}')


class SalesforceError(Exception):
    def __init__(self, kind, message):
        super().__init__(message)
        self.kind = kind


def _call(get_value):
    try:
        return get_value()
    except oauth.NotConnected:
        raise SalesforceError('not_connected', SIGN_IN_AGAIN) from None
    except oauth.OAuthError:
        raise SalesforceError('network', 'Could not renew the Salesforce sign-in. Try again in a minute.') from None


def _url(path):
    instance = _call(oauth.instance_url)
    if path.startswith('/services/'):
        return instance + path
    return f'{instance}/services/data/v{config.API_VERSION}{path}'


def _message(body, status):
    items = body if isinstance(body, list) else [body]
    found = next((item.get('message') for item in items if isinstance(item, dict) and item.get('message')), None)
    return found or f'Salesforce answered with HTTP {status}.'


def get(path):
    """GET a REST resource: a path under the pinned API version ('/sobjects'), or a '/services/…' path Salesforce gave."""
    url = _url(path)
    token = _call(oauth.access_token)
    refreshed = False
    while True:
        status, body, _ = oauth.request('GET', url, headers={'Authorization': f'Bearer {token}'})
        if status == 401:
            if refreshed:
                # Still refused after a fresh token: access was removed, so forget it and offer Connect.
                credentials.clear_token()
                raise SalesforceError('not_connected', SIGN_IN_AGAIN)
            stale = token
            token = _call(lambda: oauth.refresh(stale_token=stale))
            refreshed = True
            continue
        if status == 0:
            raise SalesforceError('network', 'Could not reach Salesforce. Check your connection.')
        codes = oauth.error_codes(body)
        if codes & oauth.NO_API_CODES:
            raise SalesforceError('no_api', NO_API)
        if 'REQUEST_LIMIT_EXCEEDED' in codes:
            raise SalesforceError('rate_limited', "Salesforce has had too many requests from IBM today. Try again later.")
        if status != 200:
            raise SalesforceError('api', _message(body, status))
        return body


def query(soql):
    body = get('/query?' + urllib.parse.urlencode({'q': soql}))
    records = list(body.get('records') or [])
    while not body.get('done', True) and body.get('nextRecordsUrl'):
        body = get(body['nextRecordsUrl'])
        records.extend(body.get('records') or [])
    return records


def describe(sobject):
    return get(f'/sobjects/{urllib.parse.quote(sobject)}/describe')


def objects():
    """Every object the signed-in person can see (name, label, queryable, custom…)."""
    return get('/sobjects').get('sobjects') or []


def opportunities(ids, fields):
    """The opportunities Salesforce returns for these 18-character IDs, BATCH_SIZE IDs per query."""
    wanted = [record_id for record_id in ids if _OPPORTUNITY_ID.fullmatch(record_id)]
    columns = ', '.join(['Id', *[field for field in fields if field != 'Id']])
    found = []
    for start in range(0, len(wanted), config.BATCH_SIZE):
        listed = ', '.join(f"'{record_id}'" for record_id in wanted[start:start + config.BATCH_SIZE])
        found.extend(query(f'SELECT {columns} FROM Opportunity WHERE Id IN ({listed})'))
    return found
