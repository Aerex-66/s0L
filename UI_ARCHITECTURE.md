# s0L — How This App Is Built

*A plain-language map of the codebase. Last updated: 2026-10-28.*
*For the interface side — tokens, themes, the glass — see [DESIGN.md](DESIGN.md).*

---

## What this app is

A local-only deal-solutioning workbench. It replaces a pile of archaic tools
(spreadsheets, decks, trackers) with one app where every module works on the
**same deal record**. Three processes run on localhost. Nothing touches the
internet except the user-authorized Outlook, Salesforce and monday.com
integrations (invariant 2):

| Process | Port | Job |
|---|---|---|
| React 19 + Vite | 5120 | The interface |
| Flask | 5121 | The deal record — everything about a deal lives in `deals_data.json` |
| Express (GSSM engine) | 5175 | Excel workbook parsing, editing, recalc, export |

No database. Flask writes one JSON file atomically; the GSSM server keeps
workbook edits in SQLite and parsed sheet data in an on-disk cache.

---

## The big picture: four layers

Every file belongs to one of four layers. Think of them as shelves, top to
bottom:

```text
1. shell        the front door   (App.jsx, header, module registry)
2. features/    the rooms        (Home, GSSM, iSBD, Documents, Greenstar, Metrics…)
3. shared/      the machines     (deal cache, API clients, constants, blocks, utils)
4. backends     the record       (Flask blueprints + GSSM engine + shared/*.json contracts)
```

**The one rule: code reaches DOWN the shelves — never up, never sideways.**

- The shell can use anything.
- A feature can use `shared/` and call the backends — but **never another
  feature**.
- `shared/` uses nothing above itself.
- The backends know nothing about the frontend at all.

Two documented exceptions, both forced by the GSSM standalone-repo sync
boundary (see [GSSM_SYNC.md](GSSM_SYNC.md)): `shared/gssmData/` re-exports a
read-only slice of the GSSM engine for other rooms (Greenstar), and
`features/gssm/shell/` is s0L-only orchestration parked inside the gssm
folder because the rest of that folder must stay byte-compatible with the
standalone app.

---

## Layer 1 — The shell

Three small files. [App.jsx](frontend/src/App.jsx) owns which deal is open,
which module is active, and the modals; [main.jsx](frontend/src/main.jsx)
imports the bundled `@fontsource-variable/*` font packages (Geist, Geist Mono,
IBM Plex Sans, Inter, Manrope, Outfit, Plus Jakarta Sans, Space Grotesk, Sora) before mounting the shell. [dealShell.js](frontend/src/shell/dealShell.js)
is the module list; [moduleRegistry.js](frontend/src/shell/moduleRegistry.js)
lazy-loads each one. The shell hands every module exactly two props —
**`deal`** and **`onUpdate`** — and that is the entire contract. A module
that needs more than that is doing something wrong.

Global styles in `frontend/src/styles/` are split strictly by concern:
- `base.css` — design tokens derived from the theme palette (dark defaults in
  `:root`, light overrides in `[data-mode="light"]`), body mesh + aurora,
  typography hierarchy, and `.glass-panel` / `.liquid-raise`. The palettes
  themselves, the accent and the UI font are set on `<html>` by the Appearance
  panel, `shared/ui/ThemeSwitcher.jsx` (saved per device in localStorage).
- `layout.css` — app frame and the theme-aware translucent `AppHeader`.
- `components.css` — shared UI blocks (buttons, `.cmd-btn`, `.ribbon`, `.chip`,
  `.toolbar-strip`, modals, command palette, wizard, settings, `TimelineBar`).
- `deals.css` — pipeline dashboard, command band, deal cards, opportunity rail,
  and pipeline metrics table.
- `home.css` — Home workspace (hero, inline stage rail, workspace tabs, and
  the seven Home tabs), plus the in-deal workspace blocks (`ws-*`: page head,
  panels, KPI tiles, facts, people, meters, tables, empty states) that Home,
  Metrics, Admin, Greenstar and Documents share. Module-specific styles (`IsbdModule.css`,
  `DocumentsModule.css`, `greenstar.css`, `MetricsModule.css`, `AdminModule.css`, `gssm.css`)
  live inside their feature folders and load lazily with their module.

---

## Layer 2 — Features (the rooms)

Each folder under `frontend/src/features/` is one self-contained product.
Same shape inside each: components, hooks, maybe a service file and a
scoped CSS file.

