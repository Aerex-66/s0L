# monday.com Sign-in and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign in to monday through s0L's own monday app, then pull the "Business Apps – Deal Pipeline" board into s0L as deals. It's read-only and runs at startup and on **Sync now**.

**Architecture:** A new Flask blueprint, `core/features/integrations/monday/`, is the only code that talks to monday. It has three parts: standard OAuth sign-in with the user's app, a read-only GraphQL client, and a sync that maps board rows to deals through `shared/field_index.json`. Board fields get the index owner `monday`. The existing write gate refuses them on linked deals, and one writer function is the only code that stores them. React gets `mondayService`, a monday tab in Settings, a sync at startup, read-only states on linked deals, and Archives by Sales Stage.

**Tech Stack:** Flask 3 on Python 3.14 (stdlib `urllib`, `ctypes` for DPAPI; no new dependencies), React 19 + Vite + Zustand, pytest, Vitest, monday platform API `2026-07`.

**Spec:** [docs/superpowers/specs/2026-10-27-monday-integration-design.md](../specs/2026-10-27-monday-integration-design.md), section "First build". Writing to monday is Phase 2. Its reference plan is parked at [2026-10-27-monday-integration.md](2026-10-27-monday-integration.md).

## Before Task 1 (the user, once)

1. `main` has uncommitted UI work in files this plan edits. Ask the user to commit or stash it; never commit it for them. Then run `git checkout -b feat/monday-sync`.
2. Check the "s0L" app in the monday Developer Center:
   - The redirect URL is `http://localhost:5121/api/monday/oauth/callback`.
   - **New OAuth Flow** is off. This build uses the standard flow. If the user already turned it on, stop and ask.
3. Check that the baseline is green: `python -m pytest -q` (61) and `npm --prefix frontend test` (95).

## Global Constraints

- **Read-only toward monday:** s0L asks only for `me:read boards:read`, and the code contains no GraphQL mutations.
- **Only Flask calls monday:**
  - `https://api.monday.com/v2`, with headers `API-Version: 2026-07` and `Authorization: <token>`;
  - `https://auth.monday.com`.

  The browser only visits monday's sign-in page.
