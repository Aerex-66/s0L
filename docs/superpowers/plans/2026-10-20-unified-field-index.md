# Unified Field Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the many hand-kept field maps with one field index that every runtime and module derives from, so GSSM, Home, iSBD and the deal record can never disagree.

**Architecture:** `shared/field_index.json` declares every field that crosses a module or runtime boundary exactly once: key, label, type, storage path, owner, old names, GSSM cell (Excel A1) and iSBD labels. Thin loaders (`core/shared/field_index.py`, `frontend/src/shared/constants/fieldIndex.js`) derive every lookup from it. The server enforces ownership: GSSM-owned values are written only by a dedicated sync route and stored exactly as the workbook produces them.

**Tech Stack:** Flask 3 / Python 3.12, React 19 + Vite 7, pytest (new, dev-only), Vitest (new, dev-only).

**Spec:** No separate spec file. Decisions from the 2026-10-20 chat are recorded below under Global Constraints and Ownership Rules; the verified defect list is in repo memory `/memories/repo/audit-2026-10-20.md`.

## Global Constraints

- Home and GSSM never disagree; Home never makes its own calculation of a GSSM value (user, 2026-10-20).
- One index: no file other than `shared/field_index.json` may define a field key, alias, iSBD label or GSSM cell for a cross-module field (user: "too many varying types of indexes... needs to be unified").
- GSSM-owned values are stored verbatim (`"BAFO Price"`, not `"BAFO"`); no value rewriting on write.
- No silent drops: a write containing an unknown field fails with HTTP 400 naming the field.
- Approvals logic is out of scope (next plan: rule-driven approvals, SRR before PRR, override with warning).
- Air-gapped: no external network calls, CDNs or assets. UI follows DESIGN.md (tokens only, `--radius-*` = 0, light-first, `.chip` template for tags).
- Features never import other features; cross-feature code lives in `frontend/src/shared/`.
- Edits under `frontend/src/features/gssm/{calc,sheets,utils,components,hooks}/` get a GSSM_SYNC.md changelog entry.
- Python: `$py = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"`. Tests never touch the live `deals_data.json` (use the `tmp_store` fixture).
- Work happens on branch `feat/unified-field-index`, in place (dev servers run from this checkout).

## Ownership Rules

| Owner | Meaning | Who writes | Examples |
|---|---|---|---|
| `deal` | Entered in s0L | Home, Deal Details, wizard, iSBD — via `PUT /api/deals/:id` | identity, dates, classification (`client_type`, `review_status`…), `estimated_value`, `price_to_win`, contacts, resources, activities, `external_links`, `financials.service_line_target` |
| `gssm` | Produced by the workbook, stored verbatim | only `PUT /api/deals/:id/gssm-sync` | PTI outputs, inputs and policy (`services_revenue`, `contract_type`, `price_type`, `risk_rating`, …), `total_contingency`, `tcv` (= services revenue), `staffing`, `bid_metrics`, `gssm_ricefw`, `gssm_synced_at`, `gssm_workbook_id`, `timelines` (deal-editable until a workbook is linked: `editable_until_linked`) |
| `isbd` | Deck-only content, stored under `isbd_data.` | iSBD editor via `PUT /api/deals/:id/isbd` | `sales_stage`, `swb_stage`, complexity Y/N answers, narratives, tables |
| `derived` | Computed, never stored, read-only everywhere | compute functions | `geo_market`, `isbd_update_date`, `partner_name`, `solution_consultant`, `risk_consultant`, `quality_partner`, `delivery_start`, `term_months`, `total_resources`, `work_effort`, `onshore_offshore_pct`, `financial_assumptions` |
| `system` | Server-set | server only | `id`, `created_date`, `documents` |

Calls made for the user to check: GSSM's own names become canonical (`revenue`→`services_revenue`, `price_model`→`contract_type`, `pricing_type`→`price_type`, `risk_level`→`risk_rating`); iSBD "Sales Stage" is its own field, not deal `status`; iSBD cells backed by deal fields write back to the deal; never-synced deals keep their typed financials, shown read-only as "entered before GSSM"; the wizard's financial step captures `estimated_value` only; Home loses the editable risk level, contingency $ and "Calculate GP".