| Feature | What it is |
|---|---|
| **home** | The deal overview, labelled **Overview** in the rail: the Summary tab (the deal at a glance from the record: status, TCV, close quarter, sales stage, the board's facts, team, dates, approvals, and where the deal comes from), timeline painter, approvals, financials, resources, calendar, contacts — plus the Outlook/Teams hand-off (contact email/chat/call, meeting composer, per-approver and bulk approval emails; messages built in `handoff.js`, opened as real Outlook drafts and invites in the Outlook app, as Outlook on the web in the browser, or as `mailto:` until s0L knows which) |
| **gssm** | The full staffing-model editor — the Excel engine that builds the financial outlook. `calc/`, `sheets/`, `utils/`, `components/`, `hooks/` are synced with the standalone Electron app; `shell/` is ours alone |
| **isbd** | The iSBD deck editor: import a PPTX, edit every slide as structured fields, export with a native Gantt |
| **genai** | GenAI in the deal (new, under ISBD in the rail): for now it gathers what the record already says, the iSBD's GenAI answer and every field whose text mentions GenAI, watsonx, LLMs or AI assistants. The GSSM workbook's `Gen AI Assumptions` sheet is its natural next source, through `shared/gssmData/` |
| **documents** | Document library, required slots, upload/download, OneDrive hand-off |
| **greenstar** | Staffing pivot views over GSSM workbook data |
| **deals** | The pipeline dashboard: tiles and the list (grouped by solutioner, status, practice or TCV band; the list also filters, and assigns Lead SSC, SC 2, SC 3 and TT Exec on the monday board), the TT Exec view (the team's deals added, submitted, won and lost per month, quarter, half or year, from `execStats.js`; open pipeline, workload, and assigning the deals waiting for a lead; the Salesforce check, where TT Execs put Salesforce's value on the board), create/import/export |
| **settings** | Approver defaults + master contact directory |
| **metrics** | This deal against similar deals (same practice, and the same implementation type or industry; `similarity.js`): its size against theirs, how they turned out, the win rate, time on the board and in its status, and the similar deals as a table that opens each one |
| **admin** | The deal record: every field in the index with its owner, whether it can be changed here and its value, filterable by owner; the deal's links to monday, Salesforce and GSSM; a download of the record as JSON |

**The entry bar for `shared/`:** something moves out of a room only when a
**second** room actually needs it. One consumer = it stays put. This is why
the iSBD prefill maps live in `features/isbd/` while the phase palette lives
in `shared/` — Home, GSSM, *and* the Flask export all paint phases.

---

## Layer 3 — Shared (the machines)

| Folder | What it does |
|---|---|
| `shared/dealStore.js` | **The deal cache.** One Zustand store holding the deals array + GSSM sync health. `patchDeal(updated)` merges a PUT response so every room re-renders without a refetch |
| `shared/services/dealService.js` | **All deal API access.** No room calls `/api/deals` any other way |
| `shared/services/mondayService.js` | **All monday access** (sign-in status, sync, people assignment). The backend makes every monday call |
| `shared/services/salesforceService.js` | **All Salesforce access** (sign-in status, the check, the differences list). The backend makes every Salesforce call |
| `shared/outlookStore.js` + `services/outlookService.js` + `utils/outlookLinks.js` | Which Outlook this computer uses, and `openEmail` / `openInvite`: a real draft in the Outlook app (through the backend) or Outlook on the web in a new tab. Home and Documents use it |
| `shared/noticeStore.js` + `services/noticeService.js` | The TT Execs' notices: posted from the TT Exec view, shown by the header banner (`shell/NoticeBanner.jsx`) |
| `shared/apiClient.js` | The fetch wrapper everything rides on |
| `shared/constants/` | Cross-room vocabulary: field map (203 fields), GSSM cell coordinates, reference data |
| `shared/utils/gssmBridge.js` | Pure functions translating GSSM cells ↔ deal fields — the unification engine |
| `shared/ui/` | The blocks: Modal, ConfirmDialog, Loader, FormField, TimelineBar, WorkspaceTabs… (see [DESIGN.md](DESIGN.md)) |
| `shared/gssmData/` | The one sanctioned window into the GSSM engine for other rooms |

---

## Layer 4 — The backends (the record)

**Flask** (`core/`) — blueprint per feature, thin routes, logic in services:

| Piece | Job |
|---|---|
| `core/shared/state.py` | The only code that touches `deals_data.json` (locked, atomic writes; runs the load-time migration with a one-time backup). Its data root holds the deals file, `documents/`, `client_logos/` and the calendar cache: the repo root in dev, `S0L_DATA_DIR` in the packaged app |
| `core/shared/field_index.py` | Loads `shared/field_index.json`: alias → key, owners, iSBD label lookup, GSSM cells |
| `core/shared/domain.py` | Loads `shared/domain_constants.json` (phases, service areas) |
| `core/shared/migrations.py` | Brings stored deals onto index keys (old names, owner routing) |
| `core/shared/vault.py` | DPAPI-encrypted files for integration secrets (each integration passes its own folder and entropy) |
| `core/shared/opportunity_ids.py` | Salesforce opportunity IDs as people type them on the board: the 18-character form (case restored from the suffix) and what a cell holds |
| `core/shared/reconcile.py` | Where the board and Salesforce disagree, and the board value an approved fix writes. Used by the Salesforce differences list and monday's fix route, so neither integration imports the other |
| `core/features/deals/` | Deal CRUD routes + `writes.py` (the owner-aware write gate every route uses) + `services.py` (activity init, deal assembly, cascade cleanup) |
| `core/features/documents/` | Routes + seven service modules: PPTX I/O, iSBD extract, iSBD export (native Gantt), async slide render (PowerPoint, else LibreOffice + pdftoppm), deal↔doc records, OneDrive discovery |
| `core/features/settings|calendar/` | Approvers/contacts · Outlook calendar cache reader (filled every minute by `outlook_sync.py`, in dev and the packaged app, from classic Outlook while it's open; never starts Outlook; nothing in browser mode) |
| `core/features/integrations/outlook/` | The classic Outlook app on this computer, through its own local connection (design: `docs/superpowers/specs/2026-10-28-outlook-integration-design.md`). Which Outlook this computer uses (`preferences.outlook_mode`, app or web; detection picks the start), and real Outlook drafts and meeting invites, opened (never sent) with the deal's own documents attached under their real names (`drafts.py`). People lookups as a name is typed (`people.py`, `GET /api/outlook/people`): Outlook's own autocomplete list first, then the directory's unique match and nearest name, each with email, title and department, from the open Outlook only (never started for this); and Outlook's own address book to pick one person (`POST /api/outlook/people/pick`). No Graph, no registration, no sign-in. `core/shared/outlook_app.py` is the one place that reaches Outlook (detection, the open app, COM per thread) |
| `core/features/notices/` | Notices: short reminders a TT Exec posts (checked against the monday identity), newest first in `deals_data.json` under `notices`. For now they stay on the computer they were posted on; reaching the team needs a shared channel through monday (not built yet) |
| `core/features/integrations/monday/` | monday.com sign-in through s0L's own monday app, the board sync, who the signed-in person is (`identity.py`: a board name picked once, bound to their monday email; TT Execs are the names in the TT Exec column), and two writes: a TT Exec setting a people column marked `writable` in the field index (Lead SSC, SC 2, SC 3, TT Exec) to a name the column already has (`POST /api/monday/assign`), and the New Deal form adding a row (`newdeal.py`, `POST /api/monday/deals`: board options only, a new client only from a TT Exec, anyone else is the Lead SSC). The only code that calls monday; credentials stay DPAPI-encrypted in `%LOCALAPPDATA%\s0L\monday` (the packaged app also ships the app's own ID and secret, `S0L_MONDAY_APP`, so colleagues only sign in). `releases.py` reads s0L's own release item (board 9535661088) and downloads updates |
| `core/features/integrations/salesforce/` | IBM Sales Cloud, read only (design: `docs/superpowers/specs/2026-10-28-salesforce-integration-design.md`). Sign-in through s0L's Salesforce app (`oauth.py`: web server flow with PKCE and no client secret; IBM's admins install the app and give the team API access); `check.py` looks every board deal up by its opportunity number (batches of 200) and `writer.py` is the only writer of `salesforce` fields; `inventory.py` (`npm run salesforce:inventory`) writes down what the account can reach, never record values. Tokens are DPAPI-encrypted in `%LOCALAPPDATA%\s0L\salesforce`; the org's address and the app's consumer key are provisioned with `npm run salesforce:provision` (only an IBM Sales Cloud app ships, `S0L_SALESFORCE_APP`) |
| `core/features/integrations/client_logos/` | Client logos: `fetcher.py` is the only outside fetch (Wikidata query-service lookups + validated image downloads); `resolver.py` cleans client names, matches them exactly in batches (companies first, places only for government clients), searches Wikidata (through the query service, ignoring case) for the ones with no exact match, and marks the sure matches; `worker.py` looks every client up once (later only new clients; failures wait for a retry) and waits out "retry after"; the `client_logos/` cache sits next to `deals_data.json` (one file per client, named after it as on its deals); routes serve the cached images sandboxed, list every client for review, take approvals and fixes, and accept a logo file a person uploads (checked by its bytes like any download) |

