# Salesforce Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** s0L signs in to Salesforce per person, checks every monday-board deal against its opportunity, stores Salesforce's values in their own fields, shows board/Salesforce differences in the TT Exec view (TT Execs fix the board), fills the iSBD's Opportunity Owner, and writes down what the account can reach.

**Architecture:** A new `core/features/integrations/salesforce/` package mirrors monday's (config, credentials, oauth, client, mapping, check, writer, inventory, provision, routes). Cross-module pieces live in `core/shared/`: the DPAPI file store (moved out of monday), opportunity-ID parsing, and `reconcile.py` (differences + the board value for a fix), so the Salesforce and monday packages never import each other. The new owner `salesforce` is declared in `shared/field_index.json`; the frontend gets a header icon, a Settings tab, a TT Exec panel and read-only states driven by the index.

**Tech Stack:** Python 3 / Flask / urllib / ctypes DPAPI; React 19 / Zustand / Vitest; pytest.

**Spec:** [docs/superpowers/specs/2026-10-28-salesforce-integration-design.md](../specs/2026-10-28-salesforce-integration-design.md)

## Global Constraints

- Only the Flask backend calls Salesforce; only `salesforce/oauth.py:request()` makes HTTP calls to it. The client has no code that writes to Salesforce (GET only, plus the token/revoke POSTs).
- OAuth: web server flow + PKCE (`S256`), **no client secret anywhere**; callback `http://localhost:5121/api/salesforce/oauth/callback`; scopes `api refresh_token`; token/revoke bodies are form-encoded.
- Tokens: DPAPI-encrypted in `%LOCALAPPDATA%\s0L\salesforce`, entropy `b's0L/salesforce'`; never in a response, log line or `deals_data.json`.
- Calls go only to `https://` hosts ending `.salesforce.com` or `.force.com`.
- Owner `salesforce` has one writer: `salesforce/writer.py`. monday-owned fields stay written only by `monday/writer.py`.
- Only deals on the board are checked: `monday_item_id` set and no `monday_missing_since`.
- A blank Salesforce value never overwrites and is never a difference.
- s0L never adds Salesforce wording to the board; a value with no translation is investigate-only.
- Routes: local hosts only; every POST is JSON-only (415 otherwise). Board fixes: TT Execs only, `boards:write` sign-in only, asked first in the UI.
- Never commit (the user commits). Don't touch `core/features/integrations/client_logos/` (another session edits it).
- Every GSSM_SYNC boundary file is untouched. Run `npm run registry` after index edits.

## Review Focus

1. A board cell holding an ID plus a note: looked up, flagged, and never rewritten (Task 6 test `test_fix_refuses_a_cell_with_more_than_the_id`).
2. A person who can't see an opportunity: `not_returned` keeps earlier values read-only and says "wrong number, or you can't see it" (Task 5 `test_stops_resolving_keeps_last_values`).
3. Salesforce without "API Enabled": a plain 403 message, not a stack trace (Task 5 `test_check_without_api_access_says_so`).
4. Clicking the Salesforce icon while a monday sync runs: both share `SYNC_LOCK`, so neither overwrites the other's save (Task 1 `test_monday_and_salesforce_share_one_lock`).
5. An org without multi-currency (`CurrencyIsoCode` missing): the field is skipped, not a failed query (Task 5 `test_fields_the_org_lacks_are_skipped`).

---

### Task 1: Shared DPAPI store and one sync lock

**Files:**
- Create: `core/shared/vault.py`
- Modify: `core/features/integrations/monday/credentials.py` (keep module-level `SECRETS_DIR`, `protect`, `unprotect`, `_write`, `_read`, `_remove` names — the `vault` fixture patches them)
- Modify: `core/shared/state.py` (add `SYNC_LOCK = threading.Lock()`), `core/features/integrations/monday/routes.py` (`_sync_lock = SYNC_LOCK`)
- Test: `tests/test_vault.py`

**Interfaces:**
- Produces: `vault.protect(data: bytes, entropy: bytes) -> bytes`, `vault.unprotect(blob: bytes, entropy: bytes) -> bytes`, `vault.write_secret(folder, name, payload: dict, protect) -> None` (atomic: mkstemp + os.replace), `vault.read_secret(folder, name, unprotect) -> dict | None` (None when missing/unreadable), `vault.remove_secret(folder, name) -> None`; `state.SYNC_LOCK`.