- **Fixed values:** board `9150394800`, account slug `ibm`, redirect `http://localhost:5121/api/monday/oauth/callback`.
- **Credentials:** the client ID and secret and the access token live only in `%LOCALAPPDATA%\s0L\monday\`, DPAPI-encrypted for the current Windows user. They're never returned by a route, never logged, and never stored with deals.
- **Field index:** every monday field is declared once in `shared/field_index.json` with `"monday": {"column_id": …, "title": …}`. Run `npm run registry` after each edit.
- **One writer:** only `writer.write_monday_fields()` stores monday-owned fields. No client route accepts them.
- **The board wins:** a sync stores monday-owned values exactly as the board has them, including empty cells.
- **Opportunity IDs** are stored verbatim. They're case-sensitive.
- **Closed (Archives)** means Sales Stage is `Won`, `Lost` or `Submitted`.
- **No real board data in git:**
  - the test fixture is synthetic but uses the real column ids;
  - `monday-app.json` is gitignored.
- **Test isolation:** tests never touch `deals_data.json` (use `tmp_store`) or the real secrets folder (use `vault`).
- **Running Python:** use `python`, not `python3`, which is a Microsoft Store stub on this PC. Restart the `backend dev server` task before any live check; Flask has no reloader.
- **Frontend:**
  - all monday I/O goes through `shared/services/mondayService.js`;
  - features never import other features;
  - follow DESIGN.md: tokens only, square, `.chip` for badges, `.btn-primary` for the one primary action.
- **Never automate the user's monday tab.** Live sign-ins happen in the user's Edge or Chrome.
- **Commits** stage only this plan's changes. Use `git add -p` on files that had other edits.

## Review Focus

- **A row is archived or deleted on monday.** The deal is flagged "no longer on the board", keeps its values and is never deleted. Test: `test_gone_row_is_flagged_and_kept` (Task 4).
- **Someone edits the opportunity ID on a linked row.** The deal updates in place, with no duplicate. Test: `test_renamed_item_updates_linked_deal` (Task 4).
- **An existing s0L deal's opportunity number appears on two rows.** It never links, both rows become deals, and the summary flags the number. Test: `test_duplicate_opportunity_never_links` (Task 4).
- **The user uninstalled the app on monday, so the token is dead.** The sync answers 401 "Sign in to monday again", the dead token is deleted, and the tab offers Connect. Test: `test_dead_token_signs_out` (Task 2).
- **A link replaces a filled s0L value with the board's value, even an empty one.** The summary lists the old value so nothing disappears silently. Test: `test_link_reports_replaced_values` (Task 4).

## File Structure

- **Create (backend)** `core/features/integrations/__init__.py` and `core/features/integrations/monday/`:
  - `config.py`
  - `credentials.py`: DPAPI store
  - `provision.py`: one-time setup command
  - `oauth.py`: sign-in, and the one HTTP function
  - `client.py`: read-only GraphQL
  - `mapping.py`: row → deal values
  - `writer.py`: the only monday-field writer
  - `sync.py`: rows → deals
  - `routes.py`: the blueprint
- **Modify (backend)** `core/app_factory.py`, `core/shared/field_index.py`, `core/shared/migrations.py`, `core/features/deals/writes.py`, `core/features/deals/services.py`, `shared/field_index.json`, `scripts/build-field-registry.mjs`, `FIELD_REGISTRY.md` (generated), `.gitignore`, `package.json`.
- **Tests** `tests/conftest.py` (fixtures `vault`, `fake_monday`, `board`), `tests/fixtures/monday_board.json`, and `tests/test_monday_{signin,client,sync}.py`. Also update `tests/test_field_index.py`, `test_ownership.py`, `test_migrations.py`, `test_isbd_roundtrip.py` and `test_review_fixes.py`.
- **Create (frontend)** `shared/services/mondayService.js`, `features/settings/components/MondayTab.jsx`, `shared/constants/uiStates.test.js`.
- **Modify (frontend)**
  - `shared/constants/{fieldIndex.js, fieldIndex.test.js, uiStates.js}`, `shared/useStore.js`
  - `features/isbd/{isbdSave.js, isbdSave.test.js, isbdPrefillMap.js, PptSlideView.jsx, IsbdModule.jsx}`
  - `features/deals/components/{DealDetailsPanel, DealList, ExportModal}.jsx`, `features/home/components/QuickSetupWizard.jsx`, `features/metrics/MetricsModule.jsx`
  - `features/settings/components/Settings.jsx`, `AppHeader.jsx`, `App.jsx`
- **Docs** `UI_ARCHITECTURE.md`, `.github/copilot-instructions.md`, updated in the task that changes the structure.

---

### Task 1: Sign in with monday

**Files:**
- Create:
  - `core/features/integrations/__init__.py`, `…/monday/__init__.py` (both empty)
  - `…/monday/config.py`, `credentials.py`, `provision.py`, `oauth.py`, `routes.py`
- Modify: `core/app_factory.py` (register `monday_blueprint`), `tests/conftest.py`, `.gitignore` (`monday-app.json`), `package.json`, `UI_ARCHITECTURE.md` (Layer 4 row), `.github/copilot-instructions.md` (backend tree)
- Test: `tests/test_monday_signin.py`

**Interfaces (produces):**
- **`config`:**
  - `BOARD_ID = '9150394800'`, `ACCOUNT_SLUG = 'ibm'`, `BOARD_URL = 'https://ibm.monday.com/boards/9150394800'`
  - `API_URL = 'https://api.monday.com/v2'`, `API_VERSION = '2026-07'`
  - `AUTHORIZE_URL = 'https://auth.monday.com/oauth2/authorize'`, `TOKEN_URL = 'https://auth.monday.com/oauth2/token'`
  - `SCOPES = 'me:read boards:read'`, `REDIRECT_URI = 'http://localhost:5121/api/monday/oauth/callback'`
- **`credentials`:**
  - `SECRETS_DIR` (`%LOCALAPPDATA%\s0L\monday`)
  - `protect(bytes) -> bytes`, `unprotect(bytes) -> bytes`
  - `save_app(client_id: str, client_secret: str)`, `load_app() -> dict | None`
  - `save_token(access_token: str, user: dict)`, `load_token() -> dict | None` (`{access_token, user, connected_at}`), `clear_token()`
- **`provision.main(argv=None) -> int`**
- **`oauth`:**
  - `post_json(url, payload, headers=None, timeout=30) -> (status, body, headers)`. This is the only HTTP function; status is 0 on a network error.
  - `OAuthError` (`.reason` in `not_configured | bad_state | denied | exchange_failed`), `NotConnected`
  - `begin() -> str`, `finish(state, code) -> dict`
  - `access_token() -> str`, `sign_out()`, `status() -> {app_configured, connected, user}`
- **Routes:**
  - `GET /api/monday/status`: `status()` plus `last_sync` (Task 4 fills it) and `board_url`
  - `GET /api/monday/connect`
  - `GET /api/monday/oauth/callback`
  - `POST /api/monday/disconnect`

- [ ] **Step 1: Write the failing tests.** In `conftest.py`:
  - `vault` patches `credentials.SECRETS_DIR` to a temp folder and `protect`/`unprotect` to byte reversal.
  - `fake_monday` patches `oauth.post_json`. It records `.calls` and returns `(status, body, headers)` queued per URL with `.queue(url, status, body, headers=None)`.

```python
def test_app_credentials_roundtrip_without_plaintext(vault):   # load_app() == saved; b'sek-ret-2' not in app.bin
@pytest.mark.skipif(sys.platform != 'win32', reason='DPAPI is Windows-only')
def test_real_dpapi_roundtrip():                               # unprotect(protect(b'x' * 40)) == b'x' * 40
def test_import_saves_then_deletes_the_file(vault, tmp_path, capsys):   # main(['--import', p]) == 0; saved; file gone; secret not printed
def test_import_missing_file_skips(vault, tmp_path):           # == 0; load_app() is None
def test_import_bad_file_is_kept(vault, tmp_path):             # '{"client_id": ""}' -> == 2; file kept
def test_prompt_mode_hides_the_secret(vault, monkeypatch):     # input -> 'cid', provision.getpass.getpass -> 'shh'; == 0
def test_connect_redirects_to_monday(tmp_store, vault):
    credentials.save_app('cid', 'sec')
    loc = tmp_store.get('/api/monday/connect').headers['Location']; q = parse_qs(urlparse(loc).query)
    assert loc.startswith(config.AUTHORIZE_URL) and q['client_id'] == ['cid'] and q['redirect_uri'] == [config.REDIRECT_URI]
    assert q['scope'] == ['me:read boards:read'] and q['subdomain'] == ['ibm'] and q['state']
