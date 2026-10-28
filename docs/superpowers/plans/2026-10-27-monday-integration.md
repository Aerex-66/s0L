# monday.com Integration Implementation Plan

> **Parked (2026-10-27):** the user narrowed the first build to sign-in plus read-only sync. Build [2026-10-27-monday-sign-in-and-sync.md](2026-10-27-monday-sign-in-and-sync.md) instead. This plan stays only as the reference for Phase 2 (writing to monday). Where it overlaps the new plan, the new plan wins.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every row of the monday.com board "Business Apps – Deal Pipeline" becomes a full s0L deal in the board's own words. s0L can also add new rows and change TCV and Status on existing rows, but only after the user confirms each write.

**Architecture:** A new Flask blueprint, `core/features/integrations/monday/`, is the only code that talks to monday. It covers sign-in through s0L's own monday app (OAuth 2.1 + PKCE), a GraphQL client, a board-schema cache, a mapping driven by `shared/field_index.json`, a refresh planner (preview → apply) and a push gate (preview → send). Board fields get a new index owner, `monday`. The existing write gate refuses them on linked deals, and one writer function is the only code that stores them. On the React side: `mondayService`, a small store, board-driven dropdowns with read-only states, one confirmation dialog for every write, and a Connections tab.

**Tech Stack:** Flask 3 on Python 3.14 (stdlib `urllib`, `ctypes` for DPAPI; no new Python dependencies), React 19 + Vite + Zustand, pytest, Vitest, monday platform API version `2026-07` (GraphQL).

**Spec:** [docs/superpowers/specs/2026-10-27-monday-integration-design.md](../specs/2026-10-27-monday-integration-design.md)

## Before Task 1 (the user, once)

1. `main` has uncommitted UI work in files this plan edits (`AppHeader.jsx`, `DealList.jsx`, `NewDealModal.jsx`, `PipelineMetrics.jsx`, `UI_ARCHITECTURE.md`, `.github/copilot-instructions.md`, and others). Ask the user to commit or stash it. Never commit it for them. Then run `git checkout -b feat/monday-integration`.
2. In the monday Developer Center, open app "s0L" → **OAuth & Permissions** on the live version and check:
   - **New OAuth Flow** is on.
   - Scopes are `boards:read`, `boards:write` and `me:read`.
   - The redirect URL is `http://localhost:5121/api/monday/oauth/callback`.

   If the toggle is off, create a draft version, turn it on, then **Publish**.
3. Check that the baseline is green: `python -m pytest -q` (61 passed) and `npm --prefix frontend test` (95 passed), as of 2026-10-27.

## Global Constraints

- Only Flask calls monday: `https://api.monday.com/v2` (headers `API-Version: 2026-07`, `Authorization: <access token>`) and `https://auth.monday.com`. The browser only visits monday's sign-in page.
- Board `9150394800`, account slug `ibm`, scopes `boards:read boards:write me:read`, redirect `http://localhost:5121/api/monday/oauth/callback`.
- The client ID and secret and the access and refresh tokens live only in `%LOCALAPPDATA%\s0L\monday\`, DPAPI-encrypted for the current Windows user. No route returns them, nothing logs them, and they're never stored with deal data.
- Every monday field is declared once in `shared/field_index.json` with `"monday": {"column_id": …, "title": …}`. Run `npm run registry` after every index edit. The index is never edited at runtime.
- One owner per field: only `writer.write_monday_fields()` stores monday-owned fields. No client-facing route accepts monday-owned values.
- Writes to monday are content only, always with `create_labels_if_missing: false`. Never create, rename or delete columns, groups or labels. Never delete, archive or move rows. Never write people columns.
- On existing rows, only TCV ($M) `numeric_mkqyh0mz` and Status `color_mkqypejx` may change. New rows are allowed. Every write and every refresh apply needs a preview id that works once and expires after 10 minutes.
- TCV is in millions on the board: multiply by 1,000,000 coming in and divide going out, using `decimal.Decimal`.
- Opportunity IDs are stored verbatim (they're case-sensitive Salesforce IDs).
- Closed (Archives) = Sales Stage `Won`, `Lost` or `Submitted`.
- No real board data goes in git. Tests use a synthetic fixture with the real column ids. `monday_board_cache.json`, `monday_audit.jsonl` and `monday-app.json` are gitignored.
- Tests never touch `deals_data.json` (use `tmp_store`) or the real secrets folder (use the `vault` fixture).
- Use `python` (3.14 on this PC; `python3` is a Microsoft Store stub). Flask runs without a reloader, so after backend changes, restart the `backend dev server` task before any live check.
- Frontend: deal I/O goes through `shared/services/dealService.js`, monday I/O through `shared/services/mondayService.js`. Features never import other features. UI follows DESIGN.md: tokens only, square corners, `.chip` for badges, `Modal` for dialogs, `.btn-primary` for the one primary action, icon-only header.
- No file inside the GSSM sync boundary changes. If one must, add a GSSM_SYNC.md entry.
- Never automate the user's monday browser tab. The user does live sign-ins in Edge or Chrome.
- Commits stage only this plan's changes (use `git add -p` on files that had other edits).

## Review Focus

- The access token expires in the middle of a paginated board read. The client should refresh once and finish, with nothing partially applied. Pinned by `test_fetch_board_refreshes_on_401_mid_pagination` (Task 3).
- Two requests refresh at the same moment. monday rotates refresh tokens, so a second refresh would sign the user out. Exactly one refresh must happen. Pinned by `test_concurrent_access_token_refreshes_once` (Task 2).
- A board label is renamed after s0L stored it, and the user sends the old label. The send must be refused before anything reaches monday, in plain words. Pinned by `test_push_preview_rejects_label_not_on_board` (Task 8).
- The backend restarted, or 10 minutes passed, between preview and apply or send. The response is 410 "This preview expired. Run it again." and nothing is written. Pinned by `test_apply_with_expired_preview_is_410` (Task 7) and `test_send_with_expired_preview_is_410` (Task 8).
- Someone edits the opportunity ID in a linked row's name on the board. The deal stays linked by item id and its opportunity number updates; no second deal appears. Pinned by `test_renamed_item_updates_linked_deal` (Task 7).

## File Structure

- **Create (backend)** `core/features/integrations/__init__.py` and `core/features/integrations/monday/`:
  - `config.py`: constants
  - `credentials.py`: DPAPI store
  - `provision.py`: CLI that saves the app credentials
  - `oauth.py`: sign-in, refresh, revoke, plus the one HTTP function
  - `client.py`: GraphQL
  - `schema.py`: board-schema normalizer and cache
  - `mapping.py`: row ↔ deal values
  - `writer.py`: the only monday-field writer
  - `previews.py`: single-use preview ids
  - `sync.py`: refresh plan and apply
  - `push.py`: write previews, send, audit
  - `routes.py`: the blueprint
- **Modify (backend)** `core/app_factory.py`, `core/shared/field_index.py`, `core/shared/migrations.py`, `core/features/deals/writes.py`, `core/features/deals/services.py`, `shared/field_index.json`, `scripts/build-field-registry.mjs`, `FIELD_REGISTRY.md` (generated), `.gitignore`, `package.json`.
- **Tests** `tests/conftest.py` (fixtures `vault`, `fake_monday`, `jwt`, `board`), `tests/fixtures/monday_board.json`, and `tests/test_monday_{credentials,oauth,client,mapping,writer,sync,push}.py`. Also update `tests/test_field_index.py`, `test_ownership.py`, `test_migrations.py`, `test_isbd_roundtrip.py` and `test_review_fixes.py`.
- **Create (frontend)**
  - `shared/services/mondayService.js`
  - `shared/mondayStore.js`
  - `shared/constants/boardOptions.js` (+ test)
  - `shared/constants/uiStates.test.js`
  - `shared/ui/BoardSelect.jsx`
  - `shared/ui/MondayPushDialog.jsx`
  - `features/settings/components/ConnectionsTab.jsx`
- **Modify (frontend)**
  - `shared/constants/{fieldIndex.js, fieldIndex.test.js, uiStates.js, referenceData.js, deal_constants.json}`
  - `shared/utils/gssmBridge.test.js`, `shared/useStore.js`, `shared/ui/Icons.jsx`
  - `App.jsx`, `AppHeader.jsx`
  - `features/settings/components/Settings.jsx`
  - `features/deals/components/{DealDetailsPanel, NewDealModal, DealList, ExportModal, PipelineMetrics}.jsx`
  - `features/metrics/MetricsModule.jsx`
  - `features/home/components/{QuickSetupWizard.jsx, wizard/WizardSteps.jsx}`
  - `features/isbd/{isbdSave.js, isbdSave.test.js, isbdPrefillMap.js, PptSlideView.jsx, IsbdModule.jsx}`
- **Docs** `UI_ARCHITECTURE.md`, `.github/copilot-instructions.md`. Each is updated in the task that changes the structure.

---

### Task 1: Encrypted credential store and the provisioning command

**Files:**
- Create: `core/features/integrations/__init__.py` (empty), `core/features/integrations/monday/__init__.py` (empty), `…/monday/config.py`, `…/monday/credentials.py`, `…/monday/provision.py`
- Modify: `tests/conftest.py`, `.gitignore`, `package.json`
- Test: `tests/test_monday_credentials.py`

**Interfaces:**
- Produces, in `config.py`:
  - `BOARD_ID = '9150394800'`, `ACCOUNT_SLUG = 'ibm'`, `BOARD_URL = 'https://ibm.monday.com/boards/9150394800'`
  - `API_URL = 'https://api.monday.com/v2'`, `API_VERSION = '2026-07'`
  - `AUTHORIZE_URL = 'https://auth.monday.com/oauth2/authorize'`, `TOKEN_URL = 'https://auth.monday.com/oauth_ms/oauth/token'`, `REVOKE_URL = 'https://auth.monday.com/oauth_ms/oauth/revoke'`
  - `SCOPES = 'boards:read boards:write me:read'`, `REDIRECT_URI = 'http://localhost:5121/api/monday/oauth/callback'`, `PREVIEW_TTL_SECONDS = 600`
- Produces, in `credentials.py`:
  - `SECRETS_DIR: str` = `%LOCALAPPDATA%\s0L\monday`
  - `protect(data: bytes) -> bytes` and `unprotect(blob: bytes) -> bytes`
  - `save_app(client_id: str, client_secret: str) -> None`, `load_app() -> dict | None`
  - `save_session(session: dict) -> None`, `load_session() -> dict | None`, `clear_session() -> None`
- Produces, in `provision.py`: `main(argv: list[str] | None = None) -> int`

- [ ] **Step 1: Add the `vault` fixture to `tests/conftest.py` and write the failing tests**

```python
@pytest.fixture
def vault(tmp_path, monkeypatch):
    """Throwaway secrets folder with a reversible stand-in for DPAPI."""
    from core.features.integrations.monday import credentials
    monkeypatch.setattr(credentials, 'SECRETS_DIR', str(tmp_path / 'vault'))
    monkeypatch.setattr(credentials, 'protect', lambda b: b[::-1])
    monkeypatch.setattr(credentials, 'unprotect', lambda b: b[::-1])
    return tmp_path / 'vault'
