# s0L — Deal Tracker

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
- **Security**: Localhost-only, CORS-restricted, security headers (no CSP yet), no external network

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
  shared/
    state.py                 # JSON persistence (load_data/save_data) + load-time migration w/ backup
    field_index.py           # Loads shared/field_index.json (aliases, owners, iSBD labels, GSSM cells)
    domain.py                # Loads shared/domain_constants.json
    migrations.py            # Brings stored deals onto index keys
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
      slide_render.py        # Async LibreOffice slide rendering
      records.py             # Deal ↔ document linkage + iSBD import routing
      onedrive.py            # Windows registry OneDrive discovery
    settings/settings.py     # Activity/resource structure, approvers, contacts
    calendar/calendar.py     # Outlook calendar cache reader
tests/                       # pytest (tmp_store fixture — never touches deals_data.json)
scripts/build-field-registry.mjs  # Generates FIELD_REGISTRY.md from the index
```

### Frontend structure
```
frontend/src/
  App.jsx                    # Shell: deal selection, modals, keyboard shortcuts, module routing
  AppHeader.jsx              # Top nav: breadcrumb, search, settings, new deal
  shell/
    dealShell.js             # Module definitions (Home, iSBD, GSSM, Documents, Metrics, Admin)
    moduleRegistry.js        # Lazy-loaded component registry
  features/
    home/                    # Timeline, Activities, Financials, Resources, Calendar, Contacts tabs
    isbd/                    # Full iSBD slide editor (extraction, prefill, undo, export)
    documents/               # Document library, required slots, upload/download
    deals/                   # DealList, NewDealModal, CommandPalette, Import/Export, useDeals
    settings/                # Approvers + Contacts tabs
    gssm/                    # GSSM editor: calc/, sheets/, utils/, components/, hooks/ (sync
                             # boundary — see GSSM_SYNC.md) + shell/ (s0L-only orchestration)
    greenstar/               # Staffing pivot views over GSSM data (via shared/gssmData)
    metrics/, admin/         # Metrics dashboard, placeholder stub
  shared/
    useStore.js              # Zustand store (currentDealId, modal state)
    dealStore.js             # Zustand deal-data cache (deals, patchDeal, GSSM syncStatus)
    services/dealService.js  # Canonical deal API client (ALL modules import from here)
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
- **Light-first**: Arctic Glass (light) is the default theme. Build and verify light-first, then check the two dark themes. Do not default new UI to dark styling.
- **Font weight token**: All title/header/label fonts use `--font-weight-thin` (in `base.css :root`). To adjust title thickness globally, change this single token. Currently `400`. All selectors with `-title`, `-label`, `-name`, `-header`, plus `h1`–`h4` inherit it.
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
```

**Prerequisites**: Node.js 16+, Python 3.8+, LibreOffice + pdftoppm (for PPTX rendering)

## Conventions

- **Docs stay current**: structural changes update [UI_ARCHITECTURE.md](../UI_ARCHITECTURE.md); token/theme/visual-rule changes update [DESIGN.md](../DESIGN.md). Treat both as part of the change, not an afterthought.
- **Dev server**: "Boot the dev server" or "start the app" always means start **all three** servers — frontend (port 5120), Flask backend (port 5121), and GSSM Express backend (port 5175) — using the `dev server` compound task. Never start just one or two.
- **New features**: Add as a module in `dealShell.js` + lazy component in `moduleRegistry.js`
- **New API endpoints**: Add to the relevant blueprint in `core/features/`; update `shared/services/dealService.js` if frontend needs it
- **Deal data model changes**: Declare or change the field once in `shared/field_index.json` (key, path, owner, old names as aliases, GSSM cell, iSBD labels), then `npm run registry`. Never add field keys, aliases or labels anywhere else. `deal_structure.py` holds activity categories/resources; `deal_constants.json` holds dropdown reference data.
- **Field ownership**: GSSM values (owner `gssm`) are written only by `PUT /api/deals/:id/gssm-sync` and are never recalculated or edited in Home or iSBD — they must never disagree. Derived values are computed, never stored.
- **Cross-runtime constants**: Phase codes/colors and service areas live in `shared/domain_constants.json` — consumed by `core/shared/domain.py` (Flask) and `gssmFieldMap.js` (React). Never redefine them per-runtime.
- **Deal API access**: All frontend modules import `dealService` from `shared/services/dealService.js` — never from another feature folder. Deal records are cached in `shared/dealStore.js`; after a PUT, call `patchDeal(updated)` instead of a full reload where possible.
- **No external network**: The app is designed for air-gapped localhost use — never add external API calls, CDNs, or analytics. Hand-off links (`mailto:`, `msteams:`) that open the user's installed Outlook/Teams pre-filled are allowed — build them with `features/home/handoff.js`
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
