# monday.com integration — design

*2026-10-27 · status: approved by the user. Connect mechanism revised the same day
after monday's docs ruled out self-registration (see Connecting).*

## First build (scope set by the user, 2026-10-27)

The first build is **sign in and read**. A teammate clicks **Connect monday**, signs
in, and s0L pulls the board into deals when it starts and on **Sync now**. Nothing
is written to monday.

These parts are Phase 2, built only when the user asks for them:

- adding rows and changing TCV and Status (goal 5 and the write path);
- the confirmation dialog, preview ids and the audit log;
- board-driven dropdowns and label colors (goal 2 and Option lists);
- a preview step in front of the sync.

## Intent

The tiger team tracks every deal on the monday.com board **Business Apps – Deal
Pipeline** (`ibm.monday.com/boards/9150394800`). The boss watches that board.
Rows are added by hand and columns are filled in when people have time.

s0L should **use** that board, not compete with it. Every deal on the board shows up
in s0L with all of its columns, in the board's own words. When a new deal starts in
s0L, it can be added to the board as a new row, but only after the user
confirms exactly what will be written.

## Goals

1. Every column on the board becomes a field on the s0L deal, including columns
   that are usually empty. Whether a field is shown in the UI is a separate,
   later decision. Hidden fields are still stored.
2. monday's option lists win. For every field the two share, s0L's dropdowns
   offer exactly the board's labels.
3. monday owns those fields (new field-index owner `monday`). s0L reads them. It
   writes them only by sending content to monday and re-reading the result,
   so s0L and the board can never disagree.
4. All five groups are in scope, and every row becomes a **full s0L deal**
   (decided by the user): SAP; Salesforce, Adobe, ServiceNow; Workday &
   SuccessFactors; Oracle; AMO and Supply Chain Transformation.
5. Writes to monday are **content only** and every write passes a confirmation
   gate. s0L may **add new rows** with their values. On **existing rows** it may
   change only **TCV ($M)** and **Status**. Every other column is read-only from
   s0L (decided by the user).
6. **Closed deals** (the Archives view) are those whose **Sales Stage** is Won,
   Lost or Submitted (decided by the user). The board's Sales Stage list currently
   has no "Submitted" label. Someone must add it on the board, since s0L never
   creates labels. Until then, Submitted simply never matches.

## Non-goals

- Creating, renaming or deleting monday columns, groups or labels. s0L never adds
  fields to monday. Writes always set `create_labels_if_missing: false`.
- Deleting, archiving or moving monday rows from s0L.
- Writes nobody confirmed, such as background or automatic pushes.
- monday "updates" (comments), subitems and monday Docs. These are not
  representable for now.
- The Salesforce and Outlook integrations. Those are separate builds.
- Deciding which fields are visible in the UI.

## Anti-goals

- A monday-owned value in s0L that differs from the board.
- Anything reaching monday that the user didn't see and confirm first.
- The user's monday token ending up in the repo, `deals_data.json`, logs, or the
  browser.

## Constraints

- **Sanctioned-integration exemption** (UI_ARCHITECTURE invariant 2): only the
  Flask backend calls monday (`https://api.monday.com/v2` and
  `https://auth.monday.com`), over HTTPS, on behalf of the signed-in user. The
  browser only ever visits monday's sign-in page.
- **Credentials** (the app's client ID and secret plus the user's access and
  refresh tokens) are written by the backend after sign-in. They live on the user's
  machine outside the repo, encrypted with Windows DPAPI (current user only). They
  are never returned by any API route, never logged, and never stored with deal
  data. Users never type or see them.
- **Field index is the single source of truth** (invariant 4). Every monday field
  is declared once in `shared/field_index.json`, with its monday column id and
  title, and `FIELD_REGISTRY.md` is regenerated.
- **One owner per field** (invariant 8). Only the monday sync route writes
  monday-owned fields. The existing owner-aware gate (`core/features/deals/writes.py`)
  returns 409 to anyone else, exactly as it does for `gssm`.