```

```python
# tests/test_monday_credentials.py
def test_app_credentials_roundtrip_without_plaintext(vault):
    credentials.save_app('cid-1', 'sek-ret-2')
    assert credentials.load_app() == {'client_id': 'cid-1', 'client_secret': 'sek-ret-2'}
    assert b'sek-ret-2' not in (vault / 'app.bin').read_bytes()

def test_session_roundtrip_and_clear(vault):
    credentials.save_session({'access_token': 'a', 'refresh_token': 'r'})
    assert credentials.load_session()['refresh_token'] == 'r'
    credentials.clear_session(); credentials.clear_session()
    assert credentials.load_session() is None

@pytest.mark.skipif(sys.platform != 'win32', reason='DPAPI is Windows-only')
def test_real_dpapi_roundtrip():
    assert credentials.unprotect(credentials.protect(b'x' * 40)) == b'x' * 40

def test_import_saves_then_deletes_the_file(vault, tmp_path, capsys):
    src = tmp_path / 'monday-app.json'
    src.write_text(json.dumps({'client_id': 'cid', 'client_secret': 'shh'}))
    assert provision.main(['--import', str(src)]) == 0
    assert credentials.load_app() == {'client_id': 'cid', 'client_secret': 'shh'}
    assert not src.exists() and 'shh' not in capsys.readouterr().out

def test_import_missing_file_skips(vault, tmp_path):
    assert provision.main(['--import', str(tmp_path / 'none.json')]) == 0
    assert credentials.load_app() is None

def test_import_bad_file_is_kept(vault, tmp_path):
    src = tmp_path / 'monday-app.json'; src.write_text('{"client_id": ""}')
    assert provision.main(['--import', str(src)]) == 2
    assert src.exists() and credentials.load_app() is None

def test_prompt_mode_hides_the_secret(vault, monkeypatch):
    monkeypatch.setattr('builtins.input', lambda prompt: 'cid')
    monkeypatch.setattr(provision.getpass, 'getpass', lambda prompt: 'shh')
    assert provision.main([]) == 0
    assert credentials.load_app()['client_secret'] == 'shh'
```

- [ ] **Step 2:** Run `python -m pytest tests/test_monday_credentials.py -q`. Expected: FAIL with `ModuleNotFoundError: core.features.integrations`.

- [ ] **Step 3: Implement `config.py`, `credentials.py` and `provision.py`**
  - **`protect` / `unprotect`:** call `CryptProtectData` / `CryptUnprotectData` (crypt32) through `ctypes`. Use `CRYPTPROTECT_UI_FORBIDDEN`, entropy `b's0L/monday'`, and `LocalFree` on the output blob. On a non-Windows platform, raise `RuntimeError('DPAPI needs Windows')`.
  - **Storage:** files are `app.bin` (JSON `{client_id, client_secret}`) and `session.bin`. Write them atomically (temp file + `os.replace`) and create the folder on demand.
  - **`provision` CLI:**
    - With no arguments, it calls `input('monday Client ID: ')` and `getpass.getpass('monday Client Secret (input hidden): ')`. Both must be non-empty, or it returns 1. It prints `Saved monday app credentials for this Windows user.`
    - `--import PATH` saves the credentials, deletes the file and prints `Imported monday app credentials.`
    - If PATH is missing, it prints `No PATH found; skipping.` and returns 0.
    - If the JSON or its keys are invalid, it prints `PATH is not a valid monday app file.` and returns 2.
    - It never prints either value. It runs as a module through `if __name__ == '__main__': sys.exit(main())`.

- [ ] **Step 4:** Run `python -m pytest tests/test_monday_credentials.py -q`. Expected: 7 passed.

- [ ] **Step 5: Wire up the install**
  - In `.gitignore`, add `monday_board_cache.json`, `monday_audit.jsonl` and `monday-app.json` under "Live deal data".
  - In `package.json`, add the script `"monday:provision": "python -m core.features.integrations.monday.provision"`.
  - Append `&& python -m core.features.integrations.monday.provision --import monday-app.json` to `install:all`.

- [ ] **Step 6: Live (user):** run `npm run monday:provision` and enter the Client ID and Client Secret from the app's **Basic Information** page. Expected: `Saved monday app credentials for this Windows user.`

- [ ] **Step 7: Commit**

```powershell
git add core/features/integrations tests/conftest.py tests/test_monday_credentials.py .gitignore package.json
git commit -m "feat(monday): DPAPI credential store and provisioning command"
```

---

### Task 2: Sign in with monday (OAuth 2.1 + PKCE), status and disconnect

**Files:**
- Create: `core/features/integrations/monday/oauth.py`, `…/monday/routes.py`
- Modify: `core/app_factory.py` (register `monday_blueprint`), `tests/conftest.py` (`fake_monday`, `jwt`), `UI_ARCHITECTURE.md` (Layer 4 table: integrations blueprint row), `.github/copilot-instructions.md` (backend structure tree)
- Test: `tests/test_monday_oauth.py`

**Interfaces:**
- Consumes: `credentials.*` and `config.*` from Task 1.
- Produces, in `oauth.py`:
  - `post_json(url: str, payload: dict, headers: dict | None = None, timeout: int = 30) -> tuple[int, dict, dict]`: `(status, json body or {}, response headers)`. This is the only HTTP function. Status is 0 on a network error or timeout. Task 3 uses it too.
  - `class OAuthError(Exception)` with `.reason` in `{'not_configured', 'bad_state', 'denied', 'exchange_failed', 'refresh_failed'}`.
  - `class NotConnected(Exception)`
  - `begin() -> str` (authorize URL), `finish(state: str, code: str) -> dict` (user `{id, name}`)
  - `access_token() -> str`, `refresh(stale_token: str | None = None) -> str`
  - `disconnect() -> None`, `status() -> dict` (`{app_configured, connected, user}`), `jwt_exp(token: str) -> float | None`
- Produces, in `routes.py`: `monday_blueprint` with these routes:
  - `GET /api/monday/status`: `status()` plus `last_sync` (Task 3 fills it; `None` for now) and `board_url`
  - `GET /api/monday/connect`
  - `GET /api/monday/oauth/callback`
  - `POST /api/monday/disconnect`

- [ ] **Step 1: Write the failing tests.** The `fake_monday` fixture replaces `oauth.post_json`. It records `.calls` (url, payload, headers) and returns queued `(status, body, headers)` per URL through `.queue(url, status, body, headers=None)`. The `jwt` fixture returns `make(exp) -> str`, an unsigned `header.payload.sig` whose payload is `{"exp": exp}`.

```python
def test_connect_redirects_to_monday_with_pkce(tmp_store, vault):
    credentials.save_app('cid', 'sec')
    loc = tmp_store.get('/api/monday/connect').headers['Location']
    q = parse_qs(urlparse(loc).query)
    assert loc.startswith(config.AUTHORIZE_URL)
    assert q['client_id'] == ['cid'] and q['redirect_uri'] == [config.REDIRECT_URI]
    assert q['scope'] == ['boards:read boards:write me:read'] and q['subdomain'] == ['ibm']
    assert q['code_challenge_method'] == ['S256'] and len(q['code_challenge'][0]) == 43 and q['state']

def test_connect_without_app_credentials_returns_with_error(tmp_store, vault):
    assert tmp_store.get('/api/monday/connect').headers['Location'] == 'http://localhost:5120/?monday=error&reason=not_configured'