- [ ] Test `test_secret_round_trip_and_unreadable_is_none` (fake protect = reverse bytes; a garbage file reads as None; remove of a missing file is fine) and `test_monday_and_salesforce_share_one_lock` (`monday.routes._sync_lock is state.SYNC_LOCK`).
- [ ] Run `python -m pytest tests/test_vault.py -q` → FAIL (no module).
- [ ] Implement; monday's `credentials.protect(data)` = `vault.protect(data, _ENTROPY)`.
- [ ] Run `python -m pytest -q` → all pass (monday tests unchanged).

### Task 2: Opportunity IDs

**Files:** Create `core/shared/opportunity_ids.py`; Test `tests/test_opportunity_ids.py`

**Interfaces:**
- Produces: `canonical_id(text: str) -> str | None` (15- or 18-char `006…` → canonical 18-char; None otherwise); `parse_cell(text: str) -> tuple[str, str | None]` with kinds `'id'`, `'id_with_text'`, `'two_ids'`, `'not_an_id'` (canonical only for the first two).

Suffix algorithm (not determined by the tests alone): per 5-char chunk of the first 15, `n = Σ 2**i` over positions `i` holding `A–Z`; suffix char = `'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'[n]`. For an 18-char input, upper-case the suffix, decode each char to 5 bits and set each letter's case in its chunk (bit → upper). Scan pattern for IDs inside text: `(?<![A-Za-z0-9])006[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?(?![A-Za-z0-9])`.

- [ ] Tests: `canonical_id('001A0000006Vm9r')`-style check using `'006A0000006Vm9r'` → `'006A0000006Vm9rIAC'`; wrong-case 18-char `'006a0000006vM9RIAC'` → `'006A0000006Vm9rIAC'`; `'0061234'` → None; `parse_cell` cases: exact ID → `('id', canonical)`, `'006A0000006Vm9rIAC (renewal)'` → `('id_with_text', …)`, `'XXX#006A0000006Vm9rIAC'` → `('id_with_text', …)`, two IDs → `('two_ids', None)`, `'TBD'` and `''` → `('not_an_id', None)`.
- [ ] Run → FAIL; implement; run → PASS.

### Task 3: The field index learns Salesforce

**Files:**
- Modify: `shared/field_index.json` — owner `salesforce`; section `salesforce` with link fields `salesforce_id` (`{"source":"id"}`), `salesforce_lookup` (`{"source":"lookup"}`), `salesforce_checked_at` (`{"source":"checked_at"}`), `salesforce_supplied` (`{"source":"supplied"}`, type `list`); stored fields `sf_name` (`Name`), `sf_stage` (`StageName`), `sf_close_date` (`CloseDate`), `sf_amount` (`Amount`), `sf_currency` (`CurrencyIsoCode`), `sf_forecast_category` (`ForecastCategoryName`), `sf_account_name` (`Account.Name`) — all owner `salesforce`, not editable; `opportunity_owner` → owner `salesforce`, `editable_until_linked: true`, `"salesforce": {"field": "Owner.Name"}` (labels/aliases kept). Bindings are Opportunity fields. No `compare` entries yet (pairs are chosen with the user after the inventory).
- Modify: `core/shared/field_index.py`, `frontend/src/shared/constants/fieldIndex.js`, `scripts/build-field-registry.mjs`; regenerate `FIELD_REGISTRY.md`.
- Test: `tests/test_field_index.py`, `tests/test_ownership.py`, `frontend/src/shared/constants/fieldIndex.test.js`

**Interfaces:**
- Produces (Python): `fi.salesforce_bindings() -> tuple[(key, block)]` (blocks with `field`; a field bound twice raises); `fi.compare_pairs() -> tuple[dict]` each `{'key', 'with', 'labels'}` from `salesforce.compare` (`with` must be monday-owned with a `column_id`, else ValueError); `fi.is_linked(deal, 'salesforce')` = `bool(deal.get('salesforce_id'))`; `fi.deal_editable` for owner `salesforce` = `editable_until_linked and key not in deal['salesforce_supplied']`.
- Produces (JS): `isLinked(deal,'salesforce')`, `isSalesforceLinked(deal)`, `isEditable` with the same rule.
- Registry: new column "Salesforce field" (`` `Owner.Name` ``, `row id`-style text for `source` blocks, `· compared with key` when `compare`); owner text `salesforce (deal-editable until Salesforce supplies it)`.

- [ ] Tests: OWNERS set gains `salesforce`; `test_opportunity_owner_fills_from_salesforce` (owner, binding `Owner.Name`); `test_salesforce_fill_fields_editable_until_supplied` (editable on `{}` and `{'salesforce_id': 'x'}`, locked with `{'salesforce_supplied': ['opportunity_owner']}`); `test_sf_fields_never_deal_editable`; drop `opportunity_owner` from `test_previously_dropped_fields_are_deal_owned`. Ownership route test: PUT `opportunity_owner` → 200 before supplied, 409 after. JS: the same two rules.
- [ ] Run → FAIL; implement; `npm run registry`; run pytest + `npm --prefix frontend test` → PASS.