def test_connect_without_app_credentials_returns_with_error(...):   # Location == 'http://localhost:5120/?monday=error&reason=not_configured'
def test_callback_with_unknown_state_never_exchanges(...):          # reason=bad_state; fake_monday.calls == []
def test_callback_saves_token_and_user(...):   # TOKEN_URL -> 200 {'access_token': 'tok-1'}; API_URL -> me {'id': '7', 'name': 'Abide'}
                                               # token payload == {client_id, client_secret, code, redirect_uri}; 'monday=connected'; load_token()['user']['name'] == 'Abide'
def test_state_is_single_use(...):             # replaying the same callback -> bad_state
def test_denied_sign_in(...):                  # ?error=access_denied -> reason=denied
def test_status_never_contains_the_token(...): # b'tok-1' not in resp.data; connected True
def test_disconnect_forgets_the_token(...):    # POST disconnect -> load_token() is None; status connected False
def test_foreign_host_is_refused(tmp_store, vault):   # Host: evil.example:5121 -> 403
def test_token_never_logged(..., caplog, capsys):     # connect + callback at DEBUG; 'tok-1' absent from caplog.text and capsys
```

- [ ] **Step 2:** Run `python -m pytest tests/test_monday_signin.py -q`. Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: Implement.**
  - **DPAPI:** call `CryptProtectData` / `CryptUnprotectData` through `ctypes`, with `CRYPTPROTECT_UI_FORBIDDEN`, entropy `b's0L/monday'` and `LocalFree`. Raise `RuntimeError('DPAPI needs Windows')` elsewhere.
  - **Files:** `app.bin` and `token.bin`, written atomically (temp file + `os.replace`).
  - **`provision`:**
    - With no args it calls `input('monday Client ID: ')` and `getpass.getpass('monday Client Secret (input hidden): ')`; both must be non-empty or it returns 1.
    - `--import PATH` saves the credentials, then deletes the file.
    - A missing PATH prints a skip message and returns 0. An invalid file returns 2 and keeps the file.
    - It never prints either value.
  - **State:** `secrets.token_urlsafe(24)`, held in memory for up to 10 minutes and usable once.
  - **Authorize params:** `client_id, redirect_uri, scope, state, subdomain=ibm`.
  - **`finish()`:** POST `TOKEN_URL` JSON `{client_id, client_secret, code, redirect_uri}`, query `{ me { id name } }` with the new token, then call `save_token`.
  - **Callback:** redirect to `parse_frontend_origins()[0] + '/?monday=connected'`, or `…?monday=error&reason=<reason>` on failure.
  - **Host guard:** a blueprint `before_request` returns 403 unless the hostname of `request.host` is `localhost`, `127.0.0.1` or `[::1]`.
  - Never log or print tokens or bodies.

- [ ] **Step 4:** Run `python -m pytest -q`. Expected: all pass.

- [ ] **Step 5: Wire up the install and docs.**
  - **`package.json`:** add `"monday:provision": "python -m core.features.integrations.monday.provision"`, and append `&& python -m core.features.integrations.monday.provision --import monday-app.json` to `install:all`.
  - **Docs:** `UI_ARCHITECTURE.md` Layer 4 gets the row "`core/features/integrations/monday/` — monday.com sign-in and board sync (the only code that calls monday)". Add the same to the copilot-instructions backend tree.

- [ ] **Step 6: Live (user).**
  1. Run `npm run monday:provision` and enter the Client ID and Client Secret from the app's **Basic Information** page.
  2. Restart the backend.
  3. In Edge or Chrome, open `http://localhost:5121/api/monday/connect` and sign in. Expected: s0L opens with `?monday=connected`.
  4. Check with `Invoke-RestMethod http://localhost:5121/api/monday/status`. Expected: `connected: True` and the user's name.

  **If monday asks for an install that fails, shows "admin approval required", or shows any other error, stop and report it word for word.**

- [ ] **Step 7: Commit**

```powershell
git add core/features/integrations core/app_factory.py tests/conftest.py tests/test_monday_signin.py .gitignore package.json
git add -p UI_ARCHITECTURE.md .github/copilot-instructions.md
git commit -m "feat(monday): sign in with s0L's monday app"
```

