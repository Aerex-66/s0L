# GSSM ↔ Standalone Sync Protocol

## Shared Boundary

The GSSM module lives in two places:

| Repo | Location | Role |
|------|----------|------|
| **s0L** | `frontend/src/features/gssm/` + `gssm-server/` | Embedded module inside deal tracker |
| **Standalone** | `vite-react/src/` + `server/` | Electron desktop app |

### What's shared (must stay in sync)
- `calc/` — `universalFormulaCalc.js`, `excelFunctionAdapters.js`, `formulaDeps.js`
- `sheets/` — all 21 sheet view components
- `utils/` — `cellUtils.js`, `gridHelpers.js`, `normalizer.js`, `pivotEngine.js`, `parsePivotInfo.js`
- `components/` — `CellInput.jsx`, `CollapsibleSection.jsx`, `ColumnToggle.jsx`
- `hooks/` — `useRecalcEngine.js`, `useMacroActions.js`, `useSheetNavigation.js`
- `server/` ↔ `gssm-server/` — Express API, storage, engine parsers, Python patcher

### What's NOT shared (diverges per repo)
- `GssmModule.jsx` (s0L) vs `App.jsx` (standalone) — different shell wrappers
- `gssmApi.js` (s0L, uses `/gssm-api` prefix) vs `engineApi.js` (standalone, direct)
- `gssm.css` (s0L, scoped) vs `App.css` (standalone)
- `useTheme.js` — standalone has its own theme

### Import path differences
| s0L path | Standalone path |
|----------|----------------|
| `./calc/...` | `../calc/...` |
| `./utils/...` | `../utils/...` |
| `./components/CellInput` | `../utils/CellInput` |
| `./sheets/...` | `../sheets/...` |

## Changelog Format

When making changes to shared files in EITHER repo, append an entry below.
The agent working on the other repo should read this file and apply the changes.

```
## [YYYY-MM-DD] <repo> — <summary>
- Changed: <file> — <what changed>
- Added: <file> — <why>
- Removed: <file> — <why>
- Breaking: <yes/no> — <migration notes if yes>
```

---

## Changelog

### [2026-03-16] standalone → s0L — Initial integration
- Copied: All calc/, sheets/, utils/, components/, hooks/ from standalone into s0L
- Created: `GssmModule.jsx` — s0L-specific shell (replaces App.jsx)
- Created: `gssmApi.js` — API wrapper with `/gssm-api` prefix
- Created: `gssm.css` — scoped styles (`.app-shell` → `.gssm-module`)
- Copied: `server/` → `gssm-server/` with self-contained paths
- Fixed: `better-sqlite3` added to gssm-server/package.json
- Fixed: SQLite path uses `import.meta.url` instead of `process.cwd()`
- Import paths adjusted: `../utils/CellInput` → `./components/CellInput`, etc.

### [2026-03-16] s0L — Feature parity pass
- Changed: `hooks/useTheme.js` — now scoped via `data-gssm-theme` attribute on `.gssm-module` container instead of `data-theme` on `<html>`. Accepts a `containerRef` arg (unused for now, scoping is via CSS attribute). Does NOT conflict with s0L shell theme.
- Changed: `gssm.css` — all 85 `[data-theme=...]` selectors replaced with `[data-gssm-theme=...]`
- Changed: `GssmModule.jsx` — ported all missing standalone features:
  - Theme switcher: `useTheme` hook wired, footer swatches render in both landing and editor
  - Footer now renders on BOTH states (landing + editor), not just when `activeSheet` is truthy
  - `handleRemoveRow`: full zero-out logic — iterates all `cN` keys, records blank edits, pushes to pending, calls `scheduleRecalc`
  - `handleAddRow`: returns `newRowIndex`, sets `__rowIndex` on new row
  - Ephemeral tab: renders active sheet tab with close (X) when sheet is not in visible list
  - Recalc badge in formula bar: `{isLoading && <span className="gssm-recalc-badge">Recalc</span>}`
  - Chevron rotation on macro menu: `transform: rotate(180deg)` when open
  - LogOut icon on Exit button
  - "or use Browse below" hint on drop zone
- Added CSS: `.gssm-footer-swatches`, `.gssm-footer-swatch`, `.gssm-recalc-badge`, `.gssm-drop-hint`
- Breaking: No — all changes are additive to the s0L module only