## Review Focus

- iSBD labels with doubled spaces, smart quotes, trailing `:` or `*` resolve to the same key in Python and JS → shared fixture test in Task 1.
- A GSSM sync arriving while the deal holds a deal-owned financial (`service_line_target`) keeps that value → `test_gssm_sync_keeps_deal_owned_financials` in Task 3.
- An iSBD draft saved in localStorage under old editor keys (`bid_date`) restores onto canonical keys → `restoreDraft maps legacy keys` in Task 4.
- A deal that never had a workbook shows the "not linked" financials state, blank read-only GSSM cells in the iSBD, and still exports → `financialRows unlinked` (Task 6) and `test_export_with_no_financials` (Task 4).
- A deal whose linked workbook vanished from the catalog gets no workbook rather than someone else's → `pickWorkbookForDeal returns null for missing link` in Task 5.

## File Structure

- Create: `shared/field_index.json` — the index (fields + `records` for activity/contact + `vocabularies`).
- Create: `core/shared/field_index.py`, `frontend/src/shared/constants/fieldIndex.js` — loaders and lookups.
- Create: `shared/test-fixtures/label_cases.json` — label normalization cases shared by both test suites.
- Create: `core/features/deals/writes.py` — owner-aware write validation and merge.
- Create: `core/shared/migrations.py` — load-time data migration.
- Create: `frontend/src/shared/utils/phases.js`, `frontend/src/features/isbd/isbdSave.js`, `frontend/src/features/home/stageReadiness.js`, `frontend/src/features/home/financialRows.js`, `frontend/src/shared/gssmData/pickWorkbook.js`.
- Create: `scripts/build-field-registry.mjs`; tests under `tests/` (Python) and `*.test.js` beside modules (JS).
- Delete: `shared/field_aliases.json`, `shared/deal_schema.json`, `frontend/src/shared/utils/fieldNormalizers.js`.

---

### Task 1: The field index, loaders and test harness

**Files:**
- Create: `shared/field_index.json`, `core/shared/field_index.py`, `frontend/src/shared/constants/fieldIndex.js`, `shared/test-fixtures/label_cases.json`, `requirements-dev.txt` (`pytest>=8`), `tests/conftest.py`, `tests/test_field_index.py`, `frontend/src/shared/constants/fieldIndex.test.js`
- Modify: `frontend/package.json` (devDependency `vitest@^3.2`, script `"test": "vitest run"`), `package.json` (script `"test"` running pytest then `npm --prefix frontend test`), `.gitignore` (`.superpowers/`)

**Interfaces:**
- Produces (Python, `core.shared.field_index`): `FIELDS: dict[str, dict]`, `RECORDS: dict`, `VOCABULARIES: dict`, `normalize_label(label: str) -> str`, `canonical_key(name: str) -> str` (unknown names returned unchanged), `owner_of(key) -> str | None`, `path_of(key) -> str | None`, `top_level_keys(*owners) -> frozenset[str]`, `section_keys(section: str, *owners) -> frozenset[str]`, `required_keys() -> tuple[str, ...]` (fields with `"required": "always"`), `isbd_key_for(label, slide_type=None) -> str | None` (slide-scoped labels win, then global labels), `gssm_cell(key) -> tuple[str, int, int] | None` (0-based), `legacy_value(key, value)`.
- Produces (JS, `shared/constants/fieldIndex.js`): `FIELD_INDEX`, `RECORDS`, `VOCABULARIES`, `normalizeLabel`, `canonicalKey`, `getField`, `ownerOf`, `pathOf`, `readPath(deal, key)`, `isEditable(key, deal) -> boolean` (owner `deal`, or `editable_until_linked` and no `deal.gssm_workbook_id`), `isbdKeyFor(label, slideTypeId)`, `gssmCell(key) -> {sheet,row,col}|null`, `fieldsWhere(pred) -> Array<[key, entry]>`.
- Produces (tests): fixture `tmp_store` in `tests/conftest.py`, which points `core.shared.state.DATA_FILE` at a temp file seeded with `{"deals": [], "master_contacts": [], "default_approvers": {}, "_contacts_migrated": true}`, resets `state._migrated`, and yields a Flask test client.
- Entry shape: `{"label", "type", "section", "path", "owner", "required"?: "always"|"setup", "editable_until_linked"?: true, "aliases"?: [..], "gssm"?: "Sheet!A1", "isbd"?: {"labels": [..], "slides"?: [..], "default"?, "options"?: [..]}, "legacy_values"?: {old: verbatim}}`. Types: `text number currency percent date select yn toggle person url list object`.