---

### Task 2: Read the board

**Files:**
- Create: `core/features/integrations/monday/client.py`, `tests/fixtures/monday_board.json`
- Modify: `tests/conftest.py` (a `board` fixture loads the JSON)
- Test: `tests/test_monday_client.py`

**Interfaces:**
- Consumes: `oauth.post_json`, `oauth.access_token`, `oauth.NotConnected`, `credentials.clear_token`.
- Produces:
  - `MondayError` (`.kind` in `not_connected | rate_limited | api | network`; plain-language `str()`)
  - `graphql(query, variables=None, *, sleep=time.sleep) -> dict` returns `data`
  - `fetch_board() -> {columns: [{id, title, type}], groups: [{id, title}], items: [{id, name, group: {id, title}, column_values: [{id, type, text, from?, to?}]}]}`

- [ ] **Step 1: Write the fixture and the failing tests.**
  - The fixture `tests/fixtures/monday_board.json` uses the `fetch_board()` shape, the spec table's column ids, a `subtasks` column, and groups SAP `group_mksetb9d` and Oracle `group_mksnwvrd`. All names are invented.
  - **Items:**
    - 1001 SAP `006Ab00000XyZ12QAB`: Contoso, Status Active, TCV `12.5`, Date 2026-01-05 → 2026-06-30, Sales Stage Qualify
    - 1002 SAP `Fabrikam renewal (TBD)`: empty Status and TCV
    - 1003 and 1004 Oracle, both named `006Ab00000DupE01QAA`
    - 1005 SAP: Sales Stage Won
    - 1006 Oracle

```python
def test_fetch_board_follows_cursor(...):        # page 1 (3 items, cursor 'c1'), page 2 (3, None) -> 6; 2nd variables['cursor'] == 'c1'
def test_rate_limited_then_ok(...):              # 429 + Retry-After 2 -> sleep(2) -> data
def test_complexity_budget_retry(...):           # errors[0].extensions {code: 'COMPLEXITY_BUDGET_EXHAUSTED', retry_in_seconds: 7} -> sleep(7)
def test_gives_up_after_three_retries(...):      # always 429 -> MondayError 'rate_limited'; 4 requests
def test_requests_carry_version_and_token(...):  # headers['API-Version'] == '2026-07'; headers['Authorization'] == 'tok-1'
def test_dead_token_signs_out(vault, ...):       # 401 -> MondayError 'not_connected', 'Sign in to monday again (Settings → monday).'; load_token() is None
def test_client_never_writes():                  # 'mutation' not in the client.py source
```

- [ ] **Step 2:** Run `python -m pytest tests/test_monday_client.py -q`. Expected: FAIL.

- [ ] **Step 3: Implement `client.py`.**
  - **Request:** POST `API_URL` with `{query, variables}` and a 30s timeout.
  - **Retries:** on 429, `COMPLEXITY_BUDGET_EXHAUSTED` or `RATE_LIMIT_EXCEEDED`, sleep `min(60, retry_in_seconds or Retry-After or 10)`. Give up after 3 retries with `'monday is busy. Try again in a minute.'`.
  - **Sign-in errors:** a 401 or `NotConnected` → `clear_token()` and `not_connected`.
  - **Other errors:** another GraphQL error becomes `api` with monday's first message. Status 0 becomes `'Could not reach monday. Check your connection.'`.
  - **Query:** `boards(ids: [BOARD_ID]) { columns { id title type } groups { id title } items_page(limit: 500) { cursor items { id name group { id title } column_values { id type text ... on TimelineValue { from to } } } } }`, then `next_items_page(cursor:, limit: 500)` until the cursor is null.

- [ ] **Step 4:** Run `python -m pytest -q`. Expected: all pass.

- [ ] **Step 5: Live column check.** The agent may run this; it prints column metadata only.

```powershell
python -c "from core.features.integrations.monday import client; b = client.fetch_board(); print(len(b['items']), 'items in', len(b['groups']), 'groups'); [print(c['id'], '|', c['title'], '|', c['type']) for c in b['columns']]"
```

Gate:
- Every column id in the spec table is present.
- Record the ids and exact titles of B&P, Asset, Associates, Total Band, Center Mix, Deal Staffing Full, People, People 1 and Owner, plus the type names of the subitems and doc columns, for Task 3.
- **If a spec-table column is missing, stop and report.**

- [ ] **Step 6: Commit** `git add core/features/integrations/monday/client.py tests/conftest.py tests/fixtures/monday_board.json tests/test_monday_client.py; git commit -m "feat(monday): read-only board client"`

---

### Task 3: Board columns in the field index

**Files:**
- Modify:
  - `shared/field_index.json`, `scripts/build-field-registry.mjs`, `FIELD_REGISTRY.md` (generated)
  - `core/shared/field_index.py`, `core/features/deals/writes.py`, `core/shared/migrations.py`
  - `frontend/src/shared/constants/fieldIndex.js`, `frontend/src/features/isbd/isbdSave.js`, `frontend/src/features/isbd/isbdPrefillMap.js`
  - `tests/fixtures/monday_board.json` (add the nine columns from Task 2), `UI_ARCHITECTURE.md` (owners table)