### [2026-03-16] s0L — RICEFW Estimation dedicated sheet view
- Added: `sheets/RICEFWEstimationSheetView.jsx` — purpose-built view replacing generic DataTableSheetView for "RICEFW Estimation" sheet
  - Dashboard with type breakdown chips (R/I/C/E/F/W) that act as clickable filters
  - Summary panel with total objects, estimated hours, complexity distribution tags
  - Horizontal effort bars by RICEFW type with percentage labels
  - Grouped collapsible sections per RICEFW type with effort subtotals
  - Smart column detection: auto-identifies type, complexity, effort, description, module columns from header names
  - Colored complexity chips (V-High → Low color scale)
  - Type badges with icons/colors in each row
  - Text search across all columns
  - Falls back to flat table when type column not detected
- Changed: `GssmModule.jsx` — added import, `isRicefwEstimationSheet` flag, route to new view; removed 'RICEFW Estimation' from `DATA_TABLE_SHEETS` set
- Added CSS: `.rfw-*` classes in `gssm.css` — dashboard grid, filter chips, summary numbers, effort bars, type badges, complexity chips, dark theme overrides
- Breaking: No — standalone needs to add this file with adjusted import paths (`../utils/CellInput`, `../utils/CollapsibleSection`, `../utils/normalizer`)

### [2026-03-19] s0L — RICEFW Estimation view v2 (UI enhancements)
- Changed: `sheets/RICEFWEstimationSheetView.jsx` — 13 frontend-only enhancements (no workbook writes):
  1. Avg hrs/object in header badge and summary card
  2. Stacked FS/Dev/Test sub-bars when phase columns detected
  3. Complexity × Type heatmap matrix in Object Breakdown card
  4. Sticky `<thead>` on all tables
  5. Left-border color stripe per RICEFW type on data rows
  6. Description column min-width / word-break priority
  7. `<tfoot>` subtotals per collapsible group and flat table
  8. Module/area filter chips (secondary filter row)
  9. Complexity filter chips (secondary filter row)
  10. Click-to-sort on any column header (asc/desc/none cycle)
  11. ColumnToggle integration (import from `../components/ColumnToggle`)
  12. Empty state card when no data or no type column detected
  13. Effort bar labels render inside bar fill when wide enough
- Added CSS: `.rfw-sticky-head`, `.rfw-th-sortable`, `.rfw-sort-arrow`, `.rfw-th-desc`, `.rfw-td-desc`, `.rfw-tfoot`, `.rfw-td-subtotal`, `.rfw-summary-value--avg`, `.rfw-filter-row`, `.rfw-filter-group`, `.rfw-filter-group-label`, `.rfw-mini-chip`, `.rfw-filter-count`, `.rfw-heatmap*`, `.rfw-bar-fill--stacked`, `.rfw-bar-seg`, `.rfw-bar-inside-label`, `.rfw-phase-legend`, `.rfw-phase-dot`, `.rfw-empty*`, dark theme overrides
- Breaking: No — all read-only frontend derivations, no cell edits

### [2026-03-19] s0L — RICEFW v3: card layout + GSSM scroll fix
- Changed: `gssm.css` — `.gssm-main` changed from `overflow: hidden` to `overflow-y: auto; overflow-x: hidden`. Fixes scroll for ALL long sheet views (Staffing, FS Estimation, RICEFW, etc.). `.gssm-sheet-content` given `min-height: 0` for proper flex containment.
- Changed: `sheets/RICEFWEstimationSheetView.jsx` — Complete detail section rewrite from `<table>` to card rows:
  - Removed: ColumnToggle import + usage, `renderRow()`, `renderTableHeader()`, `renderTableFoot()`, all `<table>`/`<thead>`/`<tbody>`/`<tfoot>` in detail section
  - Added: `RfwCard` child component — compact summary row (type badge, ID, description, module, complexity chip, effort); click to expand shows editable fields grid + phase breakdown pills. No horizontal scroll.
  - Added: Sort control buttons (Name, Module, Complexity, Effort) in detail divider
  - Added: Group footer with total/avg subtotals per collapsible section
  - Primary roles (id, description, module, complexity, totalEffort) shown on card summary; secondary fields (owner, status, remarks, sub-module, phase, etc.) shown in expanded detail grid via CellInput
