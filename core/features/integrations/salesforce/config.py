"""Fixed facts about the Salesforce connection. The org's address and the app's consumer key are provisioned per machine."""

API_VERSION = '62.0'
SCOPES = 'api refresh_token'
REDIRECT_URI = 'http://localhost:5121/api/salesforce/oauth/callback'

AUTHORIZE_PATH = '/services/oauth2/authorize'
TOKEN_PATH = '/services/oauth2/token'
REVOKE_PATH = '/services/oauth2/revoke'

BATCH_SIZE = 200