def test_callback_with_unknown_state_never_exchanges(tmp_store, vault, fake_monday):
    loc = tmp_store.get('/api/monday/oauth/callback?state=nope&code=x').headers['Location']
    assert loc.endswith('monday=error&reason=bad_state') and fake_monday.calls == []

def test_callback_exchanges_code_with_verifier_and_saves_session(tmp_store, vault, fake_monday, jwt):
    # Queue TOKEN_URL -> 200 {access_token: jwt(now+3600), refresh_token: 'r1'}
    # and API_URL -> {'data': {'me': {'id': '7', 'name': 'Abide'}}}.
    # GET /connect, take state and code_challenge, then GET /oauth/callback?state=…&code=x
    # -> Location ends with 'monday=connected'.
    # Token payload: grant_type 'authorization_code', code 'x', redirect_uri,
    #   b64url(sha256(code_verifier)) == code_challenge.
    # load_session()['user'] == {'id': '7', 'name': 'Abide'}.

def test_status_never_contains_tokens(...):   # connected, user 'Abide'; neither token string in resp.data
def test_denied_sign_in(...):                  # ?error=access_denied&state=… -> reason=denied
def test_access_token_refreshes_when_close_to_expiry(...):  # expires_at=now+60 -> new token; saved refresh_token == 'r2'
def test_concurrent_access_token_refreshes_once(...):       # 2 threads, the fake sleeps 0.05s -> 1 TOKEN_URL call, same token
def test_rejected_refresh_signs_out(...):      # TOKEN_URL 400 -> NotConnected; load_session() is None
def test_network_error_during_refresh_keeps_session(...):   # status 0 -> OAuthError('refresh_failed'); session kept
def test_disconnect_revokes_and_forgets(...):  # REVOKE_URL got {token: 'r1', token_type_hint: 'refresh_token', client_id, client_secret}; session None
def test_foreign_host_is_refused(tmp_store, vault):
    assert tmp_store.get('/api/monday/status', headers={'Host': 'evil.example:5121'}).status_code == 403
def test_tokens_never_logged(..., caplog, capsys):  # connect + callback + refresh at DEBUG; no token text in caplog.text or capsys
```

- [ ] **Step 2:** Run `python -m pytest tests/test_monday_oauth.py -q`. Expected: FAIL (`ImportError` / 404).

- [ ] **Step 3: Implement `oauth.py` and `routes.py`, and register the blueprint**
  - **PKCE:** verifier `secrets.token_urlsafe(48)`; challenge = base64url(sha256(verifier)) without padding; state `secrets.token_urlsafe(24)`. Keep pending `{state: (verifier, created)}` in memory, drop entries older than 600s, and consume a state on first use.
  - **Authorize URL params:** `client_id, redirect_uri, scope, state, code_challenge, code_challenge_method=S256, subdomain=ibm`.
  - **`finish()`:**
    - POST `TOKEN_URL` JSON `{grant_type: 'authorization_code', client_id, client_secret, code, redirect_uri, code_verifier}`.
    - Read `expires_at = jwt_exp(access_token)`. `None` means refresh only on 401.
    - Query `{ me { id name } }` against `API_URL` with the new token.
    - Save the session `{access_token, refresh_token, expires_at, user, connected_at}`.
  - **`access_token()`:** if `expires_at` is less than 300s away, return `refresh(stale_token=current)`.
  - **`refresh()`:** run under a module `threading.Lock`.
    - Reload the session. If its access token is no longer `stale_token`, another thread already refreshed, so return it.
    - Otherwise POST `{grant_type: 'refresh_token', client_id, client_secret, refresh_token}` and always save the new refresh token.
    - A 400 or 401 clears the session and raises `NotConnected`. A status of 0 or 5xx raises `OAuthError('refresh_failed')` and keeps the session.
  - **`disconnect()`:** best-effort POST `REVOKE_URL` with the refresh token and `token_type_hint: 'refresh_token'`, then `clear_session()`.
  - **Host guard:** in `before_request` on the blueprint, return 403 `{'error': 'Forbidden host'}` unless the hostname part of `request.host` is `localhost`, `127.0.0.1` or `[::1]`.
  - **Callback:** redirect to `parse_frontend_origins()[0] + '/?monday=connected'`, or `…?monday=error&reason=<reason>` on any `OAuthError` or an `error` query param (`denied`).
  - Never log or print sessions, bodies or tokens.

- [ ] **Step 4:** Run `python -m pytest -q`. Expected: all pass (61 + 7 + 13).

- [ ] **Step 5: Docs.**
  - `UI_ARCHITECTURE.md` Layer 4 table: add `core/features/integrations/monday/`, "monday.com sign-in, board read and gated writes (the only code that calls monday)".
  - copilot-instructions backend tree: add `features/integrations/monday/` with a one-line description per module.

- [ ] **Step 6: Live (user, in Edge or Chrome, not VS Code's browser, which monday blocks):** restart the backend, open `http://localhost:5121/api/monday/connect`, sign in and approve. Expected: s0L opens with `?monday=connected`. Then check `Invoke-RestMethod http://localhost:5121/api/monday/status` → `connected: True` and the user's name. **If monday shows "Admin approval required", an install screen that fails, or any error, stop and report it to the user word for word.**

- [ ] **Step 7: Commit**

```powershell
git add core/features/integrations/monday/oauth.py core/features/integrations/monday/routes.py core/app_factory.py tests/conftest.py tests/test_monday_oauth.py
git add -p UI_ARCHITECTURE.md .github/copilot-instructions.md
git commit -m "feat(monday): sign in with OAuth 2.1 + PKCE, status, disconnect"
```

---

### Task 3: GraphQL client, board-schema cache, and the live column check

**Files:**
- Create: `core/features/integrations/monday/client.py`, `…/monday/schema.py`, `tests/fixtures/monday_board.json`
- Modify: `…/monday/routes.py` (`GET /api/monday/schema`; `status.last_sync` = cache `fetched_at`), `tests/conftest.py` (`board` fixture loads the JSON)
- Test: `tests/test_monday_client.py`

**Interfaces:**
- Consumes: `oauth.post_json`, `oauth.access_token()`, `oauth.refresh(stale_token)`, `oauth.NotConnected`.
- Produces, in `client.py`:
  - `class MondayError(Exception)` with `.kind` in `{'not_connected', 'rate_limited', 'api', 'network'}`. `str()` is plain language.
  - `graphql(query: str, variables: dict | None = None, *, sleep=time.sleep) -> dict` returns `data`.
  - `fetch_board() -> dict` returns `{columns: [raw], groups: [{id, title}], items: [raw]}`. A raw item is `{id, name, group: {id, title}, column_values: [{id, type, text, value, from?, to?}]}`.
  - `fetch_item(item_id: str) -> dict | None`
  - `create_item(group_id: str, item_name: str, column_values: dict) -> str`
  - `change_columns(item_id: str, column_values: dict) -> None`
- Produces, in `schema.py`:
  - `normalize_columns(raw: list) -> list[dict]` returns `[{id, title, type, labels: [{label, color}]}]`.
  - `cache_path() -> str`: `monday_board_cache.json` beside `state.DATA_FILE`, resolved at call time.
  - `save_cache(columns: list, groups: list) -> dict` adds `board_id` and `fetched_at`. `load_cache() -> dict | None`.
  - `labels_for(cache: dict, column_id: str) -> list[str]`

- [ ] **Step 1: Write the fixture and the failing tests**
  - Write `tests/fixtures/monday_board.json` in `fetch_board()` shape, with invented names.
  - **Columns:** use every column id from the spec table.
    - Status `color_mkqypejx` uses the classic settings shape: `{"labels": {"0": "Active", "1": "Assignment Needed"}, "labels_colors": {"0": {"color": "#00c875"}, "1": {"color": "#fdab3d"}}}`.
    - Sales Stage `dropdown_mm25w58s` uses the list shape: `{"labels": [{"id": 1, "name": "Won"}, {"id": 2, "name": "Lost"}, {"id": 3, "name": "Qualify"}]}`.
    - Implementation Type `color_mkqyaeva` has Greenfield `#00c875` and Brownfield `#579bfc`.
    - Add a `subtasks` column.
  - **Groups:** SAP `group_mksetb9d` and Oracle `group_mksnwvrd`.
  - **Items:**
    - 1001 SAP `006Ab00000XyZ12QAB`: Contoso, Active, TCV `12.5`, Date 2026-01-05→2026-06-30, Sales Stage Qualify
    - 1002 SAP `Fabrikam renewal (TBD)`: Status and TCV empty
    - 1003 and 1004 Oracle, both `006Ab00000DupE01QAA`
    - 1005 SAP: Sales Stage Won
    - 1006 Oracle