**GSSM Express** (`gssm-server/`) — mirrors the standalone app's server:
`index.js` is wiring only; `lib/` holds cell refs, edit normalization, and
validation expansion; `routes/` holds the engine and export endpoints;
`engine/` parses XLSM into NDJSON sheet metadata. Structural changes here get
a [GSSM_SYNC.md](GSSM_SYNC.md) changelog entry, always.

**The contracts** (`shared/*.json`) — the spine of the whole system. Facts
that two runtimes must agree on live here and nowhere else:

| File | What agrees because of it |
|---|---|
| `field_index.json` | **The one field index.** Every field that crosses a module or runtime has exactly one key, one storage path and one **owner**, plus its old names, its GSSM cell (Excel A1) and its iSBD labels. Python, React, the iSBD editor, import and export all read it |
| `domain_constants.json` | Phase codes/colors and service areas — identical in Home timelines, GSSM sheets, and exported PPTX Gantt bars |

**Owners** — who may write a field:

| Owner | Written by | Everyone else |
|---|---|---|
| `deal` | Home, Deal Details, wizard, iSBD — through `PUT /api/deals/:id` | reads it |
| `gssm` | only `PUT /api/deals/:id/gssm-sync`, stored exactly as the workbook has it | reads it, read-only (timelines: Home may paint them until a workbook is linked) |
| `monday` | only the monday sync (`integrations/monday/writer.py`), stored exactly as the board has it | reads it, read-only once the deal is linked to a board row (editable until then) |
| `salesforce` | only the Salesforce check (`integrations/salesforce/writer.py`), stored as Salesforce has it | reads it, read-only; a deal-editable one (Opportunity Owner) stays editable until Salesforce supplies a value, and a blank in Salesforce never overwrites |
| `isbd` | the iSBD editor, into `isbd_data` | reads it |
| `derived` | nobody — computed (team members from Resources, GEO from market/sector/industry…) | reads it, read-only |

