# Outlook Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** s0L opens real Outlook emails and meeting invites (filled in, with deal documents attached) through the classic Outlook app, reads the calendar from the open app in dev and packaged alike, shows an Outlook icon with an app/browser picker, and falls back to Outlook-on-the-web links.

**Architecture:** One shared module (`core/shared/outlook_app.py`) owns detection, the effective mode and COM access; the calendar sync and a new `core/features/integrations/outlook/` package (status, mode, draft, invite) both use it. Frontend: a shared Outlook store (`shared/outlookStore.js`) with `openEmail`/`openInvite`, web-link builders in `shared/utils/outlookLinks.js`, message builders in `features/home/handoff.js`, a header icon + picker in `shell/`.

**Tech Stack:** Python 3 / Flask / comtypes (dynamic dispatch); React 19 / Zustand / Vitest; pytest.

**Spec:** [docs/superpowers/specs/2026-10-28-outlook-integration-design.md](../specs/2026-10-28-outlook-integration-design.md)

## Global Constraints

- No Graph, no app registration, no sign-in. Only the Flask backend talks to Outlook; the browser fallback is a hand-off link (s0L makes no request).
- The calendar reader never launches Outlook (`GetActiveObject` only); only a draft/invite click may start it.
- Attachments: only documents of the named deal whose real path is inside `DOCUMENTS_ROOT`; sent under the document's own name via a temp copy that is deleted after `Display()`.
- Drafts only — never `Send()`.
- Routes: local hosts only; POST/PUT JSON only (415). Limits: 100 recipients, subject 500, body 100,000, 20 attachments.
- `preferences.outlook_mode` ∈ {`app`, `web`}, written only by `PUT /api/outlook/mode`; unset → `app` if usable else `web`.
- Never commit; don't touch `client_logos/`; GSSM boundary untouched.

## Review Focus

1. Classic Outlook installed but never set up (no mail profile): detection says not usable, so nothing launches a setup wizard (Task 1 `test_installed_without_a_profile_is_not_usable`).
2. Outlook closed while the calendar reader runs: no Outlook process is started; the tab says "Open Outlook" (Task 2 `test_sync_never_launches_outlook`).
3. A document id from another deal, or a stored path outside the documents folder: refused with 400, nothing attached (Task 4 `test_attachments_must_be_this_deals_files`).
4. IBM's Outlook refusing the body read (security prompt denied): the draft still opens with plain text (Task 4 `test_signature_read_refused_falls_back_to_plain_text`).
5. A click before the Outlook status has loaded: falls back to today's `mailto:` link instead of guessing (Task 6 `OutlookEmailButton` renders the mailto anchor when status is null).

---

### Task 1: Shared Outlook access and detection

**Files:** Create `core/shared/outlook_app.py`; Test `tests/test_outlook_app.py`

**Interfaces (produces):**
- `usable() -> bool` — `comtypes` importable AND `HKCR\Outlook.Application\CLSID` exists AND `HKCU\Software\Microsoft\Office\16.0\Outlook\Profiles` has a subkey. Seams for tests: `_registered()`, `_has_profile()`, `_comtypes_ok()`.
- `effective_mode(preferences) -> 'app' | 'web'` — the stored `outlook_mode` when valid, else `'app' if usable() else 'web'`.
- `running_app()` — the open Outlook (`comtypes.client.GetActiveObject('Outlook.Application', dynamic=True)`) or `None`.
- `open_app()` — `running_app()` or `CreateObject('Outlook.Application', dynamic=True)`; raises `OutlookUnavailable` when not usable.
- `com_thread()` — context manager wrapping `CoInitialize`/`CoUninitialize`.

- [ ] Tests: usable needs all three; `effective_mode` honours a valid stored mode, ignores junk, falls back by detection; `test_installed_without_a_profile_is_not_usable`.
- [ ] FAIL → implement → PASS.

### Task 2: The calendar reader everywhere, without launching Outlook

**Files:** Modify `core/features/calendar/outlook_sync.py` (use `outlook_app`; add `sync_once(cache_file) -> 'web' | 'closed' | 'ok'`; loop calls it; drop `outlook_available`), `deal_tracker.py` (start when `outlook_app.usable()`, no env gate), `core/features/calendar/calendar.py` (statuses `web`, `no_app`, `waiting`, `ok`), `packaging/launcher/s0L.cs` (drop `S0L_OUTLOOK_SYNC`); Test `tests/test_outlook_sync.py`

