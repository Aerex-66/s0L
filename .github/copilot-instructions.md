# s0L — Deal Tracker

## MCP servers (MANDATORY)

- Load and use the configured MCP servers on every task: **Superpowers**, **context-mode**, **Pylance**. If one is missing from the tool list, tell the user before proceeding — never silently work without it or substitute another approach.
- **Superpowers**: before any non-trivial task, call `mcp_superpowers_recommend_skills` (or `mcp_superpowers_list_skills`) and follow the matching skill (brainstorming, systematic-debugging, test-driven-development, verification-before-completion).
- **context-mode**: run large outputs (test runs, logs, builds, big searches/reads) through its sandbox tools so they don't flood the context.
- **Pylance**: use its MCP tools for Python checks and one-off snippets (`mcp_pylance_mcp_s_pylanceRunCodeSnippet`) instead of scratch scripts.
- Supabase MCP is not used here — s0L has no cloud backend.

## Canonical docs — read before structural or visual work

- **[UI_ARCHITECTURE.md](../UI_ARCHITECTURE.md)** — shell/module system, state tiers, data flow, backend structure, extension playbooks, invariants. Consult before adding modules, endpoints, or cross-module data.
- **[DESIGN.md](../DESIGN.md)** — the design system (“Seamless”): tokens, themes, glass recipe, motion rules, **brand law**. Consult before any styling work.
- **[GSSM_SYNC.md](../GSSM_SYNC.md)** — GSSM ↔ standalone sync protocol + changelog.
- **[FIELD_REGISTRY.md](../FIELD_REGISTRY.md)** — every cross-module field, its owner, GSSM cell and iSBD labels. **Generated** from `shared/field_index.json` (`npm run registry`) — never edit by hand.

## Architecture

- **Monorepo**: Python/Flask backend + Express/GSSM backend + React 19/Vite frontend
- **Flask backend** (port 5121): Flask API at `core/`, entry point `deal_tracker.py`
- **GSSM backend** (port 5175): Express API at `gssm-server/`, entry point `index.js`
- **Frontend** (port 5120): React 19 + Zustand + Vite at `frontend/`
- **Data**: JSON file persistence (`deals_data.json`) — no database
- **Security**: Localhost-only, CORS-restricted, security headers (no CSP yet). No external network except the sanctioned Outlook/Salesforce/monday.com integrations (see Conventions)