- **The user is a board member.** Members can create and edit rows but cannot
  create groups (verified from the board's permission data).
- Opportunity IDs are Salesforce 18-character IDs. They are case-sensitive and
  stored verbatim.

## What the board looks like (verified 2026-10-27)

Verified from the board's own data and an Excel export of the SAP group (62 rows).
Column ids are monday's stable ids; titles can be renamed, ids cannot.

| monday column (id) | monday type | s0L field | notes |
|---|---|---|---|
| Name, shown as **"Opportunity"** (`name`) | item name | `opportunity_number` | 55/62 are SF IDs, 7 are text; 2 IDs repeat across 8 rows |
| item id | — | `monday_item_id` *(new)* | **the link** between a row and a deal |
| group | — | `monday_group` *(new)* | |
| Client (`dropdown_mkqy4mkc`) | dropdown, 572 labels | `client_name` | |
| Opportunity Description (`text_mkqypdsv`) | text | `project_name` | |
| Status (`color_mkqypejx`) | status | `status` | used: Active, Assignment Needed |
| Lead SSC / SSC2 / SSC3 / SSC4 / TT Exec (`color_mkqyvgvy`, `color_mksmhqb`, `color_mksmnwx4`, `color_mksmc3ry`, `color_mkqy18z3`) | status (labels are names) | `lead_ssc`, `solution_consultant_2/3/4`, `tt_executive` | become selects of the board's names |
| TCV ($M) (`numeric_mkqyh0mz`) | number, millions | `estimated_value` | converted at the boundary: × 1,000,000 in, ÷ out |
| Implementation Type (`color_mkqyaeva`) | status | `implementation_type` | board labels replace s0L's list |
| Currency (`color_mkqyhjk0`) | status | `currency` | |
| Sector (`dropdown_mksmcb`) | dropdown | `sector` | flat board list replaces s0L's list |
| Industry (`dropdown_mksmkbj8`) | dropdown | `industry` | flat board list replaces s0L's sector-nested list |
| Date (`timerange_mksghf1v`) | timeline | `project_start_date`, `project_end_date` *(new)* | |
| Cls Qtr (`dropdown_mm25b4qb`) | dropdown | `close_quarter` *(new)* | |
| Sales Stage (`dropdown_mm25w58s`) | dropdown | `sales_stage` | ownership moves isbd → monday |
| Call / Upside (`dropdown_mm25d2jn`) | dropdown | `forecast_category` *(new)* | |
| Lead SL (`dropdown_mm25z11`) | dropdown | `lead_sl` *(new)* | kept apart from `service_line`, whose values differ |
| SWB Level (`dropdown_mm2513h7`) | dropdown | `swb_stage` | ownership moves isbd → monday |
| Deal Type (`text_mkxcyckc`) | **free text** on monday | `deal_type` | board meaning wins (B&P, Indicative ROM, BAFO); s0L's old list retired |
| Greenstar Estimate/DCA Link (`text_mm408f48`) | text | `greenstar_dca_link` *(new)* | `greenstar_url`/`dca_url` stay deal-owned |
| B&P, Asset, Associates, Total Band, Center Mix, Deal Staffing Full (`color_mm25*`) | status (N/A, G, A…) | `staffing_bp`, `staffing_asset`, `staffing_associates`, `staffing_total_band`, `staffing_center_mix`, `staffing_full` *(new)* | |
| Solutioning POV Full (`long_text_mm25w1z6`) | long text | `solutioning_pov` *(new)* | |
| People, People 1, Owner (`multiple_person_*`, `person`) | monday users | `monday_people`, `monday_people_1`, `monday_owner` *(new)* | read-only: writing needs monday user ids |
| monday Doc v2, Subitems | doc, subitems | — | not stored (non-goal) |

Any column the live API returns that isn't listed above is **flagged in the sync
report**. A developer then adds it to the field index the same way: monday owner, its
column id, and a `monday_` key. The field index is a committed contract and is never
edited at runtime.

## Approaches considered

- **A. Live link (picked by the user).** monday API plus personal token, collected
  at runtime, for reads and gated writes. The user's reason: the board's structure
  is already mapped, so live collection is the natural design.
- **B. Excel round-trip.** Dropped. It's manual and can never write to monday.
- **C. Excel first, then live.** Dropped. It existed only as a stopgap in case a
  member account can't get a token. Token availability is now a prerequisite.

## How it works

### Connecting: sign in with monday

**The UX requirement (user):** a teammate clicks **Connect monday**, signs in on
monday's own page, and the handshake completes. Nobody creates, copies or types a
secret, a token, or an ID.

**Self-registration is out (verified in monday's docs, 2026-10-27).** monday's
dynamic client registration (and its successor, Client ID Metadata Documents) is
for MCP clients connecting to `mcp.monday.com`. Every such connection waits for an
account admin to approve it as a "dynamic connector" (monday administration →
Connectors), and the user also needs MCP access. monday's own guidance for internal
tools: "Use an API token or your own OAuth app." So the spike is unnecessary and the
former Fallback A is the design:

- **s0L's own monday app.** The user created it in the Developer Center ("s0L", app
  12519083) and published it. The app requires monday's OAuth 2.1 flow (its sign-in
  page answered "code_challenge is required" to a request without PKCE):
  - Sign-in goes to `https://auth.monday.com/oauth2/authorize` with:
    - a `state` check and a PKCE challenge (`S256`);
    - `subdomain=ibm`, so the IBM account is preselected;
    - redirect `http://localhost:5121/api/monday/oauth/callback`;
    - scopes `me:read` and `boards:read` only. Phase 2 adds `boards:write`, which
      means signing in once more.
  - The backend exchanges the code and verifier at
    `https://auth.monday.com/oauth_ms/oauth/token` for an access token that expires
    and a refresh token. It refreshes silently before expiry, keeps only the newest
    refresh token, and revokes it at `/oauth_ms/oauth/revoke` on **Disconnect**.