- [ ] Tests: `sync_once` returns `web` without touching COM in browser mode; `test_sync_never_launches_outlook` (closed → `'closed'`, `CreateObject` never called); writes the cache when open; route returns each status (`web` when unset and not usable; `no_app` when `app` chosen but not usable; `waiting` without a cache; `ok` with age).
- [ ] FAIL → implement → PASS; launcher compiles.

### Task 3: Status and mode routes

**Files:** Create `core/features/integrations/outlook/{__init__,routes}.py`; register in `core/app_factory.py`; Test `tests/test_outlook_routes.py`

**Interfaces:** `GET /api/outlook/status` → `{ app: { found, running }, mode, effective }` (`running` checked inside `com_thread()`); `PUT /api/outlook/mode {mode}` → saves `preferences.outlook_mode`, returns status; 400 for other values; 415 without JSON; `PUT /api/preferences` keeps the key.

- [ ] Tests for each; FAIL → implement → PASS.

### Task 4: Drafts and invites

**Files:** Create `core/features/integrations/outlook/drafts.py`; routes `POST /api/outlook/draft`, `POST /api/outlook/invite`; Test `tests/test_outlook_drafts.py` (a `FakeOutlook` recording calls; `open_app`/`com_thread` monkeypatched)

**Interfaces:** `DraftError(status, message, kind)`; `clean_addresses(values, field) -> list[str]`; `resolve_attachments(data, deal_id, ids) -> list[(path, name)]`; `attachment_copies(files)` context manager yielding temp paths named after the documents; `text_to_html(text) -> str`; `open_email(app, *, to, cc, subject, body, files)`; `open_invite(app, *, attendees, subject, start, end, location, body, files)`.

- [ ] Tests: validation (bad address, limits, end ≤ start, bad time); `test_attachments_must_be_this_deals_files` (unknown id, other deal's doc, outside folder, missing file); email item: `CreateItem(0)`, `To`/`CC` joined with `'; '`, `Subject`, attachments added under the document names and temp copies gone afterwards, `Display()` called, text placed above the signature; `test_signature_read_refused_falls_back_to_plain_text`; invite: `CreateItem(1)`, `MeetingStatus == 1`, `RequiredAttendees`, `Start`/`End` datetimes, `Location`, `Body`, `Display()`; `no_app` 409 and `outlook_failed` 502 with a one-line message; never `Send`.
- [ ] FAIL → implement → PASS.

### Task 5: Frontend Outlook state, links, icon and picker

**Files:** Create `frontend/src/shared/services/outlookService.js`, `frontend/src/shared/outlookStore.js`, `frontend/src/shared/utils/outlookLinks.js` (+ test), `frontend/src/shell/outlookBadge.js` (+ test), `frontend/src/shell/OutlookConnect.jsx`, `frontend/src/shell/OutlookPicker.jsx`; Modify `AppHeader.jsx`, `styles/layout.css`, `styles/base.css`, `styles/components.css`

**Interfaces:** `outlookService.{status, setMode, draft, invite}`; store `{ status, load(), setMode(mode), openEmail(message, {dealId, attachments}), openInvite(meeting, {dealId, attachments}) }`, `effectiveMode(status) -> 'app' | 'web' | null` (null until loaded); `outlookWebMailLink(message)`, `outlookWebEventLink(meeting)` (8,000-char cap, body shortened, recipients kept); `outlookBadge(status) -> { state, label, signedIn }` per the design's table.

- [ ] Vitest: links (encoding, cap, recipients kept, UTC times); badge states. FAIL → implement → PASS.

### Task 6: Home and Documents use it

**Files:** Modify `features/home/handoff.js` (+ test: `approvalEmail`, `contactEmail`, `groupEmail`; `approvalEmailLink` built on `approvalEmail`), create `features/home/components/OutlookEmailButton.jsx`, modify `Activities.jsx`, `Contacts.jsx`, `MeetingComposer.jsx` (Outlook primary action, Attach chips, hint, title), `Calendar.jsx` (statuses), `features/documents/DocumentsModule.jsx` (Email in Outlook action), `shared/ui/Icons.jsx` (MailIcon if missing), styles.

- [ ] Vitest for the message builders; FAIL → implement → PASS; lint the touched files; build.

### Task 7: Docs, verification, review

**Files:** `UI_ARCHITECTURE.md`, `DESIGN.md`, `.github/copilot-instructions.md`, repo memory.

- [ ] `python -m pytest -q`, `npm --prefix frontend test`, build; restart backend; browser: Outlook icon + picker, Calendar badge, composer.
- [ ] Fresh reviewer over the change; fix Critical/Important.