- Test: `tests/test_field_index.py`, `tests/test_ownership.py`, `tests/test_migrations.py`, `tests/test_isbd_roundtrip.py`, `tests/test_review_fixes.py`, `frontend/src/shared/constants/fieldIndex.test.js`, `frontend/src/features/isbd/isbdSave.test.js`

**Interfaces (produces):**
- **The index:**
  - New owner `"monday": "Produced by the monday.com board and stored as the board has it. Written only by the monday sync (core/features/integrations/monday/writer.py)."`
  - A per-field `"monday"` block: `{column_id, title}`, with optional `scale` and `part` (`"from"` | `"to"`), or `{"source": "item_id" | "group"}` for row metadata.
- **`core/shared/field_index.py`:**
  - `is_linked(deal, owner) -> bool`. For `gssm` it's `gssm_workbook_id or gssm_synced_at`. For `monday` it's `monday_item_id`.
  - `deal_editable(key, deal) -> bool`: owner `deal`, or `editable_until_linked` and not `is_linked(deal, owner)`.
  - `monday_bindings() -> tuple[(key, block), ...]`
- **`writes.py`:** `prepare_deal_write(deal, payload, *, owners, enforce_required=True)`. `_writable` uses `fi.deal_editable`. `is_gssm_linked` is replaced by `fi.is_linked(deal, 'gssm')`.
- **`fieldIndex.js`:**
  - `isLinked(deal, owner)` and `isMondayLinked(deal)`.
  - `isEditable(key, deal)` becomes: `deal`/`isbd` owners → true; `editable_until_linked` → `!isLinked(deal, owner)`; anything else → false.

- [ ] **Step 1: Write the failing tests**

```python
# test_field_index.py: replace test_sales_stage_is_its_own_isbd_field
def test_sales_stage_is_monday_owned_on_the_deal():   # owner 'monday', path 'sales_stage'
def test_monday_bindings_are_unique_and_cover_the_board():   # (column_id or source, part) unique; keys >= the 35 in the Step 3 table
def test_people_columns_are_read_only():              # monday_people, monday_people_1, monday_owner: no editable_until_linked
# test_ownership.py
def test_monday_fields_editable_until_linked(tmp_store):      # unlinked: PUT {'status': 'Active', 'sales_stage': 'Won'} -> 200
def test_monday_fields_refused_once_linked(tmp_store):        # monday_item_id '1001': PUT status -> 409; PUT market -> 200
def test_monday_row_fields_never_client_writable(tmp_store):  # PUT {'monday_item_id': '9'} -> 409
def test_gssm_link_does_not_lock_monday_fields(tmp_store):    # gssm_workbook_id 7: PUT client_name -> 200
def test_monday_link_does_not_lock_gssm_timelines(tmp_store): # monday-linked, no GSSM link: PUT timelines -> 200
def test_gssm_sync_refuses_monday_fields(tmp_store):          # /gssm-sync {'status': 'X'} -> 409
def test_monday_writer_may_clear_required_fields():           # prepare_deal_write({}, {'client_name': ''}, owners={'monday'}, enforce_required=False) -> no error
# test_migrations.py
def test_isbd_sales_stage_moves_to_the_unlinked_deal():   # isbd_data {sales_stage: 'Qualify', term: '36'} -> deal sales_stage 'Qualify'; isbd_data == {'term': '36'}
def test_isbd_sales_stage_dropped_on_linked_deal():       # monday_item_id set -> not copied; key removed from isbd_data
```

  - **Generic iSBD tests:** `swb_stage` is the example iSBD-only field in `test_isbd_roundtrip.py:51,57`, `test_review_fixes.py:39,43` and `isbdSave.test.js`. Swap it for `term`.
  - **`fieldIndex.test.js`:**
    - `sales_stage` is owned by `monday`.
    - `isEditable('status', {})` is true; `isEditable('status', {monday_item_id: '1'})` is false.
    - `isEditable('client_name', {gssm_workbook_id: 7})` is true.
    - `isEditable('monday_item_id', {})` is false.
  - **`isbdSave.test.js`:** an edited `sales_stage` goes to `dealUpdate` on an unlinked deal and nowhere on a linked one.

- [ ] **Step 2:** Run `python -m pytest -q` and `npm --prefix frontend test`. Expected: the new tests fail.

- [ ] **Step 3: Edit the index.**
  - Existing fields get `"owner": "monday", "editable_until_linked": true` plus the block below. `sales_stage` and `swb_stage` move to top-level paths and keep their iSBD labels. `deal_type` changes type to `text`.
  - New fields go in section `"monday"`.
  - Use the titles printed by Task 2, not this table's.