### Backend structure
```
deal_tracker.py              # Flask entry point
deal_structure.py            # Activity categories + key resources
shared/                      # Cross-runtime contracts (consumed by Flask AND React)
  field_index.json           # THE field index: key, path, owner, aliases, GSSM cell, iSBD labels
  domain_constants.json      # Phase palette/codes, service areas
  test-fixtures/             # Fixtures both test suites share (label normalization)
core/
  app_factory.py             # Flask app creation, CORS, security headers, blueprints
  shell/frontend.py          # Packaged app only: serves the built frontend + forwards /gssm-api (S0L_FRONTEND_DIST)
  shell/updates.py           # Packaged app only: finds, downloads and stages s0L updates from monday; /api/updates/*
  shared/
    state.py                 # JSON persistence (load_data/save_data) + load-time migration w/ backup
    field_index.py           # Loads shared/field_index.json (aliases, owners, iSBD labels, GSSM cells)
    domain.py                # Loads shared/domain_constants.json
    migrations.py            # Brings stored deals onto index keys
    vault.py                 # DPAPI-encrypted secret files (monday + Salesforce credentials)
    opportunity_ids.py       # Salesforce opportunity IDs: 18-char form, what a board cell holds
    reconcile.py             # Board vs Salesforce differences + the board value an approved fix writes
    outlook_app.py           # The classic Outlook app: detection, app/web choice, the open app (COM)
    defaults.py              # Default approvers for 24 service areas
    security.py              # Frontend origin validation
  features/
    deals/
      deals.py               # Deal CRUD routes (thin handlers) + /gssm-sync
      writes.py              # Owner-aware write gate (unknown 400, foreign-owned 409)
      services.py            # Activity init, deal assembly, cascade cleanup
    documents/
      documents.py           # Routes only
      pptx_io.py             # PPTX summaries, stored copies, find/replace writes
      isbd_maps.py           # iSBD slide-title/table-row maps (field labels live in the index)
      isbd_extract.py        # iSBD field extraction
      isbd_export.py         # iSBD export + native Gantt (uses core.shared.domain)
      slide_render.py        # Async slide rendering: PowerPoint, else LibreOffice + pdftoppm
      records.py             # Deal ↔ document linkage + iSBD import routing
      onedrive.py            # Windows registry OneDrive discovery
    settings/settings.py     # Activity/resource structure, approvers, contacts, dashboard preferences (my deals / everyone)
    notices/notices.py       # TT Exec notices (post/remove, exec-checked); stored locally in deals_data.json
    calendar/calendar.py     # Outlook calendar cache reader (outlook_sync.py fills it from the open classic Outlook, dev and packaged)
    integrations/monday/     # monday.com: OAuth sign-in (oauth.py), DPAPI credentials, board, who you are
                             # (identity.py: board name picked once; TT Execs), new rows (newdeal.py)
                             # s0L's own release item + update download (releases.py), npm run release (publish.py)
    integrations/salesforce/ # IBM Sales Cloud, read only: OAuth+PKCE sign-in (oauth.py, no secret), DPAPI tokens,
                             # check of every board deal by opportunity number (check.py; writer.py = only
                             # salesforce-field writer), npm run salesforce:inventory / salesforce:provision
    integrations/outlook/    # The classic Outlook app via its local connection (no Graph, no sign-in): app or
                             # browser choice (routes.py), real drafts/invites with deal documents (drafts.py),
                             # people lookups as you type + Outlook's address book picker (people.py)
    integrations/client_logos/ # client logos: Wikidata/website image fetch (fetcher.py), exact-name
                             # resolver, once-only background worker, local cache, sandboxed image routes,
                             # review routes (no page; the deal details panel hides/fixes a logo)
                             # client, field-index mapping, sync (writer.py = only monday-field writer)
tests/                       # pytest (tmp_store fixture — never touches deals_data.json)
scripts/build-field-registry.mjs  # Generates FIELD_REGISTRY.md from the index
packaging/                   # Portable signed build: build.ps1 + launcher/ (s0L.exe tray launcher, C#)
```

### Frontend structure
```
frontend/src/
  App.jsx                    # Shell: deal selection, modals, keyboard shortcuts, module routing
  AppHeader.jsx              # Top nav: breadcrumb, search, monday connect/status, settings, new deal
  shell/
    dealShell.js             # Module definitions (Overview (home), GSSM, iSBD, GenAI, Greenstar, Documents, Metrics, Admin)
    moduleRegistry.js        # Lazy-loaded component registry
    MondayConnect.jsx        # Header monday icon: click to connect, status dot, click again to sync (mondayBadge.js)
    SalesforceConnect.jsx    # Header Salesforce icon: click to connect, status dot, click again to check (salesforceBadge.js)
    OutlookConnect.jsx       # Header Outlook icon (outlookBadge.js) + OutlookPicker.jsx: the Outlook app or the browser
    NoticeBanner.jsx         # Dashboard (Tile/Metrics) header-center notices: rotate every 6 s, hover = latest five, chevron = all
    UpdatePrompt.jsx         # Packaged app: "s0L x.y.z is ready · Restart now / Later" (updateOffer.js decides)
  features/
    home/                    # "Overview" in the rail: Summary, Timeline, Activities, Financials, Resources, Calendar, Contacts tabs
    isbd/                    # Full iSBD slide editor (extraction, prefill, undo, export)
    genai/                   # GenAI in the deal: the iSBD's GenAI answer and where the record mentions GenAI (new)
    documents/               # Document library, required slots, upload/download
    deals/                   # DealList, PipelineMetrics (list + monday people pickers), ExecDashboard (TT Exec view), NewDealModal, CommandPalette, Import/Export, useDeals
    settings/                # Approvers + Contacts tabs
    gssm/                    # GSSM editor: calc/, sheets/, utils/, components/, hooks/ (sync
                             # boundary — see GSSM_SYNC.md) + shell/ (s0L-only orchestration)
    greenstar/               # Staffing pivot views over GSSM data (via shared/gssmData)
    metrics/, admin/         # This deal against similar deals; the deal record (fields, owners, links)
  shared/
    useStore.js              # Zustand store (currentDealId, modal state)
    dealStore.js             # Zustand deal-data cache (deals, patchDeal, GSSM syncStatus)
    updateStore.js           # s0L's own update: status, Later, restart (prompt, Settings icon dot, Settings bar)
    services/dealService.js  # Canonical deal API client (ALL modules import from here)
    services/mondayService.js # monday sign-in status + board sync client
    services/salesforceService.js # Salesforce sign-in status, check, differences client
    gssmData/                # Sanctioned read-only seam into GSSM engine for other modules
    apiClient.js             # Fetch wrapper (get/post/put/del/postFormData)
    constants/               # fieldIndex.js (loads shared/field_index.json), referenceData.js (dropdowns),
                             # deal_constants.json, gssmFieldMap.js (sheet layouts + phase palette)
    ui/                      # Modal, ConfirmDialog, ErrorBoundary, WorkspaceTabs
    utils/                   # formatters, financialsHelpers, timelineHelpers, gssmBridge
```