### Task 4: Sign-in

**Files:**
- Create: `core/features/integrations/salesforce/{__init__,config,credentials,oauth,provision,routes}.py`
- Modify: `core/app_factory.py` (register `salesforce_blueprint`), `package.json` (`"salesforce:provision": "python -m core.features.integrations.salesforce.provision"`)
- Test: `tests/conftest.py` (fixtures `sf_vault`, `fake_salesforce`), `tests/test_salesforce_signin.py`

**Interfaces:**
- `config`: `API_VERSION='62.0'`, `SCOPES='api refresh_token'`, `REDIRECT_URI`, `AUTHORIZE_PATH='/services/oauth2/authorize'`, `TOKEN_PATH='/services/oauth2/token'`, `REVOKE_PATH='/services/oauth2/revoke'`, `BATCH_SIZE=200`.
- `credentials`: `valid_host(host) -> bool`; `save_app(host, client_id, release=False)`; `load_app() -> {'host','client_id','release'} | None` (`S0L_SALESFORCE_APP` file wins); `save_token/load_token/clear_token`.
- `oauth`: `request(method, url, *, form=None, headers=None, timeout=30) -> (status, body, headers)` (status 0 = unreachable); `OAuthError(reason)`, `NotConnected`; `begin() -> str`; `finish(state, code) -> user` (exchange, check `instance_url` host, read `Name, Email` with `SELECT Name, Email FROM User WHERE Id = '<id from the token's id URL>'`, store `{access_token, refresh_token, instance_url, user, connected_at}`); `access_token()`; `instance_url()`; `refresh(stale_token=None)` (400/401 → clear + NotConnected); `sign_out()`; `status() -> {'app_configured','connected','user','host'}`; `callback_reason(error) -> 'denied' | 'not_allowed'`.
- Routes: `GET /api/salesforce/status` (+ `last_check` added in Task 5), `GET|POST /api/salesforce/connect`, `GET /api/salesforce/oauth/callback` (redirects to `/?salesforce=connected|error&reason=…`), `POST /api/salesforce/disconnect`.

- [ ] Tests: authorize URL carries client_id, redirect, `S256` challenge, state, scope and no secret; finish posts a form with `code_verifier` and no `client_secret`, stores instance URL + user; bad/expired state → `bad_state`; non-Salesforce `instance_url` → `exchange_failed`; refresh once on 401 then retry (Task 5 exercises it through the client); `invalid_grant` on refresh clears the token; sign-out revokes the refresh token and forgets it; callback `error=access_denied` → `reason=denied`, any other error → `not_allowed`; status/connect responses never contain a token; POST connect without JSON → 415; provision refuses a non-Salesforce host.
- [ ] Run → FAIL; implement; run → PASS.

### Task 5: The check

**Files:**
- Create: `core/features/integrations/salesforce/{client,mapping,writer,check}.py`; add `POST /api/salesforce/check` and `last_check` to status in `routes.py`
- Test: `tests/test_salesforce_check.py`, fixture `tests/fixtures/salesforce_describe_opportunity.json`

**Interfaces:**
- `client`: `SalesforceError(kind, message)` kinds `not_connected|no_api|rate_limited|network|api`; `get(path_or_url) -> dict|list` (one refresh-and-retry on 401; `API_DISABLED_FOR_ORG`/`API_CURRENTLY_DISABLED` → `no_api`; `REQUEST_LIMIT_EXCEEDED` → `rate_limited`); `query(soql) -> list[dict]` (follows `nextRecordsUrl`); `describe(sobject) -> dict`; `objects() -> list[dict]`; `opportunities(ids, fields) -> list[dict]` (batches of `BATCH_SIZE`, `SELECT Id, … FROM Opportunity WHERE Id IN (…)`); `record_url(record_id) -> str | None` (`{instance_url}/{id}`).
- `mapping`: `available_fields(describe) -> set[str]` (Opportunity field names, plus `Rel.Field` when Opportunity has relationship `Rel` and the referenced object has `Field`); `query_fields(available) -> list[str]`; `skipped_fields(available) -> list[str]`; `record_values(record, fields) -> {key: text}` (None → `''`, numbers via `Decimal(...).normalize()` fixed-point, bool → `true/false`).
- `writer`: `write_salesforce_fields(deal, values, *, checked_at) -> list[replaced]` — stored fields as Salesforce has them; fill fields only when non-blank, `salesforce_supplied` = keys Salesforce gave a value; replaced = typed values a Salesforce value replaced (`{deal_id, key, label, old}`); everything through `prepare_deal_write(owners={'salesforce'}, enforce_required=False)`.
- `check`: `check_deals(data, lookup, *, now_iso) -> summary` where `lookup(ids) -> {canonical id: values}`; summary `{'checked','found','not_returned','not_an_id','two_ids','replaced'}`; `last_check(data) -> str | None`.
- Route: under `SYNC_LOCK`, describe → fields → `check_deals` → `summary['skipped_fields']` → save; errors → `{'error','kind'}` with 401/403/429/502.