```python
def test_fetch_board_follows_cursor(...):   # page 1 (3 items, cursor 'c1'), page 2 (3 items, cursor None) -> 6 items; 2nd request variables['cursor'] == 'c1'
def test_fetch_board_refreshes_on_401_mid_pagination(...):  # page 2 -> 401 once; refresh called once; 6 items
def test_rate_limited_then_ok(...):          # 429 + Retry-After 2 -> sleep(2) recorded -> data
def test_complexity_budget_retry_uses_retry_in_seconds(...):  # errors[0].extensions {code: 'COMPLEXITY_BUDGET_EXHAUSTED', retry_in_seconds: 7} -> sleep(7)
def test_gives_up_after_three_retries(...):  # always 429 -> MondayError kind 'rate_limited'; 4 requests
def test_requests_carry_version_and_token(...):  # headers['API-Version'] == '2026-07'; headers['Authorization'] == token
def test_not_connected_is_plain(...):        # access_token raises NotConnected -> MondayError kind 'not_connected'
def test_normalize_columns_reads_both_settings_shapes(board):
    cols = {c['id']: c for c in schema.normalize_columns(board['columns'])}
    assert cols['color_mkqypejx']['labels'][0] == {'label': 'Active', 'color': '#00c875'}
    assert [l['label'] for l in cols['dropdown_mm25w58s']['labels']] == ['Won', 'Lost', 'Qualify']
def test_schema_cache_lives_next_to_deals_file(tmp_store):  # save_cache -> beside tmp DATA_FILE; GET /api/monday/schema returns it; status.last_sync == fetched_at
```

- [ ] **Step 2:** Run `python -m pytest tests/test_monday_client.py -q`. Expected: FAIL.

- [ ] **Step 3: Implement `client.py` and `schema.py`; add the route**
  - **Request:** POST `API_URL` with `{query, variables}`, a 30s timeout and headers `Authorization: <token>`, `API-Version: 2026-07`, `Content-Type: application/json`.
  - **Retries:** on 429, or a GraphQL error whose `extensions.code` is `COMPLEXITY_BUDGET_EXHAUSTED` or `RATE_LIMIT_EXCEEDED`, sleep `min(60, retry_in_seconds or Retry-After or 10)`. Give up after 3 retries with `'monday is busy. Try again in a minute.'`.
  - **401:** call `refresh(stale_token=token)` once and retry. `NotConnected` becomes `'Sign in to monday again (Settings → Connections).'`.
  - **Other errors:** another GraphQL error becomes `api` with monday's first message. Status 0 becomes `'Could not reach monday. Check your connection.'`.
  - **Board query:** `boards(ids: [BOARD_ID]) { columns { id title type settings } groups { id title } items_page(limit: 500) { cursor items { …Item } } }`, then `next_items_page(cursor, limit: 500)` until the cursor is null. `Item` = `id name group { id title } column_values { id type text value ... on TimelineValue { from to } }`.
  - **Mutations** (Task 8 uses them):
    - `create_item(board_id, group_id, item_name, column_values: <JSON string>, create_labels_if_missing: false) { id }`
    - `change_multiple_column_values(board_id, item_id, column_values: <JSON string>, create_labels_if_missing: false) { id }`
  - **`normalize_columns`:** settings may be a dict or a JSON string. Labels come either as `labels` dict + `labels_colors` (index-keyed, ordered by index) or as a list of objects with `name`/`label` and `color`/`hex`. Skip empty names. Only `status` and `dropdown` columns get labels.

- [ ] **Step 4:** Run `python -m pytest -q`. Expected: all pass.

- [ ] **Step 5: Live column check (the agent may run it; it prints column metadata only, never row data)**

```powershell
python -c "import json; from core.features.integrations.monday import client; b = client.fetch_board(); print(len(b['items']), 'items in', len(b['groups']), 'groups'); [print(c['id'], '|', c['title'], '|', c['type']) for c in b['columns']]; [print(c['id'], json.dumps(c['settings'])[:600]) for c in b['columns'] if c['id'] in ('color_mkqyaeva', 'dropdown_mksmcb')]"
```

Expected and gate:
- Every column id in the spec table is present.
- Record, for Task 4, the exact titles and ids of B&P, Asset, Associates, Total Band, Center Mix, Deal Staffing Full, People, People 1 and Owner, plus the type names of the subitems and doc columns.
- If the two settings shapes printed match neither shape the normalizer supports, extend `normalize_columns` and its test now.
- **If a spec-table column is missing, stop and report.**
- Never print the Client column's settings (client names).

- [ ] **Step 6: Commit** `git add core/features/integrations/monday tests/conftest.py tests/fixtures/monday_board.json tests/test_monday_client.py; git commit -m "feat(monday): GraphQL client and board-schema cache"`

---

### Task 4: The `monday` owner in the field index

**Files:**
- Modify:
  - `shared/field_index.json`, `scripts/build-field-registry.mjs`, `FIELD_REGISTRY.md` (generated)
  - `core/shared/field_index.py`, `core/features/deals/writes.py`, `core/shared/migrations.py`
  - `frontend/src/shared/constants/fieldIndex.js`, `frontend/src/features/isbd/isbdSave.js`, `frontend/src/features/isbd/isbdPrefillMap.js`
  - `tests/fixtures/monday_board.json` (add the nine columns from Task 3) and `UI_ARCHITECTURE.md` (owners table)
- Test: `tests/test_field_index.py`, `tests/test_ownership.py`, `tests/test_migrations.py`, `tests/test_isbd_roundtrip.py`, `tests/test_review_fixes.py`, `frontend/src/shared/constants/fieldIndex.test.js`, `frontend/src/features/isbd/isbdSave.test.js`

**Interfaces:**
- Produces, in the index:
  - New owner `"monday": "Produced by the monday.com board and stored as the board has it. Written only by the monday sync (core/features/integrations/monday/writer.py)."`
  - A per-field `"monday"` block: `{column_id, title}` plus optional `scale` (number), `part` (`"from"` | `"to"`), `update: true` (may change on existing rows), `write: false` (never sent), or `{"source": "item_id" | "group"}` for row metadata.
- Produces, in `core/shared/field_index.py`:
  - `is_linked(deal: dict, owner: str) -> bool`. For `gssm` it's `gssm_workbook_id` or `gssm_synced_at`. For `monday` it's `monday_item_id`. Otherwise `False`.
  - `deal_editable(key: str, deal: dict) -> bool`: owner `deal`, or `editable_until_linked` and not `is_linked(deal, owner)`.
  - `monday_bindings() -> tuple[tuple[str, dict], ...]`: `(key, monday block)` in index order.
  - `MONDAY_UPDATABLE: frozenset[str]`: the keys with `update: true`.
- Produces, in `writes.py`: `prepare_deal_write(deal, payload, *, owners, enforce_required=True)`. `_writable` uses `fi.deal_editable`. `is_gssm_linked` is removed, and its callers use `fi.is_linked(deal, 'gssm')`.
- Produces, in `fieldIndex.js`: `isLinked(deal, owner)`, `isMondayLinked(deal)`, `mondayColumnOf(key) -> string | null`. Generalized `isEditable(key, deal)`: `deal`/`isbd` → true; `editable_until_linked` → `!isLinked(deal, owner)`; else false.

- [ ] **Step 1: Write the failing tests**

```python
# test_field_index.py: replace test_sales_stage_is_its_own_isbd_field
def test_sales_stage_is_monday_owned_on_the_deal():
    assert fi.owner_of('sales_stage') == 'monday' and fi.path_of('sales_stage') == 'sales_stage'
def test_monday_bindings_are_unique_and_cover_the_board():
    seen = [(b.get('column_id') or b['source'], b.get('part')) for _, b in fi.monday_bindings()]
    assert len(seen) == len(set(seen))
    assert {k for k, _ in fi.monday_bindings()} >= SPEC_KEYS   # the 35 bound keys in the Step 3 table
    assert fi.MONDAY_UPDATABLE == {'estimated_value', 'status'}
def test_people_columns_are_never_written_or_deal_editable():   # monday_people, monday_people_1, monday_owner: write False, no editable_until_linked
```

```python
# test_ownership.py
def test_monday_fields_editable_until_linked(tmp_store):        # unlinked: PUT {'status': 'Active', 'sales_stage': 'Won'} -> 200
def test_monday_fields_refused_once_linked(tmp_store):          # monday_item_id '1001': PUT status -> 409 naming status; PUT market -> 200
def test_monday_row_fields_never_client_writable(tmp_store):    # PUT {'monday_item_id': '9'} on an unlinked deal -> 409
def test_gssm_link_does_not_lock_monday_fields(tmp_store):      # gssm_workbook_id 7: PUT client_name -> 200
def test_monday_link_does_not_lock_gssm_timelines(tmp_store):   # monday_item_id set, no GSSM link: PUT timelines -> 200
def test_gssm_sync_refuses_monday_fields(tmp_store):            # PUT /gssm-sync {'status': 'X'} -> 409
def test_monday_writer_may_clear_required_fields():
    changes, err = prepare_deal_write({}, {'client_name': ''}, owners={'monday'}, enforce_required=False)
    assert err is None and changes == {'client_name': ''}
```