- **The app's client ID and secret** are provisioned once per machine into the
  local encrypted store. The app owner types them into a hidden prompt
  (`npm run monday:provision`). A teammate's install imports a `monday-app.json`
  that the owner hands over privately, and the file is deleted after import.
  Users never type or see them and still just click Connect and sign in. The
  trade-off: every install holds the same secret, so a leak means regenerating it
  in the Developer Center and re-provisioning.
- **Installing the app.** monday's docs describe an install as making the app
  available to all users in the account (not a workspace or board). Whether the
  first sign-in needs a separate install, or IBM requires an admin's approval,
  shows on the first real Connect.
- **Last resort: personal token** pasted once in Settings. It breaks the "just log
  in" UX.
- **No browser automation**, ever. Sign-in happens in the user's normal browser.
- **Team use.** Each person runs s0L on their own machine, so
  `http://localhost:5121/…` always lands on the machine of whoever is signing in.
  - Everyone keeps the default backend port 5121.
  - Each person signs in as themselves, so their tokens are theirs alone and never
    leave their machine.
  - Hosting s0L centrally would move the redirect to the server and keep any
    secret only there. That's out of scope.

### Ownership and linking

- New owner **`monday`** in the field index, documented like `gssm`: *"Produced by
  the monday.com board and stored as the board has it. Written only by the monday
  sync."*
- Linking is by `monday_item_id`. A deal with an item id is **linked**: its
  monday-owned fields are read-only in s0L and show "From monday · synced 2 min ago".
- A deal **not yet linked**, created in s0L, can still edit those fields, the way
  timelines are "gssm (deal-editable until linked)" today. That lets someone fill in
  a new deal before it goes on the board.
- `monday_synced_at`, `monday_item_id` and `monday_group` are monday-owned system
  fields.
- **One deal per board row** (decided by the user), keyed by item id. Repeated
  opportunity IDs and plain-text values in the Opportunity column are kept verbatim.
  They are allowed on monday-linked deals and flagged in the sync report. The
  opportunity-number uniqueness check still applies to deals entered in s0L.
- A previously unlinked s0L deal links to a row only when its opportunity number
  appears on exactly one board row.
- **Required-field checks don't block the monday writer.** The board is allowed to
  be incomplete ("not every column gets filled").
- **First link: the board wins.** When an existing s0L deal links to a row, board
  values replace s0L's. Where the board's **TCV or Status** cell is empty and s0L
  has a value, the preview offers sending s0L's value to monday instead, through
  the write gate. No other column is ever offered. In the first build, the sync
  summary lists every filled s0L value a link replaced, so it can be put on the
  board by hand. The offer to send it comes with Phase 2.
- **Link scope is per owner.** "Editable until linked" checks the monday link for
  monday-owned fields, independent of the GSSM link. The GSSM cells on
  `client_name`, `project_name` and `opportunity_number` remain seeding targets only.
- **A row that disappears.** If a refresh finds a linked row deleted or archived,
  the deal is flagged "no longer on the board" and keeps its last values read-only.
  **Unlink** comes with Phase 2. A row moved to another group just updates
  `monday_group`.

### Option lists (Phase 2)

- On every sync, s0L stores the board's schema: columns, types, labels and label
  colors. It lives in a local cache next to `deals_data.json`, with the same
  gitignore treatment, because it contains client names.
- Dropdowns for shared fields read from that cache. `deal_constants.json` lists for
  implementation type, sector, industry and deal type are retired, or kept only as
  a fallback before the first sync.
- **Legacy values stay put.** An unlinked deal keeps any existing value that isn't
  on a board list, shown with a "not on the board's list" hint. Linking or sending it
  to monday requires picking a board label. `market` has no board column and stays
  deal-owned.
- Implementation-type tag colors come from the board's label colors.
- **Cross-module check:** `sector` has a GSSM cell (`Home!J16`). If the GSSM
  workbook validates that cell against its own list, s0L must not seed board
  labels into it.

### Read path, phase 1: live collection

- The backend reads the token and queries the board: columns, settings, groups,
  and `items_page` with cursor pagination.
- It maps values by **column id** through the field index.
- It runs when the app starts and on demand (**Sync now**).
- It applies directly and reports what changed:
  - new, updated and linked deals;
  - rows that left the board;
  - values a link replaced;
  - duplicate opportunity IDs;
  - columns the field index doesn't know yet.

  Phase 2 puts a preview step in front.