| key | monday block |
|---|---|
| `opportunity_number` | `name` (Opportunity) |
| `client_name` | `dropdown_mkqy4mkc` |
| `project_name` | `text_mkqypdsv` |
| `status` | `color_mkqypejx` |
| `implementation_type` | `color_mkqyaeva` |
| `currency` | `color_mkqyhjk0` |
| `sector` | `dropdown_mksmcb` |
| `industry` | `dropdown_mksmkbj8` |
| `deal_type` | `text_mkxcyckc` |
| `estimated_value` | `numeric_mkqyh0mz`, TCV ($M), `scale: 1000000` |
| `project_start_date` | `timerange_mksghf1v`, `part: from` |
| `lead_ssc` | `color_mkqyvgvy` |
| `solution_consultant_2` / `_3` / `_4` | `color_mksmhqb` / `color_mksmnwx4` / `color_mksmc3ry` |
| `tt_executive` | `color_mkqy18z3` |
| `sales_stage` | `dropdown_mm25w58s` |
| `swb_stage` | `dropdown_mm2513h7` |
| new `project_end_date` (date) | `timerange_mksghf1v`, `part: to` |
| new `close_quarter`, `forecast_category`, `lead_sl` | `dropdown_mm25b4qb`, `dropdown_mm25d2jn`, `dropdown_mm25z11` |
| new `greenstar_dca_link`, `solutioning_pov` (text) | `text_mm408f48`, `long_text_mm25w1z6` |
| new `staffing_bp`, `staffing_asset`, `staffing_associates`, `staffing_total_band`, `staffing_center_mix`, `staffing_full` | ids from Task 2 |
| new `monday_people`, `monday_people_1`, `monday_owner` (person; **not** editable) | ids from Task 2 |
| new `monday_item_id`, `monday_group` (text; not editable) | `{"source": "item_id"}`, `{"source": "group"}` |
| new `monday_synced_at`, `monday_missing_since` (date; not editable) | no block |

  - **Registry:** `build-field-registry.mjs` gains a "monday column" column, rendered as `title (\`column_id\`)` or the source name.

- [ ] **Step 4: Implement.**
  - **Loaders and write gate:** as listed under Interfaces.
  - **Migration (`route_isbd_values`):** a value fills an empty top-level deal field when `fi.deal_editable(key, deal)`. Otherwise it's skipped as `owned by {owner}; the deal record is the source`.
  - **`isbdSave.js`:** `if (owner !== 'deal') continue` → `if (!isEditable(key, deal)) continue`.
  - **`isbdPrefillMap.js:144`:** read `monday` owners from the deal too.

- [ ] **Step 5:** Run `npm run registry`, then `python -m pytest -q` and `npm --prefix frontend test`. Expected: all pass.

- [ ] **Step 6: Commit** `git add -p` the modified files, then `git commit -m "feat(monday): board columns in the field index"`.

---

### Task 4: Sync the board into deals

**Files:**
- Create: `core/features/integrations/monday/mapping.py`, `…/monday/writer.py`, `…/monday/sync.py`
- Modify: `core/features/deals/services.py`, `…/monday/routes.py`
- Test: `tests/test_monday_sync.py`

**Interfaces:**
- Consumes: `client.fetch_board`, `client.MondayError`, `fi.monday_bindings`, `prepare_deal_write(..., enforce_required=False)`.
- Produces:
  - **`mapping.py`:**
    - `IGNORED_COLUMN_TYPES = frozenset({'subtasks', 'doc', 'direct_doc'})`. Adjust it to Task 2's type names.
    - `item_values(item) -> dict[str, str]` covers every bound key plus `monday_item_id` and `monday_group` (the group title). An empty cell is `''`.
    - `unknown_columns(columns) -> list[{id, title, type}]`
  - **`writer.write_monday_fields(deal, values, *, synced_at) -> None`:** validates with `owners={'monday'}` and raises `ValueError` on a refusal. It applies the values, stamps `monday_synced_at` and drops `monday_missing_since`. It is the only caller that uses `owners={'monday'}`.
  - **`services`:** `get_activities_with_defaults(data=None)` and `build_new_deal(deal_id, changes, data=None)` reuse a store already loaded.
  - **`sync.sync_board(data, board, *, now_iso) -> dict`** mutates `data` and returns `{created, updated, linked, unchanged, gone, replaced: [{deal_id, key, label, old}], duplicates: [{opportunity_number, item_ids}], plain_text_names: [{item_id, name}], unknown_columns}`.
  - **`POST /api/monday/sync`** with body `{dry_run?: bool}`:
    - fetch → `load_data` → `sync_board` → `save_data` unless `dry_run` → return the summary;
    - `MondayError` → `not_connected` 401, `rate_limited` 429, otherwise 502, with `{error}`.

    `status.last_sync` becomes the newest `monday_synced_at`.

Rules:
- **Reading values:**
  - `name` is stored verbatim.
  - A timeline uses `from`/`to` truncated to `[:10]`.
  - Numbers: `format((Decimal(text) * scale).normalize(), 'f')`.
  - Everything else is `text or ''`.
