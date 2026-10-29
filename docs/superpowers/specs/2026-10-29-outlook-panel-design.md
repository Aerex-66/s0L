# Outlook panel, Quick contacts and SRR/PRR review forms — design

*2026-10-29. From `.github/prompts/outlook-panel.prompt.md`. The four open questions went
unanswered (the user was away and asked for autonomous calls), so every answer below
marked **(my call)** is for the user to check.*

## Intent

The solutioner's people and review paperwork live in one place they reach from the
Outlook icon: which Outlook s0L uses, the people they work with (Deal Team, SALs,
SLDLs, SRR and PRR reviewers), and each sector's SRR and PRR review form. Each deal's
Overview shows the forms that apply to it. PAL goes away, and SAL sign-offs stop
acting as a gate.

## What the data said (this PC, 694 deals)

- **Sector** matches the user's examples ("Comms", "Distribution"): Com-Ind 276,
  Public 140, Canada 92, Distribution 81, FSS 31, Industrial 26, blank 47, and one
  "Distribution, Canada". Com-Ind holds Energy, Manufacturing, Tech and Telco.
  Lead SL holds only BA (25) and AO (1); Industry says "Comms" on one deal;
  `service_line` is empty everywhere.
- Every deal has 12 PAL rows (8,328) and 12 SAL rows; **none** has a status, date,
  approver or note.
- The directory (`master_contacts`) holds exactly the 12 SAL entries, one per
  service area, none with an email. Settings → SAL Defaults edits those same entries.
- Nothing enforces a gate on SALs. They act like one because Review & Release's
  "All approved" needs every row Completed, and the Approvals badge and Summary
  counts include every row.

## Decisions

1. **Forms follow the deal's Sector** (my call, from the data above). A deal's sectors
   are `sector` split on commas, so "Distribution, Canada" shows both.
2. **The template lists the board's sectors, worked out live** (my call): every sector
   on a deal, plus any sector that already has something recorded. A new sector on the
   board appears as an empty slot by itself. Nothing is hardcoded.
3. **PAL rows on existing deals stay in the record** (no yes to delete). New deals stop
   getting them; the Approvals tab hides empty PAL rows (a PAL row someone filled in
   still shows); no count includes them. People with the PAL role move into the Deal
   Team as "PAL (functional SME)".
4. **SAL Defaults folds into the SAL tab** (my call): it was a second view of the same
   12 entries. The SAL tab is one row per service area, and its people are who new
   deals get as SAL approvers. Settings keeps My view, monday and Salesforce.
5. **SAL sign-offs are optional.** New deals still get one SAL row per service area,
   filled from the SAL tab, but SAL (and PAL) rows don't count towards "All approved",
   the Approvals badge, the Approvals strip or the Summary's Approvals panel. The
   service-area group reads "Service area leads · optional".

## The people model: one entry per person, several roles

`master_contacts` entries become people:

```json
{ "id": "3", "name": "Dan C Berard", "email": "", "title": "", "department": "",
  "company": "", "phone": "", "slack": "", "notes": "",
  "roles": [ { "kind": "sal", "area": "PTP/Ariba" }, { "kind": "srr", "sector": "Distribution" } ] }
```

| Kind | Tab | Detail |
| --- | --- | --- |
| `deal_team` | Deal Team | `title` (Lead client partner, Business development manager, …, PAL (functional SME), Other) |
| `sal` | SAL | `area`: a service area from `deal_structure.py` (required) |
| `sldl` | SLDL | `area`: free text, optional |
| `srr` / `prr` | SRR / PRR | `sector` (required) |

- **Adding never duplicates** a person: a POST whose email matches someone (or, when
  either has no email, whose name matches) adds the roles to that person and fills
  their blanks. Adding always goes through `PersonLookup`.
- **Migration** (load time, idempotent, with the usual one-time backup): each old entry
  becomes a person with one role (SAL → `sal`, PAL → Deal Team "PAL (functional SME)",
  SLDL → `sldl`, anything else → Deal Team with that title). Names written as
  "A / B" without an email become two people (my call: two SALs sharing an area).
  Same-name entries merge (Dilip Radhakrishnan: Group Reporting + SAC). `role`, `area`
  and `approver_key` go away.