- Added CSS: `.rfw-card*`, `.rfw-sort-controls`, `.rfw-sort-btn`, `.rfw-card-list`, `.rfw-card-summary`, `.rfw-card-detail`, `.rfw-card-fields`, `.rfw-card-phases`, `.rfw-card-group-footer`, expand animation, dark theme overrides
- Breaking: No — standalone needs updated component + CSS
- Added: `shared/constants/gssmFieldMap.js` — Cell coordinate mappings for all GSSM sheets (ImpTL, PTI, Home, Staffing, BidMetrics). Single source of truth for row/col indices.
- Added: `shared/utils/gssmBridge.js` — Pure extraction/mapping functions:
  - `extractTimeline(impTlRows)` → deal.timelines from ImpTL lanes
  - `extractFinancials(ptiRows)` → deal.financials from PTI_Estimator
  - `extractStaffingSummary(staffingRows)` → deal.staffing summary (headcount, hours, fees, band/team/location distributions, monthly FTE)
  - `extractBidMetrics(bidMetricsRows)` → deal.bid_metrics criteria
  - `extractDealMetadata(homeRows)` → validation fields
  - `mapFinancialsToPtiEdits(financials)` → GSSM cell edits from deal.financials
  - `mapTimelineToImpTlEdits(timelines)` → GSSM cell edits from deal.timelines
  - `extractAllFromWorkbook(rowDataBySheet)` → full deal payload
  - `mapDealToGssmEdits(deal)` → full GSSM cell edit array
- Added: `hooks/useDealSync.js` — React hook for bidirectional sync:
  - GSSM→Deal: debounced extraction after every edit (2s)
  - Deal→GSSM: one-time seed of empty PTI/ImpTL cells from deal data on workbook load
  - Diff-based: skips sync when payload is identical to last push
- Changed: `GssmModule.jsx` — wired `useDealSync` hook, calls `syncOnLoad()` after import/reimport. Now accepts `onUpdate` prop.
- Breaking: No — `useDealSync` is additive. Standalone app does not use it (it's imported from `../../deals/dealService` which doesn't exist in standalone).

### [2026-03-16] s0L — iSBD ↔ GSSM data unification + FIELD_REGISTRY update
- Changed: `shared/utils/gssmBridge.js` — `extractFinancials()` now adds canonical aliases (`price_model`, `pricing_type`, `risk_level`) alongside GSSM names (`contract_type`, `price_type`, `risk_rating`). Maps `services_revenue`→`tcv` when TCV is empty.
- Changed: `features/isbd/isbdSlideTemplate.json` — wired prefill annotations:
  - `delivery_start`: `false` → `{ "compute": "delivery_start", "format": "date" }`
  - `work_effort`: added `{ "compute": "work_effort" }`
  - `onshore_offshore_pct`: added `{ "compute": "onshore_offshore_pct" }`
- Changed: `features/isbd/isbdPrefillMap.js` — added 3 new compute functions:
  - `work_effort(deal)` — reads `deal.staffing.total_hours`
  - `onshore_offshore_pct(deal)` — reads `deal.staffing.location_distribution`, formats as "Onshore 60% / Offshore 40%"
  - `total_resources(deal)` — now prefers `deal.staffing.total_headcount` over counting resource arrays
  - `financial_assumptions(deal)` — enriched with GP%, PTI%, price_model, pricing_type
- Changed: `features/isbd/useIsbdDocument.js` — added live prefill refresh: when deal financials/timelines/staffing change, non-dirty slides receive updated values without blowing away user edits.
- Changed: `features/home/components/Timeline.jsx` — replaced inline `LEGACY_PHASE_MAP` with shared `DEAL_PHASE_TO_CODE` from `gssmFieldMap.js`. Phase code mapping is now a single source of truth.
- Updated: `FIELD_REGISTRY.md` — 24 fields changed from DRIFT/SOLO to SYNCED. Added Section 21 (Sync Infrastructure) with bridge files and data flow diagram.

### [2026-07-14] s0L — Codebase reorganization (shell extraction + server modularization)
- Changed: `hooks/useDealSync.js` — s0L-only wiring updates:
  - `dealService` import path moved: `../../deals/dealService` → `../../../shared/services/dealService` (dealService relocated to shared/ to fix cross-feature imports)
  - Now writes sync health to the shared `dealStore` (`syncing`/`ok`/`error`) and patches the deal cache with the PUT response instead of relying solely on a full reload. Failed syncs reset the diff hash so the next edit retries.
  - Standalone impact: none (standalone does not use this hook), but if copying, note the new `useDealStore` import does not exist in standalone.