- **Matching rows to deals:**
  - A deal whose `monday_item_id` matches the row is updated when anything differs.
  - An unlinked deal links to a row only when the row name appears on exactly one row and exactly one unlinked deal has that exact `opportunity_number`. `replaced` records every filled value the link changed.
  - Any other row becomes a new deal: `build_new_deal(next id, {}, data=data)`, then `write_monday_fields`.
- **Rows that left the board:** linked deals whose row is absent get `monday_missing_since = now_iso` and keep their values.
- **Flags:**
  - `plain_text_names` are names that don't match `^006[A-Za-z0-9]{15}$`.
  - `duplicates` are names on more than one row.
- Never touch non-monday fields.

- [ ] **Step 1: Write the failing tests** (`tmp_store`; `client.fetch_board` patched to return `board`)

```python
@pytest.mark.parametrize('cell,stored', [('0.025', '25000'), ('400', '400000000'), ('2.675', '2675000'), ('12.5', '12500000')])
def test_tcv_is_converted_exactly(cell, stored): ...
def test_item_values_reads_every_bound_column(board):   # item 1001: opportunity '006Ab00000XyZ12QAB', client 'Contoso', status 'Active',
                                                        # project dates 2026-01-05 / 2026-06-30, sales_stage 'Qualify', monday_group 'SAP'
def test_dry_run_reports_and_writes_nothing(tmp_store, board):   # created == 6; deals file bytes unchanged
def test_sync_creates_full_deals_for_every_group(tmp_store, board):   # 6 deals, all with activities and monday_item_id; 1003 in 'Oracle'
def test_second_sync_changes_nothing(tmp_store, board):          # 2nd summary: created 0, updated 0, unchanged 6
def test_unlinked_deal_links_when_opportunity_is_unique(tmp_store, board):   # unlinked '006Ab00000XyZ12QAB' gets monday_item_id '1001'; client 'Contoso'
def test_link_reports_replaced_values(tmp_store, board):         # deal status 'On Hold', estimated_value '5000000'; row 1001 has TCV 12.5
                                                                 # -> replaced has status 'On Hold' and estimated_value '5000000'
def test_duplicate_opportunity_never_links(tmp_store, board):    # unlinked '006Ab00000DupE01QAA' stays unlinked; 1003 and 1004 become deals; duplicates lists it
def test_plain_text_names_are_flagged_and_kept(tmp_store, board):
def test_renamed_item_updates_linked_deal(tmp_store, board):     # linked 1001 with opportunity 'OLD' -> updated to '006Ab00000XyZ12QAB'; deal count unchanged
def test_gone_row_is_flagged_and_kept(tmp_store, board):         # linked item 999 -> monday_missing_since set, values kept, still linked (PUT status -> 409)
def test_reappearing_row_clears_missing_flag(tmp_store, board):
def test_group_move_updates_group(tmp_store, board):
def test_unknown_columns_reported(tmp_store, board):             # extra {'id': 'text_new1', 'title': 'Notes', 'type': 'text'} listed; subtasks not
def test_writer_refuses_non_monday_keys():                       # {'market': 'X'} -> ValueError
def test_not_connected_is_401_plain_message(tmp_store, monkeypatch):
```

- [ ] **Step 2:** Run `python -m pytest tests/test_monday_sync.py -q`. Expected: FAIL.
- [ ] **Step 3:** Implement `mapping.py`, `writer.py`, `sync.py`, the `services` parameter and the route.
- [ ] **Step 4:** Run `python -m pytest -q`. Expected: all pass.
- [ ] **Step 5: Live dry run.** Restart the backend, then run `Invoke-RestMethod -Method Post http://localhost:5121/api/monday/sync -ContentType 'application/json' -Body '{"dry_run": true}' | Select-Object created, linked, updated, unchanged, gone`. Expected: `created + linked` equals the board's rows across all five groups, and nothing is saved. Report the counts to the user.
- [ ] **Step 6: Commit** `git add core/features/integrations/monday core/features/deals/services.py tests/test_monday_sync.py; git commit -m "feat(monday): sync board rows into deals"`

---

### Task 5: Linked deals in the UI, and Archives by Sales Stage

**Files:**
- Modify: `frontend/src/shared/constants/uiStates.js`, `frontend/src/features/deals/components/{DealDetailsPanel, DealList, ExportModal}.jsx`, `frontend/src/AppHeader.jsx`, `frontend/src/features/metrics/MetricsModule.jsx`, `frontend/src/features/home/components/QuickSetupWizard.jsx`, `frontend/src/features/isbd/{PptSlideView.jsx, IsbdModule.jsx}`
- Test: `frontend/src/shared/constants/uiStates.test.js`

**Interfaces:**
- Consumes: `isEditable` and `isMondayLinked` (Task 3).
- Produces:
  - `CLOSED_SALES_STAGES = ['Won', 'Lost', 'Submitted']` and `isClosedDeal(deal)`. A deal is closed when its Sales Stage is in the list or its `status` is in `CLOSED_STATUSES`, so unlinked legacy archives keep working.
  - `DeckLockContext` (exported from `PptSlideView.jsx`): `(fieldKey) => boolean`. `IsbdModule` provides `(key) => Boolean(ownerOf(key)) && !isEditable(key, deal)`, and `CellEdit` uses it instead of `LOCKED_OWNERS`.