## Code Style

### Python (backend)
- Flask blueprints per feature; register in `app_factory.py`
- Use `load_data()` / `save_data()` from `core.shared.state` for all persistence
- Return JSON responses with appropriate HTTP status codes
- Keep route handlers in their feature blueprint file

### JavaScript/React (frontend)
- Functional components only; hooks for state and effects
- Zustand for global state (`useStore.js`); local state for component-specific UI
- Lazy-load new modules via `React.lazy()` in `moduleRegistry.js`
- API calls go through `shared/apiClient.js` or feature-specific service files (e.g., `dealService.js`)
- Constants in `shared/constants/` — single source of truth for dropdowns, colors, thresholds
- CSS custom properties for theming (`--impl-color`, `--status-*`, `--phase-*`)
- **SQUARE & SEAMLESS — the seamless law**: no rounded corners (all `--radius-*` are `0px`, and a base.css rule squares hardcoded radii; only status dots/spinners stay round). No seams: surfaces have no outlines, edge lines or divider lines between sections — separate by tone, spacing and soft depth; small controls are tonal blocks on `--control-fill`. Hover = *raise* (cards: `--lift` + `--shadow-raise`, or add `.liquid-raise`) or *highlight* (rows, and cards holding inputs: `--hover-wash`/`--hover-ring`, never a transform), via `transition: var(--transition-liquid)`. Full law in [DESIGN.md](../DESIGN.md).
- **Dark-first, user-themed**: Obsidian (dark) is the default. A theme is a palette in `shared/ui/ThemeSwitcher.jsx`, and every color derives from `--canvas` / `--surface` / `--ink` / `--accent`. Never hardcode a theme color or a blue: use tokens and `var(--accent)`, with `var(--on-accent)` for text on accent fills. Verify in Obsidian, Frost (light) and a light-accent theme (Aurora or Ember).
- **Font weight token**: All title/header/label fonts use `--font-weight-thin` (in `base.css :root`). To adjust title thickness globally, change this single token. Currently `400`. All selectors with `-title`, `-label`, `-name`, `-header`, plus `h1`–`h4` inherit it.
- **Numbers**: one style everywhere, tabular figures in the UI font (set on `body`). Never put amounts or counts in `--font-family-mono`, which is for IDs and codes.
- **Type scale tokens** (in `base.css :root`): Use these instead of raw `rem` values.
  | Token | Size | Role |
  |---|---|---|
  | `--type-micro` | 0.6875rem (11px) | micro labels, dots, format badges |
  | `--type-tiny` | 0.72rem (11.5px) | tags, small badges, section badges |
  | `--type-2xs` | 0.75rem (12px) | impl tags, stat labels |
  | `--type-xs` | 0.78rem (12.5px) | card impl, archive links |
  | `--type-sm` | 0.8125rem (13px) | tab labels, filter chips, meta |
  | `--type-body` | 0.875rem (14px) | body text, buttons, card titles |
  | `--type-body-lg` | 0.9375rem (15px) | approver info, contacts |
  | `--type-md` | 1rem (16px) | settings labels, card titles |
  | `--type-lg` | 1.125rem (18px) | deal hero h2, section headings |
  | `--type-xl` | 1.35rem (21.6px) | modal h2, major headers |
  | `--type-2xl` | 1.625rem (26px) | page titles |
  | `--type-3xl` | 2rem (32px) | hero display, dashboard headers |