- New deals: each SAL row's approver is the area's people, joined " / " (as the old
  defaults read), and those people are added as deal contacts, as before.

## Review forms

`deals_data.json` → `review_forms`, global reference data next to `master_contacts`:

```json
{ "srr": { "Distribution": { "how": "form", "url": "https://…", "note": "" } }, "prr": {} }
```

`how`: `""` not known yet · `form` online form · `word` Word document · `invite`
calendar invite · `none` no form. `url` is http(s) only (checked on save and again by
`webLink` on open). An empty entry is removed. s0L never fetches the link; the
person's browser opens it.

## API (settings blueprint; logic in `core/shared/directory.py`)

| Route | Does |
| --- | --- |
| `GET /api/quick-contacts` | `{ people, sal_areas, sectors, review_forms }`: everything the panel and a deal's Overview need |
| `GET /api/contacts` | people (Approvals and Contacts tabs) |
| `POST /api/contacts` | add a person with roles, or add the roles to the same person |
| `PUT /api/contacts/<id>` | change fields; `roles` replaces the list |
| `DELETE /api/contacts/<id>` | remove the person |
| `PUT /api/review-forms` | `{ kind, sector, how, url, note }`; returns `review_forms` |

`/api/default-approvers` is removed (its only caller was SAL Defaults).

## Interface

- **The Outlook icon opens the Outlook panel** (`shell/OutlookPanel.jsx`, the shared
  Modal, Settings-sized). On top: "Which Outlook do you use?", the existing two choice
  blocks side by side. Choosing no longer closes anything. Below: **Quick contacts**,
  `WorkspaceTabs` Deal Team · SAL · SLDL · SRR · PRR (`shell/quickContacts/`).
  - Deal Team / SLDL: one row per person (initials, name, email in accent, their
    roles as tonal chips with a remove ×); an add row: `PersonLookup` + title or
    area + Add.
  - SAL: one row per service area; its SALs as chips; an add field per area.
  - SRR / PRR: one block per sector: how (select), link, note, reviewers (chips +
    add). Saved as each field is left.
  - Tokens only, square, no outlines; chips are tonal blocks on `--control-fill`;
    rows highlight (they hold inputs), never lift.
- **Overview → Summary** gets a **Review forms** panel: per sector of the deal, SRR and
  PRR with how it works, an **Open** link (web links only, through `webLink`) or "No
  link yet", the reviewers and the note. No sector: says so plainly. A **Set up**
  button opens the panel on the SRR tab.
- Home's Approvals and Contacts read the directory through the new
  `shared/services/directoryService.js` (they imported `features/settings` before,
  which broke the no-cross-feature rule).

## Not doing

- No deletion of deal data (PAL rows stay stored until the user says yes).
- No fetching of intranet links; no new outside host.
- No change to the field index (no deal field changes).
- No "schedule the review" automation for invite-style reviews (Contacts → Schedule
  meeting already does it).

## Open for the user

- Sector as the key, and Com-Ind as one slot (if Comms and Industrial have separate
  forms, the slot needs splitting by industry).
- Removing the stored PAL rows from existing deals (all empty here).
- Splitting "A / B" SAL names into two people.

## Build order

1. Backend: `core/shared/directory.py` (model, migration, sectors, review-form
   cleaning), migration hook, routes, `deal_structure.py` / `defaults.py` / new-deal
   SAL routing; pytest.
2. Frontend shared: `directoryService.js`, `utils/directory.js`, `utils/approvals.js`
   (+ Vitest); stage readiness, badge, Summary counts.
3. Shell: `OutlookPanel.jsx` + `quickContacts/`, store rename, Settings trimmed.
4. Home: Approvals (PAL hidden, SAL optional), Contacts, Summary review forms.
5. Docs: UI_ARCHITECTURE.md, DESIGN.md, `.github/copilot-instructions.md`.
6. Verify: `npm test`, frontend build, the panel and a deal in the browser.
