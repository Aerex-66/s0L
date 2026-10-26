# s0L — How This App Is Built

*A plain-language map of the codebase. Last updated: 2026-10-21.*
*For the interface side — tokens, themes, the glass — see [DESIGN.md](DESIGN.md).*

---

## What this app is

A local-only deal-solutioning workbench. It replaces a pile of archaic tools
(spreadsheets, decks, trackers) with one app where every module works on the
**same deal record**. Three processes run on localhost and nothing ever
touches the internet:

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
imports the self-hosted `@ibm/plex-sans` and `@ibm/plex-mono` font packages
before mounting the shell. [dealShell.js](frontend/src/shell/dealShell.js)
is the module list; [moduleRegistry.js](frontend/src/shell/moduleRegistry.js)
lazy-loads each one. The shell hands every module exactly two props —
**`deal`** and **`onUpdate`** — and that is the entire contract. A module
that needs more than that is doing something wrong.

Global styles in `frontend/src/styles/` are split strictly by concern:
- `base.css` — design tokens, three theme blocks (`:root`, `dark`, `midnight`),
  body mesh + aurora, typography hierarchy, and `.glass-panel` / `.liquid-raise`.
- `layout.css` — app frame and the theme-aware translucent `AppHeader`.
- `components.css` — shared UI blocks (buttons, `.cmd-btn`, `.ribbon`, `.chip`,
  `.toolbar-strip`, modals, command palette, wizard, settings, `TimelineBar`).
- `deals.css` — pipeline dashboard, command band, deal cards, opportunity rail,
  and pipeline metrics table.
- `home.css` — Home workspace (hero, inline stage rail, workspace tabs, and
  the six Home tabs). Module-specific styles (`IsbdModule.css`,
  `DocumentsModule.css`, `greenstar.css`, `MetricsModule.css`, `gssm.css`)
  live inside their feature folders and load lazily with their module.

---

## Layer 2 — Features (the rooms)

Each folder under `frontend/src/features/` is one self-contained product.
Same shape inside each: components, hooks, maybe a service file and a
scoped CSS file.

| Feature | What it is |
|---|---|
| **home** | The deal overview: timeline painter, approvals, financials, resources, calendar, contacts — plus the Outlook/Teams hand-off (contact email/chat/call, meeting composer, per-approver and bulk approval emails; links built in `handoff.js`) |
| **gssm** | The full staffing-model editor — the Excel engine that builds the financial outlook. `calc/`, `sheets/`, `utils/`, `components/`, `hooks/` are synced with the standalone Electron app; `shell/` is ours alone |
| **isbd** | The iSBD deck editor: import a PPTX, edit every slide as structured fields, export with a native Gantt |
| **documents** | Document library, required slots, upload/download, OneDrive hand-off |
| **greenstar** | Staffing pivot views over GSSM workbook data |
| **deals** | The pipeline dashboard: tiles, metrics, create/import/export |
| **settings** | Approver defaults + master contact directory |
| **metrics / admin** | Pipeline analytics · placeholder |

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
| `core/shared/state.py` | The only code that touches `deals_data.json` (locked, atomic writes; runs the load-time migration with a one-time backup) |
| `core/shared/field_index.py` | Loads `shared/field_index.json`: alias → key, owners, iSBD label lookup, GSSM cells |
| `core/shared/domain.py` | Loads `shared/domain_constants.json` (phases, service areas) |
| `core/shared/migrations.py` | Brings stored deals onto index keys (old names, owner routing) |
| `core/features/deals/` | Deal CRUD routes + `writes.py` (the owner-aware write gate every route uses) + `services.py` (activity init, deal assembly, cascade cleanup) |
| `core/features/documents/` | Routes + seven service modules: PPTX I/O, iSBD extract, iSBD export (native Gantt), async slide render, deal↔doc records, OneDrive discovery |
| `core/features/settings|calendar/` | Approvers/contacts · Outlook cache reader (fed by `outlook_calendar.ps1`, which needs classic Outlook) |

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
   Hand-off links (`mailto:`, `msteams:`) are allowed: they open the user's
   installed Outlook or Teams pre-filled, s0L itself makes no request, and
   nothing is sent until the user presses Send there.
3. One writer per store: Flask owns the deal JSON; the GSSM server owns SQLite.
4. Cross-runtime facts live in `shared/*.json` — never duplicated per runtime.
   A field's key, aliases, labels and cells live only in `field_index.json`.
5. Rooms communicate through the deal record, never directly.
6. Every visual value comes from a token ([DESIGN.md](DESIGN.md)).
7. Sync-boundary edits without a GSSM_SYNC.md entry don't ship.
8. One owner per field. GSSM values are written only by the GSSM sync and are
   never recalculated or edited elsewhere — Home and GSSM cannot disagree.