The server enforces this: an unknown field is a 400, a field owned by
someone else is a 409. Nothing is dropped silently.

---

## How the data stays unified (the point of the app)

Rooms never talk to each other. They talk to the deal, and the deal talks
back to every room:

```text
GSSM cell edit ──(debounce 2s)──► gssmBridge extracts ──► PUT /api/deals/:id/gssm-sync
                                                             │ response
Home / iSBD / Metrics ◄── re-render ◄── dealStore.patchDeal ◄┘
                                          └─ sync chip in the GSSM topbar
                                             (syncing · synced · failed)
```

- **GSSM → deal**: every edit is debounced, extracted to index keys
  (timelines, financials, staffing summary, bid metrics), and written through
  the sync route — the only writer of GSSM values. It records which workbook
  the deal is linked to (`gssm_workbook_id`); Greenstar and the GSSM auto-load
  use that link and never borrow another deal's workbook.
- **monday → deal**: the Business Apps – Deal Pipeline board is read when the
  app starts and when the monday icon in the header is clicked. That icon is
  also where people connect: one click opens monday's sign-in, and its dot turns
  green once connected (Settings → monday keeps the sync details and
  Disconnect). One deal per board row,
  keyed by monday item id; board values are stored as the board has them
  (owner `monday`, including the day a row was added and the day its Status
  last changed, which the TT Exec view counts by) and are read-only on linked deals. After connecting, each
  person picks their board name once ("Welcome, name · Not you?" changes it);
  it is `preferences.solutioner`, bound to their monday email, and drives My
  deals. The ways back, both through `writer.py`: TT Execs change the list's
  people pickers (Lead SSC, SC 2, SC 3, TT Exec), one confirmed name at a time;
  and the New Deal form adds the row to the board, then the linked deal, using
  only the board's options (TT Execs pick the people and may add a new client;
  anyone else becomes the Lead SSC). Changing the
  board needs a sign-in with `boards:write` (`can_write` in the status).