- [ ] **Step 1: Install harness** — `& $py -m pip install -r requirements-dev.txt`; `npm --prefix frontend install -D vitest@^3.2`. Expected: both exit 0.
- [ ] **Step 2: Write failing tests** — `tests/test_field_index.py` and `fieldIndex.test.js` assert the same facts:
  - keys unique; no alias equals any key or another alias; owner ∈ {deal, gssm, isbd, derived, system}; non-derived fields have a path; isbd-owned paths start with `isbd_data.`
  - `canonical_key`: `revenue`→`services_revenue`, `price_model`→`contract_type`, `pricing_type`→`price_type`, `risk_level`→`risk_rating`, `exec_client_type`→`client_type`, `opportunity_name`→`project_name`, `bid_date`→`bid_submission_date`, `rfp_request_date`→`rfp_submission_date`, `not_a_field`→`not_a_field`; `sales_stage` stays `sales_stage` with owner `isbd`
  - `isbd_key_for`: `"Bid Submission Date"`→`bid_submission_date`, `"TCV / NPV GP%"`→`tcv`, (`"Date"`, `risk_assessment`)→`risk_review_date`, `"Date"` with no slide → `None`, (`"Contract Type"`, `risk_assessment`)→`contract_type`, (`"Client"`, `executive_summary`)→`client_type`, (`"Client"`, `risk_assessment`)→`client_name`
  - `gssm_cell("services_revenue") == ("PTI_Estimator", 29, 1)`; `gssm_cell("opportunity_number") == ("Home", 21, 9)`; owners of `opportunity_owner service_line decision_date client_type engagement_type engagement_source review_status` are all `deal` with path == key
  - every `[raw, expected]` pair in `label_cases.json` normalizes identically (include `"T/T Cost  Amortized?"`, `"Program Mgr or Complex PM *"`, `"Client Name:"`, a curly-quote variant)
  - JS only: `isEditable('timelines', {gssm_workbook_id: 7}) === false`, `isEditable('timelines', {}) === true`, `isEditable('services_revenue', {}) === false`, `isEditable('client_name', {}) === true`
