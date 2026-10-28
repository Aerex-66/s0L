"""Fixed facts about the monday.com connection: the deal board, the IBM account and s0L's own monday app."""

BOARD_ID = '9150394800'
ACCOUNT_SLUG = 'ibm'
BOARD_URL = f'https://{ACCOUNT_SLUG}.monday.com/boards/{BOARD_ID}'

API_URL = 'https://api.monday.com/v2'
API_VERSION = '2026-07'

AUTHORIZE_URL = 'https://auth.monday.com/oauth2/authorize'
TOKEN_URL = 'https://auth.monday.com/oauth_ms/oauth/token'
REVOKE_URL = 'https://auth.monday.com/oauth_ms/oauth/revoke'
SCOPES = 'me:read boards:read boards:write'
REDIRECT_URI = 'http://localhost:5121/api/monday/oauth/callback'