- **Salesforce → deal**: after every monday sync (and on a click of the
  Salesforce icon) each deal still on the board is looked up in IBM Sales Cloud
  by its opportunity number, the one key across s0L, monday and Salesforce.
  Salesforce's values are stored in their own `sf_` fields (owner `salesforce`),
  never over the board's; Opportunity Owner is filled from Salesforce. Where the
  board and Salesforce disagree, including an opportunity number that doesn't
  resolve, the TT Exec view lists it (`GET /api/salesforce/differences`, worked
  out on request, never stored), and a TT Exec may put Salesforce's value on the
  board (`POST /api/monday/fix`, asked first; the board keeps its own labels).
- **Home never calculates GSSM numbers.** It shows them read-only ("From
  GSSM · synced …"); to change one, change the workbook.
- **Deal → GSSM**: only a Home-drawn timeline is handed to a freshly linked
  workbook, into **empty** Imp TL cells. PTI values always come from GSSM.
- **iSBD is a view of the deal**: cells backed by deal fields read and write
  the deal; GSSM and derived cells are read-only; only deck-only content lives
  in `isbd_data`. Import fills empty deal fields; export reads index keys.
- Every module refreshes the shared `dealStore` after a save (`onUpdate`), so
  an edit in one room shows in all of them.
- [FIELD_REGISTRY.md](FIELD_REGISTRY.md) is **generated** from the index
  (`npm run registry`); a test fails if it goes stale.

---

## Where new code goes — three questions

1. **Does only one room use it?** → Inside that feature folder.
2. **Do two rooms need it, or must Python and JS agree on it?** →
   `shared/` (frontend) or `shared/*.json` + a loader (cross-runtime).
3. **Is it about storing or transforming the deal/workbook record?** →
   The matching backend service module, behind a thin route.

New room? Folder under `features/`, entry in `dealShell.js`, lazy component
in `moduleRegistry.js`. Consume `deal`/`onUpdate`, do deal I/O through
`dealService` + `dealStore`, and you're integrated with every other room
for free.

---

## The packaged app (what colleagues run)

`npm run package` builds `release\s0L-<version>.zip` (`packaging/build.ps1`;
`npm run package:unsigned` skips signing for test builds). Unzip anywhere and
double-click `s0L.exe`: no install, no admin.

```text
s0L\
  s0L.exe              tray launcher (packaging/launcher/s0L.cs + Updates.cs, built with Windows' own C# compiler)
  app\                 deal_tracker.py, core\, shared\, gssm-server\, frontend\dist\, monday-app.json, salesforce-app.json (IBM's only)
  runtime\python\      embeddable Python + requirements (isolated from the user's own Python)
  runtime\node\        node.exe
  .update\  .previous\  made by updates (below)
```

- **The launcher** starts Flask and the GSSM server hidden, inside a job object
  so they die with it, waits for Flask, opens `http://localhost:5121/` and sits
  in the tray (Open s0L · Quit). It refuses to start if 5121 or 5175 is taken.
- **Flask is the front door**: with `S0L_FRONTEND_DIST` set, `core/shell/frontend.py`
  serves the built frontend and forwards `/gssm-api` to the GSSM server, which
  is what the Vite proxy does in dev. Ports stay 5121 and 5175.
- **Data never lives in the app folder**, so replacing the folder updates s0L:
  `%LOCALAPPDATA%\s0L\data` (deals, documents, logos, calendar cache),
  `\gssm` (`GSSM_DB_PATH`, `ENGINE_IMPORT_ROOT`), `\logs`, `\monday`, `\salesforce`.
- **Previews and calendar without extra software**: slide previews come from
  PowerPoint; the calendar is read from classic Outlook by Python. No
  PowerShell runs in the packaged app.
- **Nothing private ships**: the build copies an explicit list, holds the real
  iSBD reference files aside while building the frontend, and stops if a
  deals file, document, workbook or database shows up in the package.
- **Signed** with Azure Artifact Signing (account `Aero`, profile `Aerex`):
  every executable and DLL not already signed by its publisher. Sign in first
  with `az login --tenant 53766e3f-8ad5-418c-bac7-aaad7bdc46df --use-device-code`.
  Before signing `s0L.exe`, the build compiles a SHA-256 list of every other
  file into it, so that one signature covers the whole package.
- **Updates arrive through monday** (design: `docs/superpowers/specs/2026-10-28-monday-updates-design.md`).
  `npm run release` builds, signs and uploads `s0L-<version>.zip` to the s0L item
  on the Files board (`integrations/monday/publish.py`). A connected copy checks
  that item 30 s after start and every 4 h (`core/shell/updates.py`), downloads a
  newer zip into the s0L folder's `.update\`, and has the installed `s0L.exe
  --verify` check it: same publisher, every file on the list. Then the app asks
  "Restart now / Later" (`shell/UpdatePrompt.jsx`); after Later, the Settings icon's
  dot and a bar in Settings keep offering it (all three read `shared/updateStore.js`). The launcher stops the
  servers, copies the deals file and GSSM store aside, renames the new files in
  (the old ones go to `.previous\`) and starts the new version; if that doesn't
  answer within 90 s it puts everything back and skips that version. Later
  installs at the next start. Copies that never connect to monday never update.
- With no `S0L_*` variables everything behaves as in dev, so `npm run dev` is
  unaffected.

---

## The standalone story (why GSSM is special)

The GSSM module ships twice: embedded here, and as a standalone Electron
app in its own repo. The shared boundary (`calc/`, `sheets/`, `utils/`,
`components/`, `hooks/`, and the server) must stay in sync — every change
inside it gets a changelog entry in [GSSM_SYNC.md](GSSM_SYNC.md) so the
other repo's agent can replay it. Everything s0L-specific stays outside the
boundary (`GssmModule.jsx`, `gssm/shell/`, `gssmApi.js`, `gssm.css`).

When porting standalone styles into `gssm.css`, keep them scoped: its Carbon
tokens live on `.gssm-module` (plus `.fte-context-menu`, the one portal that
renders outside it) and its `.btn` family is prefixed `.gssm-module`. A bare
`:root` or `.btn` there restyles every room the moment GSSM loads.

---

## The invariants (breaking one = architecture bug)

1. Code reaches down the shelves only. No feature imports another feature.
2. Nothing touches the network beyond localhost. No CDNs, no analytics, ever.
   Hand-off links (`mailto:`, `msteams:`, and Outlook on the web's compose pages
   for people who use Outlook in the browser) are allowed: they open the user's
   installed Outlook or Teams, or their Outlook on the web, pre-filled; s0L itself
   makes no request, and nothing is sent until the user presses Send there.
   The classic Outlook app on the computer is reached through its own local
   connection (COM): no network, no sign-in, no registration.
   **The one exemption, sanctioned integrations:** Microsoft Outlook (via
   Microsoft Graph, not used: the user ruled out app registrations), Salesforce and monday.com. Only the Flask backend calls
   them, never the browser. It calls them only after the user signs in with
   their own account (OAuth, or a personal access token the user creates),
   over HTTPS, to those services' own hosts.
   Tokens stay on the machine. Any other outside service needs the same
   explicit sign-off first.
   **Client logos (signed off 2026-10-27):** the backend may look client
   names up on Wikidata's query service (`query.wikidata.org`; Wikidata's
   Action API refuses most requests from a shared office network) and download
   that company's logo from Wikimedia's image server (`upload.wikimedia.org`),
   or its icon from the company's own website (well-known icon paths only).
   When a person gives a Wikipedia article link for a client's logo, the
   backend may also read that one article's summary (its lead image, on the
   same image server): many company logos can't live on Wikidata's free image
   library, so only Wikipedia has them.
   Image downloads only: HTTPS, public addresses, small,
   checked by type and content, SVGs that could run or load anything refused.
   Cached on the machine and served from localhost; no other logo source.
   **s0L updates (signed off 2026-10-28):** the packaged app's backend may
   download s0L's own release zips from monday's file storage
   (`files-monday-com.s3.amazonaws.com`), only through the one-hour links
   monday's API hands out for the release item, once the person has signed in
   to monday. HTTPS, no redirects, size-capped, and checked against the user's
   signature before anything runs (`integrations/monday/releases.py`).
3. One writer per store: Flask owns the deal JSON; the GSSM server owns SQLite.
4. Cross-runtime facts live in `shared/*.json` — never duplicated per runtime.
   A field's key, aliases, labels and cells live only in `field_index.json`.
5. Rooms communicate through the deal record, never directly.
6. Every visual value comes from a token ([DESIGN.md](DESIGN.md)).
7. Sync-boundary edits without a GSSM_SYNC.md entry don't ship.
8. One owner per field. GSSM values are written only by the GSSM sync and are
   never recalculated or edited elsewhere — Home and GSSM cannot disagree.