## Build and Test

```bash
npm run install:all          # Install Node + Python deps
npm run dev                  # Start frontend (5120) + Flask (5121) + GSSM (5175) concurrently
npm run dev:frontend         # Vite dev server only
npm run dev:backend          # Flask only (python deal_tracker.py)
npm run dev:gssm             # GSSM Express only (node gssm-server/index.js)
npm run verify               # Build frontend + syntax-check Python
npm test                     # pytest (tests/) + Vitest (frontend/src/**/*.test.js)
npm run registry             # Regenerate FIELD_REGISTRY.md after editing shared/field_index.json
npm run clean                # Remove dist, __pycache__, .DS_Store
npm run clean:deep           # Also removes rendered slide folders (documents/*_slides/)
npm run package              # Signed portable zip -> release\s0L-<version>.zip (az login first; see UI_ARCHITECTURE.md)
npm run package:unsigned     # Same, unsigned, for local testing
npm run release              # Signed build + upload to s0L's monday item (next version; needs a monday sign-in that may change boards)
npm run salesforce:provision # Store the Salesforce org address + consumer key on this PC (say yes only for IBM Sales Cloud)
npm run salesforce:inventory # Write docs/salesforce/inventory.md: what the signed-in account can reach (names only)
```

**Prerequisites**: Node.js 16+, Python 3.8+. Slide previews use desktop PowerPoint, or LibreOffice + pdftoppm when PowerPoint is missing.

## Conventions