- Changed: `GssmModule.jsx` (s0L-only, NOT shared) — reduced ~1,250 → ~560 lines by extracting s0L shell logic into a new `shell/` folder that is OUTSIDE the sync boundary:
  - `shell/useGssmWorkbook.js` — import/reimport/auto-load/reset lifecycle (dedupes the formerly copy-pasted handleFile/handleReimport pipeline into one `applyWorkbookData`)
  - `shell/useHeaderMetrics.js` — topbar metrics + currency toggle
  - `shell/SheetViewRouter.jsx` — per-sheet view dispatch (imports the shared sheets/)
  - `shell/GssmLanding.jsx` — drop zone + catalog
  - `shell/sheetGroups.js` — DEFAULT_VISIBLE_SHEETS, GPE/SUMMARY/DATA_TABLE/REFERENCE/LOG sheet sets, active-workbook localStorage persistence
  - Removed dead `useTheme` import (was imported but never called)
  - Added: deal-sync status chip in topbar row 2 (`.gssm-sync-chip*` CSS in `gssm.css`)
- Changed: `gssm-server/` — `index.js` split from 881 lines into modules (behavior identical; standalone `server/` should apply the same split):
  - `lib/workbookContext.js` — paths, manifest, latest-workbook state, trusted-path resolution, formulas LRU cache
  - `lib/cellRefs.js` — colToLabel/toA1/parseRangeRef/parseSheetRef
  - `lib/edits.js` — sanitizeXmlUnsafeText/normalizeEditValue/normalizeIncomingEdits/normalizeEditsShallow
  - `lib/validations.js` — resolveNamedRange/buildCellValueMap/getRangeValues/parseValidationList/expandValidationRanges
  - `routes/engine.js` — workbooks/import/reimport/edits/workbook-formulas/forex-stub
  - `routes/spreadsheet.js` — export/download/cleanup (incl. runSpreadsheetSave)
  - `index.js` — app wiring only (~80 lines)
- Changed: `shared/constants/gssmFieldMap.js` (s0L) — PHASE_PALETTE / PHASE_CODE_TO_DEAL / DEAL_PHASE_TO_CODE now loaded from the new cross-runtime contract `shared/domain_constants.json` (also consumed by Flask). Export names/values unchanged; DEAL_PHASE_TO_CODE gained extra synonyms (Realize, Deploy, Sustain, Realize Build/Test/Config/Data).
- Breaking: No — all export names, endpoints, and payload shapes unchanged.

### [2026-07-14] s0L — Lane-name extraction fix (gssmBridge)
- Changed: `shared/utils/gssmBridge.js` (s0L-only sync infrastructure) — `extractTimeline()` now dedupes consecutive identical lane-name column values. Merged Excel cells repeat their value in every spanned column, so "Rollout 1" was extracted as "Rollout 1 Rollout 1 Rollout 1" and written to the deal record. Also added a repeated-fragment repair in `shared/utils/migrateTimelines.js` and ran a one-time cleanup of deals_data.json.
- Breaking: No — standalone does not consume gssmBridge.

### [2026-10-20] s0L — Unified field index: GSSM → deal sync has its own route
- Changed: `hooks/useDealSync.js` (s0L-only hook) — writes through `dealService.syncFromGssm` → `PUT /api/deals/:id/gssm-sync`, the only route allowed to write GSSM-owned fields; sends `gssm_workbook_id` (new `workbookRef` param) so every deal records its linked workbook; Deal → GSSM seeding is timeline-only (GSSM owns every PTI value); the skip-identical-payload check now ignores timestamps (before, it never skipped).
- Changed (s0L-only, outside the boundary): `shared/utils/gssmBridge.js` — financial keys and PTI cells come from `shared/field_index.json`; workbook values stored verbatim (no invented 'Fixed Price'/'No' defaults, no `price_model`/`pricing_type`/`risk_level` duplicates, no `_gssm_source`); adds `total_contingency` (PTI B23); `extractDealMetadata` and `mapFinancialsToPtiEdits` removed. `shared/constants/gssmFieldMap.js` — `PTI`, `HOME`, `PTI_TO_DEAL_FINANCIALS`, `DEAL_FINANCIALS_TO_PTI_INPUTS` removed. `shell/useGssmWorkbook.js` reads the GSSM opportunity-number cell from the index.
- Breaking: No for the standalone app (it uses neither useDealSync nor gssmBridge).

### [2026-10-28] s0L — SQLite location from the environment (packaged app)
- Changed: `gssm-server/storage.js` — `DEFAULT_DB_PATH` honors `GSSM_DB_PATH` when set (the packaged s0L keeps the store in `%LOCALAPPDATA%\s0L\gssm`, outside the app folder). Unset = the old `.gssm/store.sqlite` beside the server. `ENGINE_IMPORT_ROOT` was already an override.
- Breaking: No — standalone `server/storage.js` can take the same one-line change, or skip it.