```python
# test_migrations.py
def test_isbd_sales_stage_moves_to_the_unlinked_deal():   # isbd_data {sales_stage: 'Qualify', term: '36'} -> deal sales_stage 'Qualify'; isbd_data == {'term': '36'}
def test_isbd_sales_stage_dropped_on_linked_deal():       # monday_item_id set -> deal sales_stage untouched; key gone from isbd_data
```

  - **Generic iSBD tests:** in `tests/test_isbd_roundtrip.py:51,57`, `tests/test_review_fixes.py:39,43` and `isbdSave.test.js`, `swb_stage` is the example of an iSBD-only field. Swap it for `term`.
  - **`fieldIndex.test.js`:**
    - `sales_stage` is owned by `monday`.
    - `isEditable('status', {})` is true; `isEditable('status', {monday_item_id: '1'})` is false.
    - `isEditable('client_name', {gssm_workbook_id: 7})` is true.
    - `isEditable('monday_item_id', {})` is false.
  - **`isbdSave.test.js`:** add `splitIsbdSave routes monday-owned edits to the deal only while unlinked`. Edited `{sales_stage: 'Won'}`: unlinked → `dealUpdate {sales_stage: 'Won'}`; `{monday_item_id: '1'}` → both maps empty.

- [ ] **Step 2:** Run `python -m pytest -q` and `npm --prefix frontend test`. Expected: the new tests fail.

- [ ] **Step 3: Edit the index.**
  - Existing fields become `"owner": "monday", "editable_until_linked": true` plus the block below. `sales_stage` and `swb_stage` move to top-level paths and keep their iSBD labels. `deal_type` changes type from `select` to `text`.
  - New fields go in section `"monday"`.
  - Use the exact titles printed by Task 3's live check, not the titles in this table.

| key | monday block |
|---|---|
| `opportunity_number` | `name`, Opportunity |
| `client_name` | `dropdown_mkqy4mkc`, Client |
| `project_name` | `text_mkqypdsv`, Opportunity Description |
| `status` | `color_mkqypejx`, Status, `update` |
| `implementation_type` | `color_mkqyaeva` |
| `currency` | `color_mkqyhjk0` |
| `sector` | `dropdown_mksmcb` |
| `industry` | `dropdown_mksmkbj8` |
| `deal_type` | `text_mkxcyckc` |
| `estimated_value` | `numeric_mkqyh0mz`, TCV ($M), `scale: 1000000`, `update` |
| `project_start_date` | `timerange_mksghf1v`, `part: from` |
| `lead_ssc` | `color_mkqyvgvy` |
| `solution_consultant_2` / `_3` / `_4` | `color_mksmhqb` / `color_mksmnwx4` / `color_mksmc3ry` |
| `tt_executive` | `color_mkqy18z3` |
| `sales_stage` | `dropdown_mm25w58s` |
| `swb_stage` | `dropdown_mm2513h7` |
| new `project_end_date` (date) | `timerange_mksghf1v`, `part: to` |
| new `close_quarter`, `forecast_category`, `lead_sl` (select) | `dropdown_mm25b4qb`, `dropdown_mm25d2jn`, `dropdown_mm25z11` |
| new `greenstar_dca_link` (text), `solutioning_pov` (text) | `text_mm408f48`, `long_text_mm25w1z6` |
| new `staffing_bp`, `staffing_asset`, `staffing_associates`, `staffing_total_band`, `staffing_center_mix`, `staffing_full` (select) | ids from Task 3 |
| new `monday_people`, `monday_people_1`, `monday_owner` (person, **not** editable, `write: false`) | ids from Task 3 |
| new `monday_item_id`, `monday_group` (text, not editable) | `{"source": "item_id"}`, `{"source": "group"}` |
| new `monday_synced_at`, `monday_missing_since` (date, not editable) | no block |

  - **Registry:** `build-field-registry.mjs` gains a "monday column" column, rendered as `title (\`column_id\`)` or the source name.

- [ ] **Step 4: Implement the loaders, the write gate, the migration and the iSBD consumers**
  - **Migration:** in `route_isbd_values`, a value fills an empty top-level deal field when `fi.deal_editable(key, deal)`. Otherwise it's skipped with the reason `owned by {owner}; the deal record is the source`.
  - **`isbdSave.js`:** replace `if (owner !== 'deal') continue` with `if (!isEditable(key, deal)) continue`.
  - **`isbdPrefillMap.js:144`:** read `monday` owners from the deal too.

- [ ] **Step 5:** Run `npm run registry`, then `python -m pytest -q` and `npm --prefix frontend test`. Expected: all pass, including the registry `--check` test.

- [ ] **Step 6: Commit** `git add -p` on every modified file, then `git commit -m "feat(monday): monday owner and board fields in the field index"`.

---

### Task 5: Mapping board rows to deal values and back

**Files:**
- Create: `core/features/integrations/monday/mapping.py`
- Test: `tests/test_monday_mapping.py`

**Interfaces:**
- Consumes: `fi.monday_bindings()` and `fi.FIELDS` (Task 4), and the fixture via `schema.normalize_columns`.
- Produces:
  - `IGNORED_COLUMN_TYPES = frozenset({'subtasks', 'doc', 'direct_doc'})`. Adjust it to the type names Task 3 printed.
  - `item_values(item: dict) -> dict[str, str]` covers every bound key, including `monday_item_id` (`str(id)`) and `monday_group` (group title). An empty cell is `''`.
  - `column_values(values: dict[str, str], columns: list[dict], *, only: set[str] | None = None) -> dict[str, object]`
  - `unknown_columns(columns: list[dict]) -> list[dict]`
  - `label_errors(values: dict[str, str], columns: list[dict]) -> list[str]`

- [ ] **Step 1: Write the failing tests**

```python
def test_item_values_reads_every_bound_column(board):   # item 1001 -> opportunity_number '006Ab00000XyZ12QAB' (case kept), client_name 'Contoso', status 'Active', estimated_value '12500000', project_start_date '2026-01-05', project_end_date '2026-06-30', sales_stage 'Qualify', monday_group 'SAP', monday_item_id '1001'
def test_empty_cells_become_empty_strings(board):      # item 1002 -> status '' and estimated_value ''
@pytest.mark.parametrize('board_value,deal_value', [('0.025', '25000'), ('400', '400000000'), ('2.675', '2675000'), ('12.5', '12500000')])
def test_tcv_conversion_is_exact_both_ways(board_value, deal_value): ...   # in and out through item_values / column_values
def test_column_values_formats_by_type(board):
    out = mapping.column_values({'status': 'Active', 'sector': 'Industrial', 'deal_type': 'BAFO', 'solutioning_pov': 'x',
        'estimated_value': '12500000', 'project_start_date': '2026-01-05', 'project_end_date': '2026-06-30', 'monday_people': 'Pat'}, cols)
    assert out == {'color_mkqypejx': {'label': 'Active'}, 'dropdown_mksmcb': {'labels': ['Industrial']}, 'text_mkxcyckc': 'BAFO',
        'long_text_mm25w1z6': {'text': 'x'}, 'numeric_mkqyh0mz': '12.5', 'timerange_mksghf1v': {'from': '2026-01-05', 'to': '2026-06-30'}}
def test_column_values_only_limits_keys(board):        # only={'estimated_value', 'status'} -> exactly those two ids
def test_half_a_date_range_is_not_sent(board):         # start without end -> no timerange key
def test_unknown_columns_flags_new_board_columns(board):  # extra {'id': 'text_new1', 'title': 'Notes', 'type': 'text'} flagged; subtasks not
def test_label_errors_name_the_field(board):           # status 'Closed Won' -> ["Status: “Closed Won” isn't on the board's list"]
```

- [ ] **Step 2:** Run `python -m pytest tests/test_monday_mapping.py -q`. Expected: FAIL.

- [ ] **Step 3: Implement `mapping.py`**
  - **Reading:**
    - The `name` column is `item['name']` verbatim.
    - A timeline uses `from`/`to` truncated to `[:10]`.
    - Numbers: `format((Decimal(text) * scale).normalize(), 'f')`.
    - Everything else is `text or ''`.
  - **Writing:**
    - status → `{'label': v}`
    - dropdown → `{'labels': [v]}`
    - text → `v`
    - long_text → `{'text': v}`
    - numbers → `format((Decimal(v) / scale).normalize(), 'f')`
    - timeline → `{'from', 'to'}`, only when both are set
  - **Skipped when writing:** the `name` column, `write: false`, source fields and empty values.

- [ ] **Step 4:** Run `python -m pytest -q`. Expected: all pass.

- [ ] **Step 5: Commit** `git add core/features/integrations/monday/mapping.py tests/test_monday_mapping.py; git commit -m "feat(monday): field-index-driven row mapping"`

---

### Task 6: The monday writer, single-use previews, and reusable deal assembly

**Files:**
- Create: `core/features/integrations/monday/writer.py`, `…/monday/previews.py`
- Modify: `core/features/deals/services.py`
- Test: `tests/test_monday_writer.py`

**Interfaces:**
- Consumes: `prepare_deal_write(..., enforce_required=False)` (Task 4).
- Produces:
  - `writer.write_monday_fields(deal: dict, values: dict[str, str], *, synced_at: str) -> None`. It validates with `owners={'monday'}` and raises `ValueError` on any refusal, then applies, sets `monday_synced_at` and drops `monday_missing_since`. It is the only caller that passes `owners={'monday'}`.
  - `writer.unlink(deal: dict) -> None` removes `monday_item_id`, `monday_group`, `monday_synced_at` and `monday_missing_since`, and keeps the values.
  - `previews.issue(kind: str, payload: dict) -> dict` returns `{preview_id, expires_at}` (uuid4 hex; ISO `expires_at`).
  - `previews.consume(preview_id: str, kind: str) -> dict | None` returns the payload once. It returns `None` when the id is unknown, expired or of the wrong kind. It's lock-guarded, and `previews.now = time.monotonic` is patchable.
  - `services.get_activities_with_defaults(data: dict | None = None)` and `services.build_new_deal(deal_id, changes, data=None)` reuse a store already in hand.