- [ ] Tests: batches of 200 for 450 IDs; each cell kind sets `salesforce_lookup`; found stores `sf_*` and `salesforce_id`; `test_blank_never_overwrites_a_typed_owner`; `test_salesforce_value_replaces_and_locks` (replaced reported, `salesforce_supplied` set); `test_link_follows_the_number`; `test_stops_resolving_keeps_last_values`; `test_off_board_deals_are_skipped`; `test_fields_the_org_lacks_are_skipped`; `test_check_without_api_access_says_so` (403 + plain message); `test_session_expired_refreshes_once`; writer refuses a monday key.
- [ ] Run → FAIL; implement; run → PASS.

### Task 6: Differences and board fixes

**Files:**
- Create: `core/shared/reconcile.py`; add `GET /api/salesforce/differences` (salesforce routes) and `POST /api/monday/fix` (monday routes); add `set_cell(item_id, column_id, value) -> str` to `monday/client.py`
- Test: `tests/test_salesforce_differences.py`

**Interfaces:**
- `reconcile.differences(deal) -> list[dict]` rows `{'deal_id','kind','key','label','board','salesforce','fixable'}`, kinds `not_an_id`, `two_ids`, `not_returned`, `extra_text`, `full_id` (cell is exactly one ID, not canonical; fixable), `value` (compare pair differs after trim+casefold; Salesforce value translated by `labels` when a table exists; fixable when a translation exists). Only checked, on-board deals.
- `reconcile.board_fix(deal, key) -> str | None` (canonical ID for `opportunity_number` when `full_id`; translated value for a compare pair's board key when it differs; else None).
- `monday.client.set_cell`: `change_multiple_column_values` with `{column_id: value}`; returns the item `name` for `'name'`, else the cell text.
- `POST /api/monday/fix {deal_id, key}`: `_unless_board_writable`, TT Exec check as `assign`, deal on the board, `board_fix` not None (else 409 "s0L can't fix this one from Salesforce; look into it."), label columns: the value must be an active board label (else 409 naming it); writes, then `write_monday_fields(deal, {key: text})`, returns the deal.
- Differences route adds `record_url` per row and `last_check`.

- [ ] Tests: each kind from seeded deals; `test_blank_salesforce_value_is_no_difference`; value pair with a `labels` table (monkeypatch `fi.compare_pairs`): translated difference fixable, untranslated investigate-only; fix route: non-exec 403, full-ID fix writes the item name and stores the board's answer, `test_fix_refuses_a_cell_with_more_than_the_id`, label missing on the board → 409, POST without JSON → 415.
- [ ] Run → FAIL; implement; run → PASS.

### Task 7: Writing down what's there

**Files:** Create `core/features/integrations/salesforce/inventory.py`; `package.json` (`"salesforce:inventory": "python -m core.features.integrations.salesforce.inventory"`); Test `tests/test_salesforce_inventory.py`

**Interfaces:** `build_inventory(objects, describe) -> str` (markdown: every queryable object's name and label; full field tables — API name, label, type, active pick-list values — for Opportunity, Account, custom child objects of Opportunity, and objects whose name or label matches `/greenstar|estimat/i`; every child relationship of Opportunity listed); `main(argv=None)` writes `docs/salesforce/inventory.md` and prints the path.

- [ ] Tests: a fake describe with a custom `Estimate__c` child → its fields appear; only `describe`/`objects` are called (no `query`), so no record values can appear.
- [ ] Run → FAIL; implement; run → PASS.

### Task 8: Header icon, sign-in return and the check after each board sync

**Files:**
- Create: `frontend/src/shared/services/salesforceService.js`, `frontend/src/shell/salesforceBadge.js` (+ `.test.js`), `frontend/src/shell/SalesforceConnect.jsx`, `frontend/src/assets/integration-logos/salesforce.svg` (copy of `assets/practice-logos/salesforce.svg`)
- Modify: `frontend/src/AppHeader.jsx` (after `<MondayConnect />`), `frontend/src/App.jsx` (`?salesforce=` return + `SALESFORCE_SIGN_IN_ERRORS`: `not_configured`, `bad_state`, `denied`, `not_allowed`, `exchange_failed`), `frontend/src/shared/dealStore.js` (`salesforceCheck: {state, summary, message, at}`, `runSalesforceCheck({ ifConnected })`; `runMondaySync` success → `runSalesforceCheck({ ifConnected: true })`), `frontend/src/styles/layout.css` + `base.css` (logo/dot rules shared with monday's; round-dot whitelist)

**Interfaces:** `salesforceService`: `status()`, `connect()`, `disconnect()`, `check()`, `differences()`. `salesforceBadge(status, {connecting, checking, who, when}) -> {state, label}` — states/labels: `unknown`/'Salesforce', `unavailable`/"Salesforce isn't set up on this computer", `checking`/"Salesforce · checking the board's deals", `connected`/'Salesforce · connected as {name} · checked {when} · click to check now', `connecting`/'Finish signing in to Salesforce in your browser', `disconnected`/'Connect Salesforce'.

- [ ] Vitest for every badge state (mirroring `mondayBadge.test.js`).
- [ ] Run → FAIL; implement; run → PASS.

### Task 9: Settings tab and deal details

**Files:** Create `frontend/src/features/settings/components/SalesforceTab.jsx`; Modify `Settings.jsx` (tab `{ id: 'salesforce', label: 'Salesforce', subtitle: 'IBM Sales Cloud check' }`), `frontend/src/features/deals/components/DealDetailsPanel.jsx` (chip "From Salesforce · checked …" when linked; read-only "Salesforce" section from index fields with owner `salesforce` and a `salesforce.field`, shown only when linked)

- [ ] Tab shows status, who, last check, summary counts, skipped fields, replaced values, **Check now** and **Disconnect** (via `onConfirm`), and the not-set-up / not-connected lines.
- [ ] `npm --prefix frontend run build` → succeeds.

### Task 10: The TT Exec panel

**Files:**
- Create: `frontend/src/features/deals/salesforceDifferences.js` (+ `.test.js`), `frontend/src/features/deals/useSalesforceDifferences.js`, `frontend/src/features/deals/components/SalesforceCheckPanel.jsx`
- Modify: `frontend/src/features/deals/components/ExecDashboard.jsx` (stat "N differ from Salesforce"; panel after "Waiting for assignment"), `frontend/src/shared/services/mondayService.js` (`fix(dealId, key)`), `frontend/src/styles/deals.css`

**Interfaces:** `groupDifferences(rows, deals, myName) -> [{ exec, rows }]` — rows joined to their deal, grouped by `tt_executive` ('Unassigned' when blank), the signed-in exec's group first, then A–Z, Unassigned last; `describeDifference(row) -> string` (sentences per kind, e.g. not_returned: "Salesforce didn't return this opportunity: a wrong number, or you can't see it in Salesforce."). Hook `useSalesforceDifferences() -> { rows, lastCheck, loading, error, reload }` (reloads when `salesforceCheck.at` changes). Panel: table (deal, field, board, Salesforce, actions); **Update board** only for TT Execs on fixable rows → `ConfirmDialog` → `mondayService.fix` → `patchDeal` + reload; **Open in Salesforce** link when `record_url`.

- [ ] Vitest: grouping order (mine first, A–Z, Unassigned last) and the sentence for each kind.
- [ ] Run → FAIL; implement; run → PASS; frontend build succeeds.

### Task 11: Packaging

**Files:** Modify `packaging/build.ps1` (bundle `salesforce-app.json` only when `load_app()` returns `release: true`; otherwise note "Salesforce not bundled"), `packaging/launcher/s0L.cs` (set `S0L_SALESFORCE_APP` when the file exists; C# 5), Test `tests/test_packaging.py`

- [ ] Tests: bundled Salesforce app wins; a bad bundled file falls back to the store; no env uses the store.
- [ ] Run → FAIL; implement; run → PASS.

### Task 12: Docs and full verification

**Files:** `UI_ARCHITECTURE.md` (module row, owner table, data flow "Salesforce → deal", shared modules), `DESIGN.md` (header icon pair, TT Exec panel), `.github/copilot-instructions.md` (backend tree), `/memories/repo/salesforce.md`

- [ ] `python -m pytest -q` and `npm --prefix frontend test` → all pass; `npm --prefix frontend run build` → succeeds.
- [ ] Restart the backend task; in the browser: the Salesforce icon shows "Salesforce isn't set up on this computer" (no app provisioned), Settings → Salesforce renders, the TT Exec view renders the panel.