- [ ] **Step 3: Run to see them fail** — `& $py -m pytest -q tests/test_field_index.py`; `npm --prefix frontend test -- fieldIndex`. Expected: FAIL (modules missing).
- [ ] **Step 4: Author `shared/field_index.json`** from the existing maps: `shared/field_aliases.json`, `shared/deal_schema.json` (deal fields; activity/contact lists move to `records`), `isbd_maps.py` `ISBD_LABEL_MAP`, `isbdSlideTemplate.json` row keys/labels (slide-scope generic labels: Date, Client, Contract Type, Duration, # Resources, TCV, 3rd Party), `PptSlideView.jsx` `KEY_ALIASES`/`FIELD_TYPES`/`YN_DEFAULTS`/`DUAL_OPTION_TABLES` (old editor keys become aliases; types/defaults/options move onto entries), `gssmFieldMap.js` PTI and Home coordinates as A1 (`PTI_Estimator!B30` = row 29, col 1), plus `total_contingency` at `PTI_Estimator!B23`. Owners per the Ownership Rules. `legacy_values`: `price_type` {`BAFO`: `BAFO Price`, `Indicative`: `Indicative Price`, `B&P`: `B&P Price`}, `contract_type` {`T&M`: `Time And Materials`}. `vocabularies.risk_rating_label` takes the old `risk_level_numeric` map. Required: the 3 text identity fields `always`; `sector industry market implementation_type` `setup`.
- [ ] **Step 5: Implement both loaders** — label normalization: NFKC, curly quotes/dashes to ASCII, collapse whitespace, strip trailing `:`/`*`/spaces, lowercase.
- [ ] **Step 6: Run tests** — same commands. Expected: PASS.
- [ ] **Step 7: Commit** — `git add shared/field_index.json shared/test-fixtures core/shared/field_index.py frontend/src/shared/constants/fieldIndex.js frontend/src/shared/constants/fieldIndex.test.js tests requirements-dev.txt package.json frontend/package.json frontend/package-lock.json .gitignore; git commit -m "feat: add unified field index with Python and JS loaders"`

### Task 2: Backend and form contract read the index (no silent drops)

**Files:**
- Create: `core/features/deals/writes.py`, `tests/test_deals_contract.py`, `frontend/src/shared/constants/fieldMap.test.js`
- Modify: `core/shared/domain.py` (derive `DEAL_MUTABLE_FIELDS`, `REQUIRED_DEAL_FIELDS`, `ACTIVITY_MUTABLE_FIELDS`, `CONTACT_FIELDS` from the index), `core/shared/normalizer.py` (alias→key only, no value rewriting), `core/features/deals/deals.py`, `core/features/deals/services.py` (`'resources': {}`), `frontend/src/shared/constants/fieldMap.js` (drop `FIELD_MAP` and its unused helpers; `REQUIRED_TEXT_FIELDS`/`REQUIRED_REFERENCE_FIELDS` from index `required` + type; keep the reference-data getters)
- Delete: `shared/field_aliases.json`, `shared/deal_schema.json`, `frontend/src/shared/utils/fieldNormalizers.js`

**Interfaces:**
- Consumes: Task 1 Python loader.
- Produces: `prepare_deal_write(deal: dict, payload: dict, *, owners: set[str]) -> tuple[dict, tuple[int, str] | None]` in `writes.py` — canonicalizes keys (top level and nested `financials`/`isbd_data`), returns `(changes, None)` or `(None, (status, message))`; 400 lists unknown keys; nested sections merge, top-level fields replace. `apply_deal_write(deal, changes) -> None`. Generic PUT uses `owners={'deal', 'gssm'}` in this task (Task 7 tightens it).

- [ ] **Step 1: Write failing tests** — `tests/test_deals_contract.py` (uses `tmp_store`): `test_put_persists_previously_dropped_fields` (the 7 fields round-trip via GET); `test_put_unknown_field_returns_400_naming_it`; `test_put_alias_resolves_to_canonical` (`exec_client_type` → `client_type`); `test_new_deal_resources_is_object_and_put_resources_ok`; `test_contact_update_cannot_change_id`; `test_put_financials_merges_not_replaces` (existing `service_line_target` survives a PUT of `{"financials": {"services_revenue": "1"}}`). `fieldMap.test.js`: `REQUIRED_TEXT_FIELDS` equals `['opportunity_number','client_name','project_name']`, `REQUIRED_REFERENCE_FIELDS` contains `sector industry market implementation_type`.
- [ ] **Step 2: Run them** — `& $py -m pytest -q tests/test_deals_contract.py`; `npm --prefix frontend test -- fieldMap`. Expected: FAIL on silent drop, 200-on-unknown, list resources, id overwrite, replace-not-merge.
- [ ] **Step 3: Implement** `writes.py`, then route `PUT /api/deals/<id>`, `/financials`, `/resources`, `/contacts/<id>` through it (contacts whitelist = `RECORDS['contact']['fields']`); switch `domain.py`/`normalizer.py` to the index; delete the two JSON files and dead `fieldNormalizers.js`; rework `fieldMap.js`. Before running, list every frontend caller of `dealService.update`, `updateFinancials`, `updateResources`, `updateTimeline` and raw `/api/deals` writes (`grep -rn` under `frontend/src`) and confirm each key it sends is in the index — the new 400 must not break a working flow.
- [ ] **Step 4: Run all tests and the build** — `& $py -m pytest -q`; `npm --prefix frontend test`; `npm --prefix frontend run build`. Expected: all PASS, build succeeds.
- [ ] **Step 5: Commit** — `git commit -am "feat: deal writes validated against the field index; no silent drops"` (add new files first).

### Task 3: GSSM sync route, data migration, canonical bridge

**Files:**
- Create: `core/shared/migrations.py`, `tests/test_migrations.py`, `tests/test_gssm_sync.py`, `frontend/src/shared/utils/phases.js`, `frontend/src/shared/utils/gssmBridge.test.js`, `frontend/src/shared/utils/phases.test.js`
- Modify: `core/shared/state.py` (run `migrate_store` once per process; write `deals_data.backup-<YYYYmmdd-HHMMSS>.json` beside the data file before the first migrated save), `.gitignore` (`deals_data.backup-*.json`), `core/features/deals/deals.py` (new route), `frontend/src/shared/services/dealService.js`, `frontend/src/shared/utils/gssmBridge.js`, `frontend/src/shared/constants/gssmFieldMap.js` (remove `PTI`, `HOME`, `PTI_TO_DEAL_FINANCIALS`, `DEAL_FINANCIALS_TO_PTI_INPUTS`; keep layout constants `IMP_TL`, `STAFFING`, `BID_METRICS` and phase exports), `frontend/src/features/gssm/hooks/useDealSync.js`, `frontend/src/features/gssm/GssmModule.jsx` (pass `workbookId`), `frontend/src/features/home/components/Timeline.jsx` (use `matchPhase`), `GSSM_SYNC.md`

**Interfaces:**
- Consumes: Task 1 loaders, Task 2 `prepare_deal_write`/`apply_deal_write`.
- Produces: `migrate_deal(deal: dict) -> bool`, `migrate_store(data: dict) -> bool` (renames aliased keys at top level, in `financials` and in `isbd_data`; applies `legacy_values`; drops `financials._gssm_source`; `resources: []` → `{}`; moves deal-owned values found in `isbd_data` onto the deal when the deal field is empty, then removes them from `isbd_data`). Route `PUT /api/deals/<id>/gssm-sync` accepts only `gssm`-owned keys (409 names any other); replaces the gssm-owned subset of `financials` as a whole and keeps deal-owned keys; replaces top-level gssm keys present in the payload; returns the deal. JS: `dealService.syncFromGssm(dealId, payload) -> Promise<deal>`; `matchPhase(key) -> 'Prepare'|...|null` in `phases.js`; `extractFinancials` emits only canonical keys (cells from `gssmCell`), including `total_contingency` and `tcv` (= `services_revenue`); `mapDealToGssmEdits(deal)` returns timeline edits only; `useDealSync({..., workbookId})` sends `gssm_workbook_id` with every sync.

- [ ] **Step 1: Write failing tests** — `test_migrations.py`: a deal shaped like live deals 1–3 (`price_model: "Fixed Price"`, `pricing_type: "BAFO"`, `risk_level: "3"`, `revenue`, `tcv`, `_gssm_source`, `resources: []`) migrates to `contract_type: "Fixed Price"`, `price_type: "BAFO Price"`, `risk_rating: "3"`, `services_revenue`, `tcv`, no legacy keys, `resources == {}`; deal 4 shape (`pricing_type: "Indicative"`) gives `price_type: "Indicative Price"`; `isbd_data.bid_date` → `isbd_data.bid_submission_date`; second run returns `False`; `test_load_data_backs_up_once`. `test_gssm_sync.py`: `test_gssm_sync_keeps_deal_owned_financials` (before `{service_line_target: 27, labor_cost: "50", services_revenue: "90"}`, sync `{financials: {services_revenue: "100", price_type: "BAFO Price"}, gssm_workbook_id: 7}` → `{service_line_target: 27, services_revenue: "100", price_type: "BAFO Price"}`, link 7); `test_gssm_sync_rejects_deal_owned_key` (`client_name` → 409). `gssmBridge.test.js`: PTI rows built from `gssmCell` coordinates give `price_type === 'BAFO Price'`, `total_contingency`, `tcv === services_revenue`, and none of `revenue price_model pricing_type risk_level _gssm_source`; `mapDealToGssmEdits` has no `PTI_Estimator` edits. `phases.test.js`: `matchPhase('◆ PREPARE  Wk 1–4') === 'Prepare'`, `'Realize'` → `'Build'`, `'Deploy'` → `'Go-Live'`, `'nonsense'` → `null`.
- [ ] **Step 2: Run them** — `& $py -m pytest -q tests/test_migrations.py tests/test_gssm_sync.py`; `npm --prefix frontend test -- gssmBridge phases`. Expected: FAIL.
- [ ] **Step 3: Implement** migration + backup, sync route, bridge/field-map changes, `phases.js` (used by `Timeline.jsx` and the bridge), `syncFromGssm`, and switch `useDealSync` (including the `beforeunload` keepalive URL) to the sync route. Append a GSSM_SYNC.md entry for `hooks/useDealSync.js` (standalone impact: none).
- [ ] **Step 4: Run everything** — `& $py -m pytest -q`; `npm --prefix frontend test`; `npm --prefix frontend run build`. Expected: PASS.
- [ ] **Step 5: Live check** — restart the Flask task so migration runs; confirm a `deals_data.backup-*.json` exists and `GET /api/deals` shows `contract_type`/`price_type` on deals 1–4. Open a deal's GSSM module: sync chip reaches "synced" and the deal gains `gssm_workbook_id`.
- [ ] **Step 6: Commit** — `git commit -m "feat: owner-aware GSSM sync route, data migration, canonical bridge keys"`.

### Task 4: iSBD on the index

**Files:**
- Create: `frontend/src/features/isbd/isbdSave.js`, `frontend/src/features/isbd/isbdKeys.test.js`, `frontend/src/features/isbd/isbdSave.test.js`, `tests/test_isbd_roundtrip.py`
- Modify: `frontend/src/features/isbd/isbdSlideTemplate.json` (row keys = index keys; risk "Contract Type" row → `contract_type`; drop `prefill.path` where it equals the field's own index path), `isbdPrefillMap.js` (non-isbd fields prefill from `readPath`; computes keep their names; `financial_assumptions` reads canonical keys), `PptSlideView.jsx` (keys via `isbdKeyFor(label, slideTypeId) ?? labelToKey(label)`; types/defaults/options from the index; GSSM-owned and derived cells read-only), `useIsbdDocument.js` (draft restore passes keys through `canonicalKey`), `IsbdModule.jsx` (accepts `onUpdate`; save calls `splitIsbdSave`), `core/features/documents/isbd_maps.py` (delete `ISBD_LABEL_MAP`), `isbd_extract.py` / `isbd_export.py` (use `isbd_key_for(label, slide_type)`), `records.py` (`store_isbd_data_on_deal` routes by owner), `core/features/deals/deals.py` (`PUT /isbd` accepts isbd-owned keys only)

**Interfaces:**
- Consumes: Task 1 loaders, Task 2 writes.
- Produces: `splitIsbdSave(flat: object, deal: object) -> { dealUpdate: object, isbdData: object }` (deal-owned keys whose value differs from the deal go to `dealUpdate`; isbd-owned keys go to `isbdData`; gssm/derived keys are dropped); `restoreDraft` behaviour in `useIsbdDocument`; Python `apply_isbd_import(deal: dict, fields: dict) -> None` (isbd-owned → `isbd_data`; deal-owned fill only empty deal fields; gssm/derived ignored).

- [ ] **Step 1: Write failing tests** — `isbdKeys.test.js`: for every template row `isbdKeyFor(label, slideId) === key` (zero mismatches; today's 37 drifts fail); every template key exists in `FIELD_INDEX`. `isbdSave.test.js`: `splitIsbdSave({client_name:'New', swb_stage:'3', tcv:'1', geo_market:'x'}, {client_name:'Old'})` → `{dealUpdate:{client_name:'New'}, isbdData:{swb_stage:'3'}}`; `restoreDraft maps legacy keys` (`{bid_date:'d'}` → `bid_submission_date`). `test_isbd_roundtrip.py`: build a deck in the test with python-pptx (slides titled "Deal Profile Summary" and "Executive Summary"; 2-col rows `Bid Submission Date | 2026-11-01`, `Opportunity Name | Proj X`, `TCV / NPV GP% | $5M`) → `extract_isbd_fields` keys `bid_submission_date`, `project_name`, `tcv`; `apply_isbd_import` stores only `bid_submission_date` in `isbd_data` and sets `project_name` only when empty; export with `{"bid_submission_date": "2026-12-01"}` writes that text into the cell; `test_export_with_no_financials` succeeds.
- [ ] **Step 2: Run them** — `npm --prefix frontend test -- isbd`; `& $py -m pytest -q tests/test_isbd_roundtrip.py`. Expected: FAIL.
- [ ] **Step 3: Implement** the template, prefill, editor, save split, draft restore, backend extract/export/import routing. Remove `ISBD_LABEL_MAP`, `KEY_ALIASES`, `FIELD_TYPES`, `YN_DEFAULTS`, `TEXT_DEFAULTS` and `DUAL_OPTION_TABLES` (their data now lives in the index).
- [ ] **Step 4: Run everything** — pytest, vitest, build. Expected: PASS.
- [ ] **Step 5: Live check** — in the iSBD module edit Client Name and an iSBD-only field, Save, switch to Home and back: the client name shows everywhere and the iSBD-only value persists; GSSM-backed cells are read-only.
- [ ] **Step 6: Commit** — `git commit -m "feat: iSBD editor, import and export share index keys"`.

### Task 5: One workbook link per deal

**Files:**
- Create: `frontend/src/shared/gssmData/pickWorkbook.js`, `frontend/src/shared/gssmData/pickWorkbook.test.js`
- Modify: `frontend/src/shared/gssmData/index.js` (export it), `frontend/src/features/gssm/shell/useGssmWorkbook.js` (auto-load via `pickWorkbookForDeal`), `frontend/src/features/gssm/shell/sheetGroups.js` (remove `saveActiveWorkbook`/`getActiveWorkbook`), `frontend/src/features/greenstar/GreenstarModule.jsx` (no most-recent fallback; message "No GSSM workbook linked to this deal")

**Interfaces:**
- Consumes: `deal.gssm_workbook_id` written by Task 3's sync.
- Produces: `pickWorkbookForDeal(deal, catalog) -> catalogItem | null` — linked id first, then a unique `opportunityNumber` match, else `null`; never mutates `catalog`.

- [ ] **Step 1: Write failing tests** — linked id wins over opp# match; opp# fallback; `pickWorkbookForDeal returns null for missing link` (link points at an absent id and opp# has no match while catalog is non-empty); catalog array unchanged after the call.
- [ ] **Step 2: Run** — `npm --prefix frontend test -- pickWorkbook`. Expected: FAIL.
- [ ] **Step 3: Implement** and wire both callers.
- [ ] **Step 4: Run** vitest + build. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: deals link to one GSSM workbook; Greenstar never borrows another deal's"`.

### Task 6: Home reads the shared record; GSSM values read-only

**Files:**
- Create: `frontend/src/features/home/stageReadiness.js`, `stageReadiness.test.js`, `frontend/src/features/home/financialRows.js`, `financialRows.test.js`
- Modify: `frontend/src/features/home/HomeModule.jsx` (no private fetch; use the `deal` prop; pass the shell `onUpdate` to tabs; readiness from `computeStageReadiness`), `components/Financials.jsx` (render `financialRows`; GSSM rows read-only with a `.chip` "From GSSM · synced <time>"; only `service_line_target` editable; no Calculate GP / risk level select / contingency inputs; empty state "Link a GSSM workbook in the GSSM module to see financials"), `components/Timeline.jsx` (painter disabled with a note when `!isEditable('timelines', deal)`), `components/QuickSetupWizard.jsx` + `wizard/WizardSteps.jsx` (financial step edits `estimated_value` via `dealService.update`), `frontend/src/shared/utils/financialsHelpers.js` (`services_revenue`)

**Interfaces:**
- Consumes: Task 1 JS loader.
- Produces: `computeStageReadiness(deal) -> {[stageId]: {done,total,pct,complete,manualComplete,status}}` (commercial uses `services_revenue`, `labor_cost`, `price_type`; risk uses `risk_rating` or `total_contingency`; governance unchanged); `financialRows(deal) -> { state: 'linked'|'pre_gssm'|'unlinked', rows: Array<{key,label,value,editable}> }`.

- [ ] **Step 1: Write failing tests** — commercial check passes with `services_revenue` + `labor_cost` (fails today on `fin.revenue`); risk check passes with `risk_rating: "3"`; `financialRows unlinked` (no values, no `gssm_synced_at` → `state: 'unlinked'`); synced deal → every GSSM row `editable: false`, `service_line_target` `editable: true`; deal with values but no `gssm_synced_at` → `state: 'pre_gssm'`.
- [ ] **Step 2: Run** — `npm --prefix frontend test -- stageReadiness financialRows`. Expected: FAIL.
- [ ] **Step 3: Implement** helpers and wire the components.
- [ ] **Step 4: Run** vitest, lint on changed files, build. Expected: PASS, no new lint errors.
- [ ] **Step 5: Live check** (light theme, then both dark themes) — Financials shows read-only GSSM values; editing a timeline on an unlinked deal shows up in iSBD's proposed timeline without a reload; the wizard completes on a new deal.
- [ ] **Step 6: Commit** — `git commit -m "feat: Home reads the shared deal record; GSSM values are read-only"`.

### Task 7: Enforce ownership, retire old indexes, generate the registry

**Files:**
- Create: `scripts/build-field-registry.mjs`, `tests/test_ownership.py`, `frontend/src/shared/constants/fieldRegistry.test.js`
- Modify: `core/features/deals/deals.py` (generic PUT `owners={'deal'}`; `PUT /timeline` 409 when linked), `deal_structure.py` + `core/features/settings/settings.py` (remove unused `FINANCIAL_FIELDS` and `/api/financial-structure`), `frontend/src/shared/constants/uiStates.js` (remove the conflicting `PHASE_COLORS`) + `components/Activities.jsx` (drop its unused import), `FIELD_REGISTRY.md` (generated), `UI_ARCHITECTURE.md` (contracts table: `field_index.json` + `domain_constants.json`; ownership rule), `.github/copilot-instructions.md` (shared/ list and field rules), `package.json` (`"registry": "node scripts/build-field-registry.mjs"`)

**Interfaces:**
- Consumes: everything above.
- Produces: `node scripts/build-field-registry.mjs [--check]` writes `FIELD_REGISTRY.md` (one table per section: key, label, owner, path, GSSM cell, iSBD labels, old names), or exits 1 when the file is stale.

- [ ] **Step 1: Write failing tests** — `test_ownership.py`: generic PUT `{"financials": {"services_revenue": "1"}}` → 409 naming the field; `PUT /financials {"labor_cost": 1}` → 409; `PUT /financials {"service_line_target": 30}` → 200; `PUT /timeline` with `gssm_workbook_id` set → 409, without → 200. `fieldRegistry.test.js`: `--check` exits 0.
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Implement**, regenerate the registry, update the docs.
- [ ] **Step 4: Full verification** — `npm test` (pytest + vitest) all pass; `npm --prefix frontend run lint` has no errors in files changed on this branch (`git diff --name-only main`); build passes; the dev servers serve a deal end-to-end (Home, GSSM sync, iSBD save/export, Greenstar).
- [ ] **Step 5: Commit** — `git commit -m "feat: enforce field ownership server-side; registry generated from the index"`.