- [ ] **Step 1: Write the failing tests**

```python
def test_writer_replaces_values_and_stamps_sync():   # unlinked deal, client 'Old', status 'On Hold'; values from the board with status '' -> client 'Contoso', status '' (the board wins), monday_synced_at set, monday_missing_since gone
def test_writer_refuses_non_monday_keys():           # {'market': 'X'} -> ValueError
def test_unlink_keeps_values():
def test_preview_is_single_use():                    # consume twice -> payload then None
def test_preview_expires(monkeypatch):               # now + 601s -> None
def test_preview_kind_must_match():                  # issue('refresh'), consume(id, 'push') -> None
def test_build_new_deal_uses_the_given_store(monkeypatch):   # state.load_data raises; build_new_deal('1', {}, data={'default_approvers': {}, 'master_contacts': []}) has activities
```

- [ ] **Step 2:** Run `python -m pytest tests/test_monday_writer.py -q`. Expected: FAIL.
- [ ] **Step 3:** Implement `writer.py` and `previews.py`, and add the `data` parameter in `services.py`.
- [ ] **Step 4:** Run `python -m pytest -q`. Expected: all pass.
- [ ] **Step 5: Commit** `git add core/features/integrations/monday/writer.py core/features/integrations/monday/previews.py core/features/deals/services.py tests/test_monday_writer.py; git commit -m "feat(monday): single writer and single-use previews"`

---

### Task 7: Refresh from monday: preview and apply

**Files:**
- Create: `core/features/integrations/monday/sync.py`
- Modify: `…/monday/routes.py`
- Test: `tests/test_monday_sync.py`

**Interfaces:**
- Consumes: `client.fetch_board`, `client.MondayError`, `schema.normalize_columns` / `save_cache`, `mapping.item_values` / `unknown_columns`, `writer.*`, `previews.*`, `services.build_new_deal(..., data=)`, `fi.MONDAY_UPDATABLE`.
- Produces, in `sync.py`:
  - `plan_refresh(deals: list[dict], board: dict) -> dict` (pure) returns:
    - `new: [{item_id, values}]`
    - `changed: [{deal_id, item_id, values, diff: [{key, label, old, new}]}]`
    - `links: [{deal_id, item_id, values, diff, push_offers: [{key, label, value}]}]`
    - `gone: [{deal_id, item_id, name}]` and `unchanged: int`
    - `report: {duplicates: [{opportunity_number, item_ids}], plain_text_names: [{item_id, name}], unknown_columns: [{id, title, type}]}`
  - `apply_refresh(data: dict, plan: dict, *, now_iso: str) -> dict` returns `{created, updated, linked, gone, push_offers: [{deal_id, fields: [{key, label, value}]}]}`.
- Produces these routes:
  - `POST /api/monday/refresh/preview` returns `{preview_id, expires_at, counts, new: [{item_id, name, group, client}], changed, links, gone, report}`. It saves the schema cache first.
  - `POST /api/monday/refresh/apply {preview_id}` → 410 `{'error': 'This preview expired. Run it again.'}` or 200 summary.
  - `POST /api/monday/deals/<deal_id>/unlink` → 404, or 409 `'Only deals whose row left the board can be unlinked.'`, or 200 deal.
  - `MondayError` → `not_connected` 401, `rate_limited` 429, otherwise 502, with body `{'error': str(e)}`.

Rules:
- **Already linked:** a deal whose `monday_item_id` matches the row is `changed` when any bound key or the group differs, or when it has `monday_missing_since`. Otherwise it's unchanged.
- **Link:** an unlinked deal links to a row only when all three hold:
  - the row name is non-empty;
  - the name appears on exactly one row;
  - exactly one unlinked deal has that exact `opportunity_number`.

  `push_offers` are the `MONDAY_UPDATABLE` keys that are empty on the board but filled on the deal, carrying the deal's pre-link value.
- **New:** every other row becomes a new deal.
- **Gone:** linked deals whose row is absent and not yet flagged.
- **Report:**
  - `plain_text_names` are names that don't match `^006[A-Za-z0-9]{15}$`.
  - `duplicates` are names that appear on more than one row.
- **Apply:**
  - New rows go through `build_new_deal(next id, {}, data=data)` then `write_monday_fields`.
  - Changed and linked rows go through `write_monday_fields` on the deal by id. Skip deals deleted since the preview, and links whose row is already linked.
  - Gone rows get `monday_missing_since = now_iso`.
  - Never touch non-monday fields. Save once.

- [ ] **Step 1: Write the failing tests** (`tmp_store`, `vault`, and `client.fetch_board` patched to return the fixture)

```python
def test_preview_counts_and_does_not_write(tmp_store, board):        # empty store -> counts.new == 6; deals file bytes unchanged
def test_apply_creates_full_deals_for_every_group(tmp_store, board): # 6 deals, each with activities and monday_item_id; item 1003 monday_group 'Oracle'
def test_apply_with_expired_preview_is_410(tmp_store, board, monkeypatch):   # advance previews.now -> 410, store unchanged; a consumed id -> 410
def test_unlinked_deal_links_when_opportunity_is_unique(tmp_store, board):
    # Unlinked deal '006Ab00000XyZ12QAB': client 'Old Name', status 'On Hold', estimated_value '5000000'; board row 1001 has TCV '' and status ''.
    # links[0].diff includes client_name Old Name -> Contoso; push_offers == estimated_value '5000000' and status 'On Hold'.
    # After apply: client 'Contoso', status '' (the board wins), monday_item_id '1001'; the apply response carries the push_offers.
def test_duplicate_opportunity_never_links(tmp_store, board):        # unlinked deal '006Ab00000DupE01QAA' stays unlinked; rows 1003 and 1004 become new; report.duplicates names it
def test_plain_text_names_are_flagged_and_kept(tmp_store, board):    # 'Fabrikam renewal (TBD)' kept verbatim; in report.plain_text_names
def test_renamed_item_updates_linked_deal(tmp_store, board):         # linked 1001 with opportunity 'OLD' -> changed; afterwards '006Ab00000XyZ12QAB'; deal count unchanged
def test_gone_row_is_flagged_then_unlinkable(tmp_store, board):      # linked item 999 -> gone; apply sets monday_missing_since and keeps values; PUT status -> 409; POST unlink -> 200; PUT status -> 200
def test_unlink_refused_while_row_exists(tmp_store, board):          # 409
def test_group_move_updates_group(tmp_store, board):                 # linked deal with monday_group 'SAP', row in Oracle -> 'Oracle'
def test_reappearing_row_clears_missing_flag(tmp_store, board):
def test_unknown_columns_reported(tmp_store, board):
def test_preview_saves_schema_cache(tmp_store, board):
def test_not_connected_is_401_plain_message(tmp_store, monkeypatch): # fetch_board raises MondayError('not_connected', ...) -> 401 with the message
```

- [ ] **Step 2:** Run `python -m pytest tests/test_monday_sync.py -q`. Expected: FAIL.
- [ ] **Step 3:** Implement `sync.py` and the three routes.
- [ ] **Step 4:** Run `python -m pytest -q`. Expected: all pass.
- [ ] **Step 5: Live read check (agent; prints counts only, applies nothing).** Restart the backend, then run `(Invoke-RestMethod -Method Post http://localhost:5121/api/monday/refresh/preview -ContentType 'application/json' -Body '{}').counts`. Expected: `new` + `links` + `unchanged` equals the board's row count (all five groups), and `monday_board_cache.json` now exists beside `deals_data.json`. Report the counts to the user.
- [ ] **Step 6: Commit** `git add core/features/integrations/monday/sync.py core/features/integrations/monday/routes.py tests/test_monday_sync.py; git commit -m "feat(monday): refresh preview and apply"`

---

### Task 8: Send to monday: push preview, send, audit

**Files:**
- Create: `core/features/integrations/monday/push.py`
- Modify: `…/monday/routes.py`
- Test: `tests/test_monday_push.py`

**Interfaces:**
- Consumes: `mapping.column_values` / `label_errors` / `item_values`, `schema.load_cache`, `client.create_item` / `change_columns` / `fetch_item`, `writer.write_monday_fields`, `previews`, `fi.MONDAY_UPDATABLE`, `oauth.status()` (user name for the audit).
- Produces, in `push.py`:
  - `class PushRefused(Exception)` (plain message → 400).
  - `preview_create(deal: dict, group_id: str, cache: dict) -> dict` returns `{kind: 'create', deal_id, group: {id, title}, item_name, column_values, rows: [{column_id, title, old: '', new}]}`.
  - `preview_update(deal: dict, changes: dict, cache: dict) -> dict` returns `{kind: 'update', deal_id, item_id, column_values, rows: [{column_id, title, old, new}]}`. The values in `rows` are in the board's units.
  - `send(payload: dict) -> dict` returns the updated deal.
  - `audit_path() -> str` (beside `DATA_FILE`) and `audit(entry: dict) -> None`, which appends one JSON line `{at, user, action, deal_id, item_id, columns, result, error?}`.
