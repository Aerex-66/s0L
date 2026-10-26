# DealShell Modularization Guide

This folder defines the app-shell module contract for the left rail (DealShell).

## Purpose
- Keep shell navigation and module wiring centralized.
- Make adding new modules a single-entry change.
- Prevent feature code from coupling to shell layout internals.

## Current Files
- `dealShell.js`
  - `DEAL_SHELL_MODULES`: registry of modules shown in the left rail.
  - `DEFAULT_DEAL_SHELL_MODULE_ID`: shell default selection.
  - `emitDealShellSelection(...)`: emits selection payload to the host/export bridge.
- `adapters/moduleAdapterBindings.js`
  - Declares module-to-adapter bindings.
  - Keeps module identity separate from document format/engine.
- `adapters/powerpointAdapter.js`
  - PowerPoint adapter contract surface for import/write/export.
  - Current starter target for `iSBD`.

## Module Registry Contract
Each module entry in `DEAL_SHELL_MODULES` must include:
- `id`: stable internal key (lowercase, no spaces)
- `label`: UI label in the left rail
- `exportKey`: payload key consumed by external listeners
- `route`: logical route token for future route mapping

Example:
```js
{ id: 'metrics', label: 'Metrics', exportKey: 'METRICS', route: 'metrics' }
```

## Add a New Module (Single-Entry Flow)
1. Open `dealShell.js`.
2. Add one object to `DEAL_SHELL_MODULES`.
3. Done.

No drawer component changes are required if you only add a new module entry.

## Selection Export Contract
When a module is clicked, the app emits:
- Browser event: `s0l:dealshell:module-selected`
- Optional bridge callback: `window.s0lShellExport(payload)` (if present)

Payload shape:
```js
{
  type: 'DEALSHELL_MODULE_SELECTED',
  timestamp: number,
  module: {
    id: string,
    label: string,
    exportKey: string,
    route: string
  },
  deal: {
    id: string | number,
    clientName: string | null,
    projectName: string | null,
    opportunityNumber: string | null
  } | null
}
```

## Ownership Boundaries
- `App.jsx` owns shell state, rail open/close, and module selection exports.
- `OpportunityDrawer.jsx` is presentational and registry-driven.
- Feature modules should listen to the exported payload instead of reaching into shell internals.

## Adapter Architecture (No Tight Coupling)
DealShell is module-driven. File-format handling is adapter-driven.

- Module registry (`dealShell.js`) defines navigation identity only.
- Adapter bindings (`adapters/moduleAdapterBindings.js`) define which adapter a module uses.
- Adapter implementation files define document-specific IO behavior.

This prevents Excel logic from leaking into non-Excel modules and keeps implementations swappable.

## Current Binding Scope
Only confirmed binding is currently declared:

- `isbd` → `pptx` via `powerpoint-v1`
- Capabilities: `import`, `write`, `export`
- Fidelity target: `identical-formatting`

No other module is format-bound by default.

## PowerPoint Fidelity Guardrails
For `identical-formatting` exports, adapter implementation must preserve:

- Slide masters, layouts, themes, and relationship graph.
- Object ids/order, coordinates, typography, and style metadata.
- Embedded media assets and chart/table references.
- Unknown/unmapped XML parts by pass-through (do not normalize/rewrite globally).

Practical rule: mutate only explicitly targeted parts; copy untouched parts byte-preserving.

## Adapter Contract (PowerPoint v1)
`adapters/powerpointAdapter.js` defines:

- `importPowerPointDocument({ dealId, source })`
- `writePowerPointDocument({ dealId, documentId, operations })`
- `exportPowerPointDocument({ dealId, documentId, target })`

All adapters added later should expose the same three-stage lifecycle semantics.

## Conventions
- Keep `id`, `exportKey`, and `route` stable once released.
- Renaming UI text should change `label` only.
- Avoid embedding feature logic in shell files.
- Keep shell events backward-compatible.

## Future Extension (Optional)
- Map `route` to URL state for deep links.
- Add module-level access flags/permissions in registry.
- Add lazy module loaders keyed by `id`.