- **Docs stay current**: structural changes update [UI_ARCHITECTURE.md](../UI_ARCHITECTURE.md); token/theme/visual-rule changes update [DESIGN.md](../DESIGN.md). Treat both as part of the change, not an afterthought.
- **Dev server**: "Boot the dev server" or "start the app" always means start **all three** servers — frontend (port 5120), Flask backend (port 5121), and GSSM Express backend (port 5175) — using the `dev server` compound task. Never start just one or two.
- **New features**: Add as a module in `dealShell.js` + lazy component in `moduleRegistry.js`
- **New API endpoints**: Add to the relevant blueprint in `core/features/`; update `shared/services/dealService.js` if frontend needs it
- **Deal data model changes**: Declare or change the field once in `shared/field_index.json` (key, path, owner, old names as aliases, GSSM cell, iSBD labels), then `npm run registry`. Never add field keys, aliases or labels anywhere else. `deal_structure.py` holds activity categories/resources; `deal_constants.json` holds dropdown reference data.
- **Field ownership**: GSSM values (owner `gssm`) are written only by `PUT /api/deals/:id/gssm-sync` and are never recalculated or edited in Home or iSBD — they must never disagree. Derived values are computed, never stored.
- **Cross-runtime constants**: Phase codes/colors and service areas live in `shared/domain_constants.json` — consumed by `core/shared/domain.py` (Flask) and `gssmFieldMap.js` (React). Never redefine them per-runtime.
- **Deal API access**: All frontend modules import `dealService` from `shared/services/dealService.js` — never from another feature folder. Deal records are cached in `shared/dealStore.js`; after a PUT, call `patchDeal(updated)` instead of a full reload where possible.
- **No external network, one exemption**: The app is localhost-first. Never add CDNs, analytics or external assets. Hand-off links (`mailto:`, `msteams:`, and Outlook on the web's compose pages) that open the user's installed Outlook/Teams, or their Outlook on the web, pre-filled are allowed; build them with `features/home/handoff.js` and `shared/utils/outlookLinks.js`. The classic Outlook app is reached through its own local connection (COM, `core/shared/outlook_app.py`): no network, no sign-in, no registration. **Sanctioned integrations are the only exemption:** Microsoft Outlook (Microsoft Graph; not used, the user ruled out app registrations), Salesforce and monday.com. The Flask backend calls their APIs, never the browser, and only after the user signs in with their own account (OAuth, or a personal access token the user creates). Calls go over HTTPS to those services' own hosts, and tokens stay on the machine. **Client logos** (signed off 2026-10-27) are the other exemption: the backend may query Wikidata's query service (query.wikidata.org) and download a client's logo from Wikimedia's image server (upload.wikimedia.org) or its icon from the client's own website, and, for a Wikipedia article link a person pastes, read that article's summary for its lead image; images only, all through `core/features/integrations/client_logos/fetcher.py`, cached locally. **s0L updates** (signed off 2026-10-28) are the third: the packaged app's backend downloads s0L's own release zips from monday's file storage (files-monday-com.s3.amazonaws.com), only through the links monday's API hands out, all in `core/features/integrations/monday/releases.py`. Any other outside service needs the user's explicit sign-off first.
- **File uploads**: Stored in `documents/` directory; rendered slides go to `documents/{doc_id}_slides/`
- **iSBD field mapping**: `isbdPrefillMap.js` maps 130+ field name variants — update when adding new iSBD fields
- **Module independence**: Unless specified, avoid making global code changes across modules. Stop and ask.

## Module Data Unification

### GSSM Sync Protocol
The GSSM module exists in both this repo (embedded) and the standalone Electron app. See [GSSM_SYNC.md](../GSSM_SYNC.md) for the shared boundary definition and changelog. **When editing any file under `frontend/src/features/gssm/calc/`, `sheets/`, `utils/`, `components/`, or `hooks/`, append a changelog entry to GSSM_SYNC.md** so the standalone repo agent can pick up the change.

The goal is to ensure all modules work independently, but unify key data. Home tabs and the GSSM module operate on the same underlying deal data — timelines, staffing, financials, and resources. When a value is edited in either the Home tab or the GSSM module, both views must reflect the change because they share a single data source on the deal, not because they directly call each other.

- **Shared data, not shared UI**: Home tabs (Timeline, Resources, Financials) and GSSM sheet views (Imp TL, Staffing, Bid Metrics, PTI) each render their own UI, but read/write the same deal-level fields.
- **Single source of truth**: Unified constants (phase colors, SAP Activate codes, band definitions) live in `shared/constants/`. Do not duplicate domain constants inside a single module.
- **Shared utilities**: Pure calculation logic (phase normalization, pivot aggregation, formatting) belongs in `shared/utils/` so both Home and GSSM can import it. Module-specific rendering stays in the module.
- **No cross-module imports**: Home must never import from `features/gssm/` and vice versa. Shared logic goes through `shared/`.

## Key Data Flows

- **Deal creation** → POST `/api/deals` → auto-populates 50+ activities from `ACTIVITY_CATEGORIES` + `DEFAULT_APPROVERS`
- **PPTX upload** → validates structure → extracts fields to `deal.isbd_data` → async renders slides to JPEG
- **iSBD export** → flattens editor state → clones source PPTX → find/replace cells → download

## Domain Context

This tool tracks enterprise SAP implementation deals through organizational approval gates. Key domain terms:
- **SAL/PAL**: Service Area Lead / Practice Area Lead (approver roles across 12 service areas)
- **iSBD**: Integrated Solution Business Design (the core deal document, PowerPoint format)
- **GSSM**: Global Standard Staffing Model (Excel-based staffing plan)
- **SRR/PRR**: Solution Readiness Review / Pricing Readiness Review (formal approval gates)
- **TCV**: Total Contract Value
- **GP**: Gross Profit
- **RBK**: Risk Book
- **DCA**: Deal Compliance Assessment