- Produces these routes:
  - `POST /api/monday/push/preview`, with body `{deal_id, kind: 'create', group_id}` or `{deal_id, kind: 'update', changes}`. It returns `{preview_id, expires_at, …preview without column_values}`, or 400, or 404.
  - `POST /api/monday/push/send {preview_id}` returns 410 if expired, 200 with the deal, or 502 `{error}`.

Refusals (`PushRefused`, all checked before anything reaches monday):
- `create` on a linked deal: `'This deal is already on the board.'`
- An unknown group.
- An empty `opportunity_number`: `'Add an opportunity number first. It becomes the row name.'`
- `update` on an unlinked deal.
- Empty `changes`, or keys outside `MONDAY_UPDATABLE`: `'Only TCV ($M) and Status can be changed on an existing row.'`
- Any `label_errors`.

`send()` steps:
1. For an update, re-check that the column ids are a subset of the two updatable ids.
2. Call the mutation.
3. Re-read the row with `fetch_item`.
4. Load the store, call `write_monday_fields`, then save.
5. Write the audit line.

If the mutation fails, return 502 with monday's message, audit `result: 'error'`, and leave the deal untouched. If the re-read fails after a successful mutation, return 502 `'Sent to monday, but reading it back failed. Refresh from monday to finish.'` and audit `result: 'sent_unconfirmed'`.

- [ ] **Step 1: Write the failing tests** (client functions patched; cache saved from the fixture)

```python
def test_send_without_preview_is_refused(tmp_store):        # {'preview_id': 'made-up'} -> 410; no client calls
def test_send_with_expired_preview_is_410(tmp_store, ...):
def test_create_sends_every_filled_column(tmp_store, ...):  # create_item got group_id, item_name == opportunity_number verbatim, no people columns; deal now linked; audit line action 'create', result 'ok', user name, columns
def test_mutations_never_create_labels():                   # both mutation strings in client.py contain 'create_labels_if_missing: false'
def test_only_two_mutations_exist():                        # regex over client.py source: mutation fields == {'create_item', 'change_multiple_column_values'}
def test_update_limited_to_tcv_and_status(tmp_store, ...):  # changes {'estimated_value': '15000000', 'status': 'Assignment Needed'} -> rows TCV ($M) '12.5' -> '15'; change_columns ids == {'numeric_mkqyh0mz', 'color_mkqypejx'}
def test_update_refuses_other_columns(tmp_store, ...):      # {'client_name': 'X'} -> 400 with the exact message
def test_push_preview_rejects_label_not_on_board(tmp_store, ...):   # status 'Closed Won' -> 400 mentioning Status and "isn't on the board's list"; no client calls
def test_nothing_stored_until_monday_accepts(tmp_store, ...):       # change_columns raises MondayError('api', ...) -> 502; estimated_value unchanged; audit 'error'
def test_create_refused_for_linked_deal(tmp_store, ...):
def test_token_never_in_responses_logs_or_audit(tmp_store, vault, caplog):   # session access token 'tok-XYZ'; run refresh and push routes at DEBUG; 'tok-XYZ' absent everywhere
```

- [ ] **Step 2:** Run `python -m pytest tests/test_monday_push.py -q`. Expected: FAIL.
- [ ] **Step 3:** Implement `push.py` and the routes.
- [ ] **Step 4:** Run `python -m pytest -q`. Expected: all pass.
- [ ] **Step 5: Commit** `git add core/features/integrations/monday/push.py core/features/integrations/monday/routes.py tests/test_monday_push.py; git commit -m "feat(monday): gated push with audit log"`

---

### Task 9: Frontend data layer: service, store, board options, closed deals

**Files:**
- Create: `frontend/src/shared/services/mondayService.js`, `frontend/src/shared/mondayStore.js`, `frontend/src/shared/constants/boardOptions.js`, `…/boardOptions.test.js`, `…/uiStates.test.js`
- Modify: `frontend/src/shared/constants/uiStates.js`, `frontend/src/shared/utils/gssmBridge.test.js`, `UI_ARCHITECTURE.md` (Layer 3 table), `.github/copilot-instructions.md` (frontend tree)

**Interfaces:**
- Produces:
  - `mondayService`: `status()`, `schema()`, `refreshPreview()`, `refreshApply(previewId)`, `pushPreview(payload)`, `pushSend(previewId)`, `disconnect()`, `unlink(dealId)`, and `connectUrl` (= `buildUrl('/api/monday/connect')`). It's built on `apiClient`.
  - `useMondayStore` (Zustand):
    - state: `status`, `schema`, `preview`, `error`
    - actions: `loadStatus()`, `loadSchema()`, `runPreview()`, `applyPreview()` (returns the summary, then `useDealStore.getState().loadDeals()`), `clearPreview()`
  - `boardOptions.js`:
    - `boardLabels(schema, key) -> string[] | null`
    - `labelColor(schema, key, label) -> string | null`
    - `optionsFor(schema, key, fallback, current) -> { options, offList }`
    - `useBoardOptions(key, fallback, current)` and `useImplColor() -> (type) => string`. `useImplColor` falls back from board color to `IMPLEMENTATION_TYPE_COLORS[type]` to `'#8d8d8d'`.
  - `uiStates.js`: `CLOSED_SALES_STAGES = ['Won', 'Lost', 'Submitted']` and `isClosedDeal(deal)`. A deal is closed when its Sales Stage is in that list or its `status` is in `CLOSED_STATUSES`, which keeps unlinked legacy archives working.

- [ ] **Step 1: Write the failing tests**

```js
// boardOptions.test.js. SCHEMA mirrors the backend cache shape, with columns for status, client_name and implementation_type.
it('reads board labels for a bound field', () => expect(boardLabels(SCHEMA, 'status')).toEqual(['Active', 'Assignment Needed']))
it('falls back before the first sync', () => expect(optionsFor(null, 'sector', ['A'], '').options).toEqual(['A']))
it('flags a legacy value as off the board list', () => expect(optionsFor(SCHEMA, 'status', [], 'Closed Won').offList).toBe(true))
it('uses board label colors', () => expect(labelColor(SCHEMA, 'implementation_type', 'Greenfield')).toBe('#00c875'))
// uiStates.test.js
it.each([[{ sales_stage: 'Won' }, true], [{ sales_stage: 'Submitted' }, true], [{ status: 'Archived' }, true],
  [{ sales_stage: 'Qualify', status: 'Active' }, false]])('isClosedDeal(%o) is %s', (deal, closed) => expect(isClosedDeal(deal)).toBe(closed))
// gssmBridge.test.js (the spec's cross-module check: sector's GSSM cell Home!J16 is never seeded)
it('never seeds sector into the workbook', () =>
  expect(mapDealToGssmEdits({ sector: 'Industrial', timelines: [] }).some((e) => e.sheet === 'Home' && e.row === 15 && e.col === 9)).toBe(false))
```

- [ ] **Step 2:** Run `npm --prefix frontend test`. Expected: the new tests fail.
- [ ] **Step 3:** Implement the service, store, `boardOptions.js` and `isClosedDeal`.
- [ ] **Step 4:** Run `npm --prefix frontend test`. Expected: all pass.
- [ ] **Step 5: Docs.** `UI_ARCHITECTURE.md` Layer 3 table: add `shared/services/mondayService.js` ("all monday API access") and `shared/mondayStore.js` ("connection status, board schema, pending refresh preview"). Mirror both in the copilot-instructions frontend tree.
- [ ] **Step 6: Commit** `git add` the new files and `git add -p` the modified ones, then `git commit -m "feat(monday): frontend service, store, board options, closed-deal rule"`.

---

### Task 10: Board lists and read-only monday fields in the deal forms

**Files:**
- Create: `frontend/src/shared/ui/BoardSelect.jsx`
- Modify:
  - `frontend/src/features/deals/components/DealDetailsPanel.jsx`, `…/NewDealModal.jsx`
  - `frontend/src/features/home/components/QuickSetupWizard.jsx`, `…/wizard/WizardSteps.jsx`
  - `frontend/src/shared/constants/referenceData.js` (+ its test), `frontend/src/shared/constants/deal_constants.json`

**Interfaces:**
- Consumes: `useBoardOptions`, `isEditable`, `isMondayLinked`, `useMondayStore`, `mondayService.unlink` (Task 9).
- Produces: `<BoardSelect fieldKey value onChange fallback disabled />`. It's a native `<select>` of the board labels. When the current value is off the list, it's kept as the first option, with the hint "Not on the board's list" underneath (`.field-hint`, token colors).

Decisions:
- **Unlinked deals:** fields bound to a status or dropdown column use `BoardSelect`: `status`, `implementation_type`, `sector`, `industry`, `currency` and `client_name`. `deal_type` becomes a text input. While a board schema exists, the industry list is the board's flat list; otherwise the current market-nested list stays.
- **Retire the old Deal Type list:** remove `getDealTypes` and `deal_constants.deal_types`, then grep that nothing else uses them.
- **Linked deals in `DealDetailsPanel`:** monday-owned fields render as read-only text, and each section with such fields shows one `.chip` "From monday · synced {time}". `estimated_value` and `status` stay editable (Task 11 turns their save into a send).
- **A deal with `monday_missing_since`:** show the notice "This row is no longer on the monday board. Its last values are kept, read-only." with an **Unlink** button (`mondayService.unlink` → `patchDeal`).
- **`QuickSetupWizard` full setup:** filter its payload with `isEditable(key, deal)`, the same way `timelines` already is. `WizardSteps` sector, industry and implementation-type selects use `BoardSelect`.

