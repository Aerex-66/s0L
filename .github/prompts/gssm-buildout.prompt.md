---
name: "gssm-buildout"
description: "Kick off the GSSM build-out: make s0L's GSSM module a full, trustworthy working copy of the real GSSM Excel workbook. Use when starting the GSSM session."
argument-hint: "Path to the GSSM workbook (.xlsm) and what to tackle first"
agent: "agent"
---

# GSSM build-out: kickoff

You're picking up the **GSSM module** of s0L. The real GSSM (Global Standard Staffing Model) is a massive Excel workbook (.xlsm: dozens of sheets, thousands of formulas, macros, pivots, validations) that solutioners use to build a deal's staffing plan, rates, effort, implementation timeline and price (PTI). The goal of this work: s0L's GSSM module becomes a complete, trustworthy replacement for working in that workbook, and the numbers it produces feed the rest of s0L through the deal record.

## Read first

- [copilot-instructions.md](../copilot-instructions.md): repo rules (MCP servers, field ownership, tokens, dev server).
- [UI_ARCHITECTURE.md](../../UI_ARCHITECTURE.md): layers, the deal record and its owners, and "The standalone story (why GSSM is special)".
- [GSSM_SYNC.md](../../GSSM_SYNC.md): the boundary shared with the standalone GSSM app, and its changelog.
- [DESIGN.md](../../DESIGN.md): the look. GSSM's styles live only in `gssm.css`, scoped under `.gssm-module`.
- [FIELD_REGISTRY.md](../../FIELD_REGISTRY.md): the 29 fields GSSM owns and the cells they come from.

## How it works today (verify before relying on any of it)

- **Frontend**, `frontend/src/features/gssm/`:
  - s0L-only: `GssmModule.jsx`, `gssmApi.js`, `gssm.css`, and `shell/` (landing `GssmLanding.jsx`, workbook lifecycle `useGssmWorkbook.js`, topbar metrics `useHeaderMetrics.js`, sheet routing `SheetViewRouter.jsx`, sheet groups `sheetGroups.js`).
  - Shared with the standalone app (any edit needs a GSSM_SYNC.md changelog entry): `calc/` (formula engine `universalFormulaCalc.js`, Excel function adapters, dependency index), `sheets/` (21 views: Staffing, PTI, Imp TL, Bid Metrics, Rates, FS and RICEFW Estimation, JRS, Forex, Inflation, GPE, Summary, Pivot…), `utils/`, `components/`, `hooks/` (`useRecalcEngine`, `useMacroActions`, `useSheetNavigation`, `useDealSync`).
- **Server**, `gssm-server/` (Express on 127.0.0.1:5175, proxied as `/gssm-api`): `engine/workbookParser.js` parses the .xlsm into per-sheet metadata; `routes/engine.js` (workbooks, import, reimport, edits, workbook-formulas, forex); `routes/spreadsheet.js` (export back to .xlsm through `xlsm_update_zip.py`, download, cleanup); edits persist in SQLite (`storage.js`).
- **Into the deal**: `hooks/useDealSync.js` debounces edits; `shared/utils/gssmBridge.js` extracts timelines (Imp TL), financials (PTI_Estimator B14–B44), the staffing summary, bid metrics and the RICEFW summary, and writes them through `PUT /api/deals/:id/gssm-sync`, the only writer of GSSM-owned fields. Home (Financials, Resources, Timeline), the iSBD, Greenstar and Metrics show them read-only.
- **Look**: the landing page and `gssm.css` were brought onto the theme tokens on 2026-10-28 (six white-on-category text colours kept on purpose). Don't redo that; extend it.
- **Not yet exercised**: no workbook has been imported on this computer, so the editor views, recalculation, export and the deal sync have never been checked end to end with the real GSSM.
- The workbook has a `Gen AI Assumptions` sheet. s0L's new GenAI module (`features/genai/`) may read it later through `shared/gssmData/`; note what it holds, don't build that now.

## Rules that don't bend

- **One owner per field**: GSSM values are written only by the gssm-sync route; nothing else recalculates or edits them. A new cross-module field is declared once in `shared/field_index.json`, then `npm run registry`.
- **Sync boundary**: changes under `calc/`, `sheets/`, `utils/`, `components/`, `hooks/` or `gssm-server/` get a GSSM_SYNC.md changelog entry. s0L-only work goes in `GssmModule.jsx`, `shell/`, `gssmApi.js`, `gssm.css`.
- **Local only**: no network, no CDNs. The workbook stays on this computer; never commit .xlsm/.xlsx files or the SQLite store.
- **Styles**: tokens only, scoped under `.gssm-module` (no `:root`, no bare `.btn`); check Obsidian, Frost and a light-accent theme.
- **Process**: load the MCP servers (Superpowers, context-mode, Pylance). Brainstorm with me first, then a written plan, then build. Start all three servers with the `dev server` task.

## First session

1. Ask me for the workbook's path and which sheets matter most day to day.
2. Import it and take inventory: sheets and their sizes, formula counts, functions used, named ranges, data validations, macros (VBA), pivot definitions, external links. Compare that with what the parser and the 21 sheet views cover today.
3. Check fidelity: for key outputs (PTI_Estimator B30–B40, staffing totals, the Imp TL lanes) compare s0L's recalculated values with Excel's cached values, and list every formula or function the engine gets wrong or can't evaluate.
4. Check the round trip: edit in s0L, export, open in Excel; values and formulas must survive.
5. Check the deal sync: after an edit, Home (Financials, Resources, Timeline) and the iSBD show the new values.
6. Write it all up in `docs/superpowers/specs/<date>-gssm-buildout-design.md` (gaps, risks, proposed order of work) and bring me the order to agree. My starting guess: engine fidelity first, then the solutioner's main flow (staffing → rates → effort → timeline → price), then macros, then export.