- Settings gets a monday area showing:
  - whether the user is signed in;
  - the last sync;
  - errors, in plain language;
  - the **Sync now** button.

  The token itself is never shown.

### Write path, phase 2: gated content writes

- **Add to monday** on an unlinked deal opens a confirmation dialog. It shows the
  target group (the user picks), every column and value that will be written, and
  a primary **Send to monday** button.
- On confirm the backend runs `create_item` with `create_labels_if_missing:
  false`, stores the returned item id, re-reads the row and saves monday's values.
- **Changing TCV or Status** on a linked deal becomes a pending change. These
  are the only two columns s0L may change on an existing row; every other
  monday-owned field stays read-only. The same dialog shows *row · column: old →
  new*. On confirm the backend runs `change_multiple_column_values`, limited to
  those two column ids, then re-reads. s0L stores nothing until monday accepts
  the change.
- The backend refuses any write that didn't come from a confirmed preview. It uses
  a short-lived preview id issued with the dialog and consumed on send.
- People columns are never written in v1.
- Every write is appended to a local audit log next to the deal data: who, when,
  row, columns, result.

### Where the code goes

- `shared/field_index.json`: the `monday` owner and the new fields, each with
  `"monday": {"column_id": …, "title": …}`. Then run `npm run registry`.
- `core/features/integrations/monday/` (new blueprint):
  - token reader
  - API client
  - mapping, driven by the field index
  - routes for status, schema, refresh preview and apply, and push preview and
    send
  - a `PUT /api/deals/:id/monday-sync` style writer that is the only route
    allowed to write monday-owned fields
- Frontend:
  - the API client goes through `shared/services/` (new `mondayService.js`)
  - the Connections UI goes in `features/settings/`
  - the confirmation dialog uses the shared `Modal`
  - field read-only states follow the existing GSSM pattern

### Who you are, TT Execs and new rows (decided by the user, 2026-10-28)

- **Pick your name once.** monday gives the signed-in email (`me { email }`) but IBM
  profiles carry IDs, not names, and `users:read` is not wanted. So after
  connecting, each person picks their board name from the name columns (Lead SSC,
  TT Exec, SSC2–SSC4, minus "TBD"). It is stored as `preferences.solutioner` with
  `preferences.solutioner_email`, and counts only while that email is signed in.
  The dashboard greets "Welcome, name · Not you?"; "Not you?" reopens the picker.
  A wrong pick unlocks no more than the person's own monday account allows.
- **TT Execs** are the names in the TT Exec column. Only they change the people
  columns from s0L, and only they may add a client the board doesn't have.
- **New rows** come from the New Deal form (`POST /api/monday/deals`): practice
  (group), opportunity number, client, description and the board's own lists.
  Anyone who isn't a TT Exec becomes the row's Lead SSC and assigns nobody else.
  The row is created first; the s0L deal is built from monday's answer.
- **Write gate, simplified:** clicking **Create on monday** (or confirming a name)
  is the confirmation. There are no preview ids; the routes stay JSON-only and
  host-checked. `create_labels_if_missing` is on only for a TT Exec's new client.

## Testing

- pytest with a **fake monday API**: synthetic rows that use the real column ids.
  No real board data is ever committed.
- A synthetic board fixture (schema plus rows) that mirrors the real column layout.
- Tests cover:
  - owner gate: a non-monday writer gets 409
  - linking and duplicate rules
  - TCV conversion
  - a push without a confirmed preview is refused
  - on existing rows, a write that touches any column other than TCV and Status
    is refused
  - Sales Stage Won/Lost/Submitted puts a deal in Archives
  - `create_labels_if_missing` is always false
  - the token is never in a response body or a log line

## Open questions (for the user)

None. Answered by the user:

- **All five groups become full s0L deals**, with the standard activities,
  approvers and timelines, same as SAP deals.
- Closed = Sales Stage Won/Lost/Submitted (goal 6).
- Existing rows may only have TCV and Status changed (goal 5).
- Connect UX = sign in and handshake only, no secrets handled by users (see
  Connecting). s0L's own Developer Center app delivers it.

**Prerequisites** (not design questions): the app's live version has the New
OAuth Flow toggle on, and the client ID and secret are provisioned on the machine
(see Connecting).

## Left to the builder

- Exact UI placement of "From monday" badges, the Connections area and the
  Add-to-monday entry point. Follow DESIGN.md.
- Cache file names and the audit-log format.
- How the token file is decrypted (DPAPI via ctypes, or Windows Credential
  Manager), within the token constraints above.
- Rate-limit handling and retry for the monday API.