- [ ] **Step 1:** Update `referenceData.test.js` for the removed `getDealTypes`, then run `npm --prefix frontend test`. Expected: FAIL until Step 2.
- [ ] **Step 2:** Implement `BoardSelect` and the form changes.
- [ ] **Step 3:** Run `npm --prefix frontend test` and `npm --prefix frontend run build`, then lint the touched files with `Push-Location frontend; npx eslint src/shared/ui/BoardSelect.jsx src/features/deals/components/DealDetailsPanel.jsx src/features/deals/components/NewDealModal.jsx src/features/home/components/QuickSetupWizard.jsx src/features/home/components/wizard/WizardSteps.jsx; Pop-Location`. Expected: all pass, and the build and lint are clean.
- [ ] **Step 4: Check in s0L (localhost:5120; never the monday tab), in Obsidian and Frost:**
  - New Deal and Deal Details show the board's labels. That needs the cache from Task 7.
  - An unlinked deal with a legacy status shows the hint.
  - The wizard on an unlinked deal saves without errors.
- [ ] **Step 5: Commit** `git add` the new file and `git add -p` the rest, then `git commit -m "feat(monday): board lists and read-only monday fields in deal forms"`.

---

### Task 11: Send to monday from s0L

**Files:**
- Create: `frontend/src/shared/ui/MondayPushDialog.jsx`
- Modify: `frontend/src/features/deals/components/DealDetailsPanel.jsx`

**Interfaces:**
- Consumes: `mondayService.pushPreview` / `pushSend`, `useMondayStore.schema.groups`, `useDealStore.patchDeal`.
- Produces: `<MondayPushDialog kind="create"|"update" deal changes? onClose onDone(updatedDeal) />`, built on the shared `Modal`.
  - **`create`:** the user first picks a group, with none preselected. Then the dialog shows the preview rows "Column · Value".
  - **`update`:** it previews immediately and shows rows as "Row · Column: current → new" in the board's units.
  - **Sending:** the one primary button is **Send to monday**. On success it calls `patchDeal(updated)` then `onDone`.
  - **Errors:** API messages show inline, verbatim. Closing the dialog sends nothing.

Decisions:
- Unlinked deals get an **Add to monday** action in `DealDetailsPanel`.
- On linked deals, Save splits:
  - Changed `estimated_value` / `status` open the dialog in `update` mode with those values; nothing is stored until monday accepts.
  - Changed deal-owned fields still go through `dealService.update`.

- [ ] **Step 1:** Implement the dialog and the two entry points.
- [ ] **Step 2:** Run `npm --prefix frontend test`, `npm --prefix frontend run build` and eslint on the two files. Expected: clean.
- [ ] **Step 3: Live (the user's choice, real board data):** the user sends one real change they actually want: a new row or a TCV/Status change. Expected:
  - The board shows the change.
  - The deal re-reads it.
  - `monday_audit.jsonl` gains one `"result": "ok"` line with no token in it.

  Skip this step if the user has no change to make today.
- [ ] **Step 4: Commit** `git add frontend/src/shared/ui/MondayPushDialog.jsx; git add -p frontend/src/features/deals/components/DealDetailsPanel.jsx; git commit -m "feat(monday): confirmation dialog for every write"`

---

### Task 12: Archives by Sales Stage, board colors, and iSBD locks

**Files:**
- Modify:
  - `frontend/src/AppHeader.jsx`
  - `frontend/src/features/deals/components/{DealList.jsx, ExportModal.jsx, PipelineMetrics.jsx}`
  - `frontend/src/features/metrics/MetricsModule.jsx`
  - `frontend/src/features/isbd/{PptSlideView.jsx, IsbdModule.jsx}`

**Interfaces:**
- Consumes: `isClosedDeal`, `useImplColor`, `isEditable`, `isMondayLinked` (Task 9).
- Produces: `DeckLockContext` (exported from `PptSlideView.jsx`), a function `(fieldKey) => boolean`. `IsbdModule` provides `(key) => Boolean(ownerOf(key)) && !isEditable(key, deal)`, and `CellEdit` uses it in place of `LOCKED_OWNERS`.

Decisions:
- Every `CLOSED_STATUSES.includes(d.status)` call, and ExportModal's local copy, becomes `isClosedDeal(d)`.
- Archive and Restore actions are hidden on monday-linked deals.
- Every `IMPLEMENTATION_TYPE_COLORS[...]` lookup goes through `useImplColor()`.

- [ ] **Step 1:** Implement the changes.
- [ ] **Step 2:** Run `npm --prefix frontend test`, `npm --prefix frontend run build` and eslint on the touched files. Expected: clean.
- [ ] **Step 3: Check in s0L:**
  - A deal with Sales Stage Won or Submitted is under Archives.
  - Card accents use the board's colors.
  - In the iSBD editor, Sales Stage is editable on an unlinked deal and locked on a linked one.
- [ ] **Step 4: Commit** `git add -p` the touched files, then `git commit -m "feat(monday): archives by sales stage, board colors, iSBD locks"`.

---

### Task 13: Connections tab, startup refresh, and the first real sync

**Files:**
- Create: `frontend/src/features/settings/components/ConnectionsTab.jsx`
- Modify: `frontend/src/features/settings/components/Settings.jsx` (tab + `initialTab` prop), `frontend/src/shared/useStore.js` (`settingsTab` + `openSettingsAt(tab)`), `frontend/src/App.jsx`, `frontend/src/AppHeader.jsx`, `frontend/src/shared/ui/Icons.jsx` (`MondayUpdatesIcon = wrap(CloudDownload, 16)`), `UI_ARCHITECTURE.md` (data-flow section)

**Interfaces:**
- Consumes: `useMondayStore`, `mondayService`, `MondayPushDialog` (Task 11), `ConfirmDialog`.

Decisions:
- **Connections tab states:**
  - **App not set up on this computer:** "monday isn't set up on this computer yet. Ask whoever manages s0L for the monday app file."
  - **Not connected:** a **Connect monday** link-button to `mondayService.connectUrl` (`target="_blank"`, `rel="noopener"`), with the hint "Opens monday's sign-in page. Use Edge or Chrome."
  - **Connected:** "Signed in as {name}" and "Last read from monday {time}", plus **Refresh from monday** and **Disconnect** (the latter through `ConfirmDialog`). The token is never shown.
- **Review:**
  - Counts, then lists: new rows (name · client · group), changed (deal · field old → new), links (deal ↔ row, replaced fields) and gone.
  - The report in plain words, for example "New column on the board that s0L doesn't know yet: Notes (text)."
  - One **Apply** primary.
  - After Apply, each push offer gets a **Send to monday** button that opens `MondayPushDialog` in `update` mode with the offered values.
- **Startup (App.jsx):**
  - After deals load: `loadSchema()`, then `loadStatus()`, then `runPreview()` if connected.
  - When the preview has changes, the header (icon-only, per DESIGN.md) shows `MondayUpdatesIcon` in accent, with Tip/aria-label "monday · N updates to review". Clicking it calls `openSettingsAt('connections')`.
- **Return from sign-in:**
  - When the page loads with `?monday=…`, open Settings → Connections, show a notice and drop the param with `history.replaceState`.
  - Reason texts:
    - `not_configured`: as in the not-set-up state above.
    - `bad_state`: "The sign-in took too long or was started twice. Try Connect again."
    - `denied`: "Sign-in was cancelled."
    - `exchange_failed`: "monday didn't accept the sign-in. Try again; if it repeats, the app's OAuth settings need a look."

- [ ] **Step 1:** Implement the tab, the store additions, startup, the header icon and the return handling.
- [ ] **Step 2:** Run `npm --prefix frontend test`, `npm --prefix frontend run build` and eslint on the touched files. Expected: clean.
- [ ] **Step 3: Docs.** In the `UI_ARCHITECTURE.md` "How the data stays unified" section, add the monday flow: board → refresh preview → apply (monday writer) → `dealStore`; deal → push preview → send → re-read → monday writer. Mention the `monday` owner next to `gssm`.
- [ ] **Step 4: First real sync (with the user):**
  1. Back up the store: `Copy-Item deals_data.json deals_data.backup-pre-monday.json`.
  2. Restart all three dev servers.
  3. The user opens Settings → Connections → **Refresh from monday**, reviews the counts and lists, and clicks **Apply**.
  4. Expected: every board row appears as a deal; linked deals show the "From monday" chips; Archives holds the Won, Lost and Submitted rows.

  If anything looks wrong, restore the backup and report.
- [ ] **Step 5: Final verification:** `python -m pytest -q`, `npm --prefix frontend test`, `npm --prefix frontend run build`, `node scripts/build-field-registry.mjs --check`. Expected: all green.
- [ ] **Step 6: Commit** `git add` the new file and `git add -p` the rest, then `git commit -m "feat(monday): Connections tab and startup refresh"`.