Decisions:
- Every `CLOSED_STATUSES.includes(d.status)` call, plus ExportModal's local copy, becomes `isClosedDeal(d)`. Archive and Restore are hidden on monday-linked deals.
- **`DealDetailsPanel`:**
  - Inputs for fields where `!isEditable(key, deal)` render disabled.
  - A linked deal shows one `.chip` "From monday · synced {time}".
  - A deal with `monday_missing_since` shows "This row is no longer on the monday board. Its last values are kept."
- **`QuickSetupWizard`:** filter the full-setup payload with `isEditable(key, deal)`, the same way `timelines` already is.

- [ ] **Step 1:** Write `uiStates.test.js`: `it.each` over `{sales_stage: 'Won'}` → true, `{sales_stage: 'Submitted'}` → true, `{status: 'Archived'}` → true, and `{sales_stage: 'Qualify', status: 'Active'}` → false. Run `npm --prefix frontend test`. Expected: FAIL.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Run `npm --prefix frontend test` and `npm --prefix frontend run build`, then lint with `Push-Location frontend; npx eslint <touched files>; Pop-Location`. Expected: all clean.
- [ ] **Step 4: Commit** `git add -p` the touched files plus `git add frontend/src/shared/constants/uiStates.test.js`, then `git commit -m "feat(monday): read-only linked deals, archives by sales stage"`.

---

### Task 6: monday in Settings, sync at startup, and the first real sync

**Files:**
- Create: `frontend/src/shared/services/mondayService.js`, `frontend/src/features/settings/components/MondayTab.jsx`
- Modify: `frontend/src/features/settings/components/Settings.jsx` (tab + `initialTab` prop), `frontend/src/shared/useStore.js` (`settingsTab` + `openSettingsAt(tab)`), `frontend/src/App.jsx`, `UI_ARCHITECTURE.md` (Layer 3 + "How the data stays unified"), `.github/copilot-instructions.md` (frontend tree)

**Interfaces:**
- `mondayService`: `status()`, `sync({ dryRun } = {})`, `disconnect()`, and `connectUrl` (= `buildUrl('/api/monday/connect')`).

Decisions:
- **The monday tab:**
  - **App not set up on this computer:** "monday isn't set up on this computer yet. Ask whoever manages s0L for the monday app file."
  - **Not connected:** a **Connect monday** link-button (`target="_blank"`, `rel="noopener"`) with the hint "Opens monday's sign-in page. Use Edge or Chrome."
  - **Connected:**
    - "Signed in as {name}" and "Last sync {time}";
    - **Sync now** (`.btn-primary`);
    - **Disconnect** (through `ConfirmDialog`);
    - the last summary in plain words: N new, N updated, N linked, N no longer on the board, then the lists of replaced values, duplicate IDs, plain-text names and new columns.
- **Startup (App.jsx):** after deals load, if `status().connected`, run `sync()` in the background, then `loadDeals()`. A `not_connected` result shows the notice "monday: sign in again (Settings → monday)". Other errors appear in the tab only.
- **Return from sign-in (`?monday=…`):** open Settings on the monday tab, show the notice, and remove the param with `history.replaceState`.
- **Reason texts:**
  - `bad_state`: "The sign-in took too long or was started twice. Try Connect again."
  - `denied`: "Sign-in was cancelled."
  - `exchange_failed`: "monday didn't accept the sign-in. Try again."
  - `not_configured`: the not-set-up text above.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npm --prefix frontend test`, `npm --prefix frontend run build` and eslint on the touched files. Expected: clean.
- [ ] **Step 3: Docs.** `UI_ARCHITECTURE.md`:
  - Layer 3 gets `shared/services/mondayService.js`, "all monday API access".
  - "How the data stays unified" gets: board → sync (monday writer) → `dealStore`; monday-owned fields are read-only on linked deals.

  Mirror these in the copilot-instructions frontend tree.
- [ ] **Step 4: First real sync, with the user.**
  1. **Before** restarting anything, back up: `Copy-Item deals_data.json deals_data.backup-pre-monday.json`.
  2. Restart all three dev servers and reload s0L. The startup sync runs.

  Expected:
  - every board row is a deal;
  - linked deals show the "From monday" chip, with monday fields read-only;
  - deals at Sales Stage Won or Lost are under Archives;
  - Settings → monday shows the summary.

  If anything looks wrong, restore the backup and report.
- [ ] **Step 5: Final verification.** Run `python -m pytest -q`, `npm --prefix frontend test`, `npm --prefix frontend run build` and `node scripts/build-field-registry.mjs --check`. Expected: all green.
- [ ] **Step 6: Commit** `git add` the new files and `git add -p` the rest, then `git commit -m "feat(monday): monday tab and sync at startup"`.
