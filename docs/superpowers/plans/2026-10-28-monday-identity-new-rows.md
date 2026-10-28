# monday Identity, TT Exec Rules and New Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People pick their board name once after connecting monday ("Welcome, name · Not you?"); TT Execs (names in monday's TT Exec column) may assign people and add new clients; the New Deal form adds the row to the monday board and the linked deal to s0L in one step, with non-execs set as Lead SSC automatically.

**Architecture:** The name lives in the existing `preferences.solutioner` (what My deals already uses), bound to the monday email that picked it (`preferences.solutioner_email`). The backend computes `{email, name, is_exec, names}` from those and the board's live labels, and enforces the rules in its routes. New rows go through one route that validates against the board's own options, runs `create_item`, and builds the s0L deal from what monday stored.

**Tech Stack:** Flask, monday GraphQL (`me`, `boards { groups columns { settings } }`, `create_item`), React 19 + Zustand.

**Spec:** Decided with the user in chat, 2026-10-28 (option 1: pick your name once), on top of `docs/superpowers/specs/2026-10-27-monday-integration-design.md`.

## Global Constraints

- No new monday scopes (`users:read` is not needed). The email comes from `me { email }`.
- A name counts only while the signed-in monday email equals `preferences.solutioner_email`.
- Names to pick from: every label of the board's name columns (Lead SSC, TT Exec, SSC2, SSC3, SSC4) except "TBD".
- TT Exec = the picked name is a TT Exec label (not "TBD").
- `POST /api/monday/assign` is TT Exec only (403, kind `not_exec`).
- New rows: practice (group), opportunity number (item name), client, description are required. Values are written by label text: status `{"label": x}`, dropdown `{"labels": [x]}`, text as-is. Every option must already exist on the board, except a new client added by a TT Exec (`create_labels_if_missing` only then).
- Non-execs: Lead SSC = their own name, and no other people are written. TT Execs: any existing names, all optional.
- Clicking **Create on monday** is the confirmation; routes stay JSON-only and localhost/host-checked (no preview ids — a deliberate simplification of the spec's write gate).
- Not signed in to monday: the New Deal form creates the local deal as today and says how to connect.

## Review Focus

1. Someone signs in as a different monday user on the same PC — their picked name must not carry over (`test_name_counts_only_for_the_email_that_picked_it`).
2. A non-exec types a client monday doesn't have — refused before anything reaches monday (`test_non_exec_cannot_add_a_client`).
3. A non-exec's own name isn't in the Lead SSC column — clear message, no row (`test_non_exec_not_on_lead_ssc_list_is_told_why`).
4. The opportunity number already exists in s0L — refused before monday (`test_duplicate_opportunity_number_refused_first`).
5. An older sign-in has no saved email — fetched once and saved without clobbering a refreshed token (`test_missing_email_is_fetched_and_kept`).

---

### Task 1: Who you are

**Files:** Create `core/features/integrations/monday/identity.py`. Modify `oauth.py` (`me { id name email }`), `routes.py` (`GET/PUT /api/monday/me`), `core/features/settings/settings.py` (`_preferences` keeps `solutioner_email`). Test: `tests/test_monday_identity.py`.

**Produces:** `name_columns() -> {key: column_id}`; `who(preferences, email, labels_by_column) -> {email, name, is_exec, names}`; `remember(preferences, email, name) -> preferences`; `signed_in_email() -> str`.

- [ ] Tests: names exclude TBD and are sorted; exec only when the name is in TT Exec; `test_name_counts_only_for_the_email_that_picked_it`; PUT refuses names not on the board; PUT stores solutioner + email and keeps scope; settings PUT keeps `solutioner_email`; `test_missing_email_is_fetched_and_kept`.
- [ ] Implement; full suite passes.

### Task 2: Only TT Execs assign

**Files:** Modify `routes.py` (`assign`), `tests/test_monday_assign.py` (sessions carry an email; an exec fixture).

- [ ] Test `test_only_tt_execs_assign` (non-exec 403 `not_exec`, nothing sent). Existing assign tests run as an exec.
- [ ] Implement with one labels call for all name columns (identity + the target column). Full suite passes.

### Task 3: New deal → new row

**Files:** Create `core/features/integrations/monday/newdeal.py`. Modify `client.py` (`board_schema`, `create_item`), `mapping.py` (`column_value`), `routes.py` (`GET /api/monday/new-deal`, `POST /api/monday/deals`). Test: `tests/test_monday_new_deal.py`.

**Produces:** `GET /api/monday/new-deal -> {groups, options: {key: [labels]}, me}`; `POST /api/monday/deals {group, values, people, deal} -> deal` (linked, `monday_item_id` set).

- [ ] Tests: options lists; exec writes chosen people and may add a client (`create_labels_if_missing: true` only then); non-exec gets Lead SSC = own name and other people dropped; `test_non_exec_cannot_add_a_client`; `test_non_exec_not_on_lead_ssc_list_is_told_why`; unknown option refused; `test_duplicate_opportunity_number_refused_first`; no picked name → 409; s0L-only fields kept; deal built from monday's answer.
- [ ] Implement; full suite passes.

### Task 4: Frontend

**Files:** Modify `shared/services/mondayService.js`, `shared/dealStore.js` (`mondayMe`, `loadMondayMe`, `rememberMondayMe`, `namePickerOpen`), `shell/MondayConnect.jsx` (load identity when connected; open the picker when there's no name), `App.jsx` (render the picker; New Deal `onAdded`), `features/deals/components/DealList.jsx` (welcome line), `PipelineMetrics`/`AssignCell` callers (plain names for non-execs), `NewDealModal.jsx` (monday mode). Create `shell/NamePicker.jsx`. Styles in `deals.css`/`components.css`.

- [ ] Vitest for the pure pieces (payload builder). Lint + build clean. Check in the browser: welcome line, picker, New Deal monday mode.

### Task 5: Docs

- [ ] UI_ARCHITECTURE (monday writes: people pickers for TT Execs, new rows from New Deal), DESIGN (welcome line, name picker), the monday spec (identity + rules; write gate simplification), agent instructions.
