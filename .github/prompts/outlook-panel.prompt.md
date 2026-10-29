---
name: "outlook-panel"
description: "Kick off the Outlook panel build: the Outlook icon opens its own panel (app or browser choice, then Quick contacts tabbed Deal Team / SAL / SLDL / SRR / PRR), plus SRR/PRR review-form slots in each deal's Overview. Use when starting that session."
argument-hint: "Anything to add, or the SRR/PRR form links if you have them"
agent: "agent"
---

# Outlook panel, Quick contacts and SRR/PRR forms: kickoff

You're picking up a feature the user designed with the previous session (2026-10-29). They find big asks hard to put into words, so play things back as you go: what they said, kept separate from what you're assuming, then one question.

## What the user wants

1. **The Outlook icon in the header opens its own panel**, a full panel like Settings, instead of today's small app-or-browser picker.
   - At the top: the two choices, **Outlook in the browser** or **the Outlook app on this computer** (they call it "native").
2. **Settings → People Directory moves into that panel, renamed "Quick contacts"**, in five tabs:
   - **Deal Team**: the sales team the solutioner works with (lead client partner, business development manager, and so on). One person can hold several roles: keep one entry per person with several roles, never the same name added three times. Solutioning is usually a solo job (a second SSC only on big deals, by contract value clip level), so this tab is mostly sales people. PALs go here too: they're functional SMEs borrowed when available.
   - **SAL**: service area leads. Helpful, **not a hard gate**: an extra step, and a SAL can delegate the review.
   - **SLDL**: service line delivery leads.
   - **SRR** and **PRR**: per service line, who reviews, plus that service line's review form link (see 3).
   - Adding someone always uses the type-a-name Outlook lookup that already exists (below).
3. **SRR/PRR review forms in each deal's Overview.**
   - Each service line has its own SRR form and its own PRR form; some have none. Examples the user gave: Comms industry has its own, Distribution has its own.
   - Most are becoming online forms on IBM's intranet; some still want a Word document, or want the team to send a calendar invite. Record which way each one works.
   - The user can't open those intranet links from this PC. They'll collect them later (about four minutes by hand), so build the **template now: empty slots per service line**, filled in later. A missing link says so plainly; it's never an error.
   - In a deal's Overview, show the forms for that deal's service line(s), each with an Open button (web links only, through `webLink`).
4. **PAL is dropped** as a role and a tab, and PAL approvals aren't needed. **SAL approvals become optional**, not something that blocks the deal's stages.

## How it works today (verify before relying on any of it)

- **Outlook icon**: `frontend/src/shell/OutlookConnect.jsx` (icon + dot), `shell/OutlookPicker.jsx` (the current app-or-browser picker), `shell/outlookBadge.js`, `shared/outlookStore.js` (`openPicker`), `shared/services/outlookService.js`. Backend: `core/features/integrations/outlook/routes.py` (`/api/outlook/status`, `/api/outlook/mode`).
- **People lookup as you type** (built 2026-10-29): `shared/ui/PersonLookup.jsx` over `GET /api/outlook/people` and `POST /api/outlook/people/pick` (`core/features/integrations/outlook/people.py`). It shows Outlook's own autocomplete list first, then the directory's unique match and nearest name, each with email, title and department. In browser mode it's a plain text field. It's already in Settings → Directory and a deal's Contacts → Add contact.
- **The directory** is `master_contacts` in `deals_data.json`, served by `/api/contacts` (GET/POST/PUT/DELETE) in `core/features/settings/settings.py`. Its roles today: SAL, PAL, SLDL, Deal Manager, Program Manager, Compliance Officer, Other. `/api/default-approvers` (Settings → **SAL Defaults**) writes through to it.
- **New deals** get one SAL and one PAL approval per service area from `deal_structure.py` (RTR, OTC, PTP/Ariba, FTP&L, Data, Analytics, IBP…), filled from the directory in `core/features/deals/services.py`. The Overview (the `home` module, shown as "Overview") lists them on the Approvals tab. Its "Formal Review Gates" block is "sequential SRR / PRR approval gates". `features/home/stageReadiness.js` currently counts every approval, SALs included, towards "Review & Release".
- **Settings tabs**: My view, Directory, SAL Defaults, monday, Salesforce (`features/settings/components/Settings.jsx`).
- Deal fields that could pick a service line: `industry` and `lead_sl` (both from the monday board) and `service_line` (entered in s0L). See `FIELD_REGISTRY.md`.

## Ask the user first (these change what gets built)

1. Which deal field decides the service line for the SRR/PRR forms ("Comms industry" and "Distribution" sound like industries): `industry`, `lead_sl`, or a new pick on the deal?
2. The list of service lines for the template; or start from the board's values and let them add more.
3. Existing deals already carry PAL approval rows: remove them, or just stop adding them to new deals? Deal data is real; never delete without a yes.
4. Does SAL Defaults stay in Settings or move into the panel's SAL tab? (Assumed in the playback: stays.)

## Rules

- Load the MCP servers (Superpowers, context-mode, Pylance). Brainstorm, write the design to `docs/superpowers/specs/<date>-outlook-panel-design.md`, get it approved, then plan.
- **Module independence**: the panel is shell UI (`shell/`); data goes through `shared/` services, never feature-to-feature imports. Directory and review-form data are global reference data in `deals_data.json` next to `master_contacts`, written by the settings blueprint (or a new one). They are not deal fields, so the field index isn't touched unless a deal field changes.
- **Look**: tokens only, square, seamless (DESIGN.md). Tabs ride `WorkspaceTabs`. The user dislikes icons in boxes: bare icons with a right/bottom drop shadow.
- **Local only**: the Outlook app is reached through `core/shared/outlook_app.py` (COM). No Graph, no registration, no new outside host. Intranet form links are opened by the person's own browser; s0L never fetches them.
- Run all three dev servers with the `dev server` task. The Flask dev server doesn't reload code changes, so restart the backend task after changing routes. Tests: `npm test`. Build: `npm --prefix frontend run build`, run from PowerShell.
- When it's built, update UI_ARCHITECTURE.md (Outlook integration, settings), DESIGN.md (the panel, Quick contacts), `.github/copilot-instructions.md`, and FIELD_REGISTRY via `npm run registry` only if the field index changed.
