# Salesforce integration — design

*2026-10-28 · status: draft for the user's review; reviewed by a builder the same day.
Worked out with the user on 2026-10-28. Companion to
[the monday design](2026-10-27-monday-integration-design.md), whose pattern this follows.*

## Intent

- **Two records, both valid (user).** monday is how the Tiger Team tracks its deals.
  Salesforce (IBM Sales Cloud) is how IBM tracks every deal.
- **What s0L is (user).** The team's workspace for each deal: its files, the GSSM
  calculator, and the iSBD for reviews. It holds a handy copy of records that officially
  live elsewhere, often on a deal team member's OneDrive. Duplicates are fine.
- **Greenstar (user).** Estimates have to be built in Greenstar, a tool inside
  Salesforce, so the team works them out in GSSM and the iSBD first.
- **Why connect Salesforce:** to read IBM's own values for the deals the team tracks on
  monday, so that:
  1. the board stays accurate. Where it disagrees with Salesforce, the TT Execs see it
     and either fix the board or look into it;
  2. the iSBD, which gathers information from many sources, gets filled from Salesforce.
- **Finding out what's there.** What Salesforce lets s0L see, and which of it matters,
  is found out and written down first. In the user's words: "I don't expect Salesforce
  to be complicated, but who knows."

## Goals

1. **One-click connect.** Each person clicks the Salesforce icon and signs in to IBM Sales
   Cloud the way they already do, the same as monday today. Nobody sets anything up in
   Salesforce themselves.
2. **A written list of what's there.** s0L lists what the signed-in account can reach in
   Salesforce, including whether Greenstar is visible, and writes it to a file in the repo.
   The list has field names only, never deal values.
3. **Salesforce values for every board deal.** For each deal on the monday board, s0L
   looks up the opportunity by its number and stores Salesforce's values in their own
   fields.
4. **Differences in the TT Exec view.** Where the board and Salesforce disagree, including
   an opportunity number that doesn't resolve, the deal's TT Exec sees it. Approving puts
   Salesforce's value on the board; anything else stays listed for investigation.
5. **The iSBD fills from Salesforce** wherever Salesforce has the answer.
6. **Built now, switched later.** It's built and tested now against a free Salesforce
   developer org. It switches to IBM Sales Cloud once IBM installs s0L's app.

## Non-goals

- **Pulling deals from Salesforce at large (user).** Only the deals on the monday board are
  looked up, because this part of s0L's job is showing what the team is working on.
- **Writing anything to Salesforce or Greenstar (my call).** Nobody asked for it, reading
  is the non-invasive path, and a read-only app is an easier ask of IBM.
- **Finding team deals that never made it onto the board.**
- **Outlook (Microsoft Graph).** That's the next build, designed separately.
- **Importing a Salesforce report.** That was option 3, kept as the fallback if IBM says
  no (see Approaches). The report the user will share later is input for choosing fields,
  not an import feature.

## Anti-goals

- **Any per-person setup (user).** For example, each person storing logins under
  Salesforce's "Authentication Settings for External Systems". That page is for reaching
  other systems from inside Salesforce, and s0L doesn't use it.
- **Silent changes to the shared board.** Every board change is a TT Exec's confirmed
  approval.
- **The opportunity number pointing at a different opportunity (user).** It's the one key
  across s0L, monday and Salesforce, and it never changes. Fixing its form (see The check)
  keeps the same opportunity.
- **Leaks.**
  - Tokens never appear in the repo, `deals_data.json`, logs or responses.
  - Salesforce values stay out of the repo.
  - Nothing goes anywhere except calls to IBM's Salesforce, and the board writes TT Execs
    approve.
- **Browser automation or scraping.** Never.

## Constraints

- **Integration rules** (copilot-instructions, UI_ARCHITECTURE invariant 2):
  - only the Flask backend calls Salesforce, and only after the person signs in with their
    own account;
  - calls go over HTTPS to Salesforce's own hosts;
  - tokens stay on the machine, encrypted with Windows DPAPI.
- **The field index.**
  - One owner per field.
  - Every field that crosses a module is declared once in `shared/field_index.json`, then
    `npm run registry`.
  - The new owner `salesforce` has exactly one writer.
- **Layering.** Features never import each other, so the Salesforce code and the monday
  code don't import one another. Anything both need lives in `core/shared/` or the
  index.
- **Salesforce's rules (checked in Salesforce's own documentation, 2026-10-28):**
  - Since September 2025, most users can't use apps that aren't installed in their
    company's Salesforce
    ([Salesforce Admins blog](https://admin.salesforce.com/blog/2025/get-ready-for-changes-to-connected-app-usage-restrictions)).
    So IBM's Salesforce admins must install s0L's app. The permissions that get around
    this are meant for admins only.
  - Every API call needs the "API Enabled" permission on the person's profile
    ([REST API guide](https://developer.salesforce.com/docs/platform/api-rest/guide/intro-rest-compatible-editions.html)).
  - Salesforce's own Data Loader connects through an External Client App, set up like
    this ([Data Loader guide](https://developer.salesforce.com/docs/platform/data-loader-impl/guide/loader-eca-oauth-pkce.html)):
    - a `http://localhost` callback;
    - PKCE required;
    - "Require secret for Web Server Flow" off;
    - scopes `api` and `refresh_token, offline_access`.
    s0L needs the same setup. Since Spring '26, new connected apps can't be created by
    default, so it's an External Client App.
  - An app can be set so that admin-approved users are pre-authorized, through profiles
    or permission sets. Those people never see an approval screen.
- **Visibility.** Salesforce shows each person only what they can see. "Not returned"
  can mean a wrong number, or an opportunity this person can't see.
- **Size.** The board had 694 rows on 2026-10-28, so a check is a handful of batched
  queries.
- **The board's opportunity numbers aren't all clean.** Counted from the synced deals on
  2026-10-28:
  - 598 are 18-character IDs;
  - 49 are 15-character IDs;
  - 6 are one ID plus other text, such as a note or a prefix;
  - 2 hold two IDs;
  - 39 hold no ID at all.

## Approaches considered

1. **Direct connection, built now (picked by the user).** s0L's side is built and tested
   against a free Salesforce developer org while IBM works through the request.
   - Why: IBM's approvals are slow, and everything except the choice of fields can be
     built without IBM.
   - If IBM says no, approach 3 reuses everything except the sign-in.
2. **Direct connection, built after IBM says yes.** Dropped: all the work would wait on
   IBM.
3. **Salesforce report import, no app.** Kept only as the fallback. It's manual, only as
   current as the last export, and limited to what a report shows.

Dropped earlier: borrowing another tool's sign-in, such as the Salesforce CLI. It hits
the same rule about uninstalled apps and needs an install on every machine.

## How it works

### Connecting

- **s0L's Salesforce app** is an External Client App with the Data Loader settings above:
  - callback `http://localhost:5121/api/salesforce/oauth/callback`;
  - PKCE;
  - no secret for the web server flow or for refreshes;
  - scopes `api` and `refresh_token offline_access`;
  - admin-approved users pre-authorized.

  IBM's admins create it in IBM Sales Cloud. During the test phase the user creates one in
  the test org.
- **Sign-in** opens in the default browser (`webbrowser.open`, like monday) at the org's
  own login address (its My Domain), so IBM's usual sign-in applies. The callback checks
  the single-use state and the PKCE verifier, then exchanges the code. No client secret
  exists anywhere.
- **Tokens.** The access token, refresh token, instance URL and the signed-in person's
  name and email are stored DPAPI-encrypted in `%LOCALAPPDATA%\s0L\salesforce`.
  - Calls go only to the provisioned org's host.
  - Salesforce doesn't say when an access token expires, so s0L refreshes when Salesforce
    answers "session expired" and retries once.
  - If a refresh returns a new refresh token, the newest one is kept.
  - **Disconnect** revokes the token and forgets it.
- **Per-machine setup.** Each machine needs the org's address and the app's consumer key.
  Neither is a secret.
  - `npm run salesforce:provision` stores them.
  - The packaged app ships them as `salesforce-app.json` (`S0L_SALESFORCE_APP`), the way
    `monday-app.json` ships.
  - Only an app provisioned for IBM Sales Cloud ever ships. A test-org app never goes into
    the zip.
- **Header icon.** The Salesforce logo with a status dot, next to monday's, works like
  `MondayConnect.jsx`:
  - muted: not connected, and a click signs in;
  - accent: signing in or checking;
  - `--status-success`: connected, and a click runs the check.

  The tooltip names who is signed in and when the last check ran. The logo is a copy of
  `assets/practice-logos/salesforce.svg` placed in `assets/integration-logos/`.
- **Plain messages for the known failures:**
  - s0L isn't set up for Salesforce on this computer;
  - IBM hasn't installed the app, or hasn't given you access to it;
  - your Salesforce profile doesn't have API access;
  - the sign-in was cancelled or took too long.
- **Settings → Salesforce** shows the status, who is signed in, the last check's summary
  and **Disconnect**, like `MondayTab.jsx`.

### Writing down what's there (the list)

- **The command.** `npm run salesforce:inventory` is a dev command the user runs after
  signing in. It writes `docs/salesforce/inventory.md`, which covers:
  - every object the account can query (API name and label);
  - for Opportunity, Account, and any object whose name or label mentions Greenstar or
    estimates, every field the account can see: API name, label, type, and the values of
    any pick list.

  There are never any record values. The user decides whether to commit the file.
- **The user's report.** The exported report the user will share later ("what little they
  give us") ties the labels people see to the API names.
- **Choosing.** From the list, the user and the builder decide which fields to store,
  which to compare with board columns, and which fill the iSBD. Each choice becomes a
  field index entry. `scripts/build-field-registry.mjs` gains a "Salesforce field" column.
- **Before IBM installs the app,** the test org uses standard Opportunity fields: `Name`,
  `StageName`, `CloseDate`, `Amount`, `ForecastCategoryName`, `Account.Name` and
  `Owner.Name`.

### The field index

- **The new owner** `salesforce`: "Produced by IBM's Salesforce (IBM Sales Cloud) and
  stored as Salesforce has it. Stored only by
  `core/features/integrations/salesforce/writer.py`, by the Salesforce check of the deals
  on the monday board."
- **A `salesforce` block on a field** names its source: `{ "object": "Opportunity",
  "field": "StageName" }`. Related fields (`Account.Name`) are allowed.
  `core/shared/field_index.py` gains `salesforce_bindings()`, with a mirror in
  `fieldIndex.js` only if the frontend needs it.
- **Two kinds of Salesforce field:**
  1. **Compare fields.** Salesforce's value for something the board also has, such as
     its stage, close date or amount. These get new keys with an `sf_` prefix
     (`sf_stage`), are never editable, and carry a `compare` entry naming the board field
     and how to compare: `{ "with": "sales_stage", "as": "label" }`.
     - The kinds of comparison (exact text, pick-list label, number at the board's
       precision, date to the board's quarter) are built for the pairs the user picks.
     - Noisy pairs aren't compared. For example, board client names are short and
       Salesforce account names are legal names.
  2. **Fill fields (my call).** Things only Salesforce has, which s0L or the iSBD needs.
     Likely candidates, to confirm from the list:
     - Opportunity Owner, Account Classification and Opportunity Type, owned by `deal`
       today;
     - StormCast and Expected Contract Signature Date, owned by `isbd` today.

     These existing fields change owner to `salesforce` and keep their iSBD labels. If a
     field's storage path changes, `core/shared/migrations.py` moves the stored values.

     **Blanks (my call).** Salesforce fills a field only when it has a value:
     - A blank in Salesforce never overwrites anything, and the field stays editable in
       Home and the iSBD.
     - Once Salesforce supplies a value, it wins, and the field locks. A value someone
       typed is replaced and listed in the check's summary, like monday's "replaced".

     So for `salesforce`, "editable until linked" means editable until Salesforce
     supplies that field. The builder picks how the deal remembers which fields
     Salesforce supplied.
- **Link fields** (owner `salesforce`):
  - `salesforce_id`: the 18-character ID Salesforce returns;
  - `salesforce_checked_at`;
  - `salesforce_lookup`: `found`, `not_returned`, `not_an_id` or `two_ids`.
- **Linked** means the deal has a `salesforce_id`. `is_linked` handles `salesforce` in
  `field_index.py` and `isLinked` does in `fieldIndex.js`.

### The check

- **When it runs.** After every monday sync (at app start and on a monday icon click), and
  when the Salesforce icon is clicked (my call: it needs the board's opportunity numbers).
  It never overlaps a monday sync, because both rewrite `deals_data.json`.
- **Which deals.** Those linked to a board row and still on the board: they have a
  `monday_item_id` and no `monday_missing_since`.
- **What it does.** It looks the board's opportunity numbers up in batches, with read-only
  queries only. The Salesforce client has no code that writes. Values are stored through
  `writer.py`.
- **Reading the cell (my call).** Every case below stays visible to the TT Execs until
  someone fixes the board (the user's rule: if it's wrong in monday, someone did it
  wrong).
  - **Exactly one ID** (15 or 18 characters, starting with `006`): looked up.
  - **One ID plus other text** (a note, a prefix): the ID is read out and looked up. The
    cell is flagged as holding more than the ID, for investigation only. It's never
    rewritten, so the note survives.
  - **Two IDs:** flagged, not looked up, not linked. s0L can't know which opportunity
    the row stands for.
  - **No ID:** flagged, nothing is queried.
- **What it finds, per deal:**
  - **found:** the values are stored and the link is set;
  - **not an ID** or **two IDs:** as above;
  - **not returned:** a wrong number, or this person can't see it in Salesforce. The
    message says both;
  - **full-ID problem:** Salesforce found the opportunity, but the cell is exactly one
    ID in its 15-character form (49 rows today) or in the wrong letter case. Salesforce
    always answers with the 18-character ID.
- **The link follows the number.** It follows the board's opportunity number on every
  check. A deal that stops resolving keeps its last Salesforce values, read-only, and is
  flagged.
- **The summary** gives counts, like monday's sync summary.

### Differences in the TT Exec view

- **Where.** A "Salesforce check" panel in `ExecDashboard.jsx`, plus a count in its stat
  line.
- **Rows.** One row per difference: the deal (client and description), the deal's TT
  Exec, the field, the board's value and Salesforce's value. Rows are grouped by the deal's
  TT Exec, with the signed-in exec's own deals first.
- **Who acts.** Everyone sees the list. Only TT Execs act (`mondayMe.is_exec`), and any TT
  Exec may act (my call, the same as the people pickers).
- **Update board.**
  - It asks first (`ConfirmDialog`): "Change Sales Stage on the board from X to Y?"
  - Then monday's backend changes the cell through the existing
    `change_multiple_column_values` and stores what the board returns through monday's
    `writer.py`.
  - It's offered for compare pairs and for full-ID problems (my call: that fix keeps the
    same opportunity, and it's only offered when the cell holds nothing but the ID).
  - **The board keeps its own words (my call).**
    - Salesforce values are translated into the board's own labels through a small table
      on each compare pair in the index, filled in when the pairs are chosen.
    - s0L never adds Salesforce's wording to the board.
    - A value with no translation is shown for investigation only, with no Update
      button.
  - The columns involved become `writable` in the index.
- **Open in Salesforce.** Opens the opportunity in the browser. It's a hand-off link, and
  s0L makes no request.
- **Investigating** needs no button. The row stays until the values agree.
- **Computed on request, never stored.** Differences are worked out when asked for
  (`GET /api/salesforce/differences`), because derived values are never stored.
- **One converter in `core/shared/`.** The code that compares values and converts a
  Salesforce value into the board's form lives in `core/shared/`. Both the Salesforce
  route and monday's update route use it, so neither module imports the other.

### Filling the iSBD

- **Nothing new in the iSBD.** It already binds cells to fields through their iSBD
  labels, and locks a cell once the deal is linked to that field's owner
  (`SlideRenderer.jsx`, `isLocked` built on `isEditable`).
- **So:** once fill fields are owned by `salesforce`, and `isEditable` (with the
  backend's `deal_editable`) knows the Salesforce rule, the iSBD fills and locks those
  cells the same way it does monday values. The rule: editable until Salesforce supplies
  the field.
- **Import and export** don't change.
- **The deal views** show Salesforce-owned values read-only with "From Salesforce ·
  checked …", like "From monday · synced …" in `DealDetailsPanel.jsx`.

### Where the code goes

- **Backend:** `core/features/integrations/salesforce/`, with one file per job:
  - `config.py`: API version, callback, scopes;
  - `oauth.py`;
  - `credentials.py`;
  - `client.py`: read-only;
  - `mapping.py`: index-driven;
  - `check.py`;
  - `writer.py`: the only writer of `salesforce` fields;
  - `inventory.py`;
  - `provision.py`;
  - `routes.py`: local hosts only, JSON-only POSTs, like monday's.

  It's registered in `core/app_factory.py`.
- **Shared:**
  - the DPAPI file store moves out of `monday/credentials.py` into `core/shared/` (its
    second user), and monday's behaviour doesn't change;
  - the compare and convert module;
  - the `field_index.py` additions.
- **monday:**
  - an exec-only route that applies an approved difference, generalising `assign`;
  - the columns it may change are marked `writable`.
- **Frontend:**
  - `shell/SalesforceConnect.jsx`, plus a badge helper like `mondayBadge.js`;
  - `shared/services/salesforceService.js`;
  - `dealStore`: check state and `runSalesforceCheck`, run after `runMondaySync`;
  - `features/settings/components/SalesforceTab.jsx`;
  - the `ExecDashboard.jsx` panel;
  - the `DealDetailsPanel.jsx` note;
  - `fieldIndex.js` `isLinked`.
- **Packaging:** `packaging/build.ps1` and the launcher set `S0L_SALESFORCE_APP`.
  Building without a Salesforce app still works, and the icon then says Salesforce isn't
  set up.
- **Docs:**
  - UI_ARCHITECTURE.md: the module, the owner table and the data flow;
  - DESIGN.md: the header icon pair and the panel;
  - the copilot-instructions backend tree;
  - FIELD_REGISTRY.md, regenerated.

### The test phase (done once, by the user)

1. Sign up for a free Salesforce Developer Edition org.
2. Create an External Client App with the settings in the IBM request below.
3. Run `npm run salesforce:provision` with the test org's address and the app's consumer
   key.
4. Add a few test opportunities.

**What the test org proves:** sign-in, refresh, disconnect, the list, lookups by ID and
the failure messages. The test org's IDs aren't on the real board, so matching against
the board is proven with recorded samples in the tests.

### The request to IBM's Salesforce admins (ready to send)

> **Request: install a read-only Salesforce app for s0L (Tiger Team)**
>
> s0L is a desktop tool the Tiger Team runs on our own laptops. It looks up the
> opportunities our team tracks, by Opportunity ID, so our team tracker matches
> Salesforce. It only reads. It contains no code that writes to Salesforce.
>
> 1. Please create an External Client App in IBM Sales Cloud with OAuth enabled:
>    - Callback URL: `http://localhost:5121/api/salesforce/oauth/callback`
>    - Require PKCE: on
>    - Require secret for Web Server Flow: off. Require secret for Refresh Token Flow:
>      off. It's a desktop app and stores no secret.
>    - OAuth scopes: Manage user data via APIs (`api`); Perform requests at any time
>      (`refresh_token`, `offline_access`)
>    - Permitted users: Admin approved users are pre-authorized
>    - Refresh token policy: your standard. "Valid until revoked" means people sign in
>      once.
> 2. Please create a permission set that grants access to that app and the API Enabled
>    permission, and assign it to: *[Tiger Team names]*.
> 3. Please send us the app's Consumer Key and our org's My Domain address.
>
> This is the same setup Salesforce documents for Data Loader. Each person signs in with
> their own account and sees only what they can already see. Tokens are encrypted on their
> laptop (Windows DPAPI) and never leave it. Opportunity values are stored only on that
> laptop, except when a TT Exec approves a correction to our team's monday.com board (IBM's
> monday account).

## Testing

- **pytest** (no real network; fake the one HTTP function, like `fake_monday` in
  `tests/conftest.py`):
  - sign-in: state, PKCE, the exchange without a secret, refreshing after "session
    expired", revoking, and each failure mapped to its message;
  - the DPAPI move: monday's tests still pass unchanged;
  - mapping driven by the index;
  - the check: batching, the 15- and 18-character forms, letter case, an ID plus other
    text, two IDs, not an ID, not returned, the link following the number, blanks never
    overwriting, and values stored only through `writer.py`;
  - each comparison kind, including a value with no translation;
  - the board-update route: TT Execs only, JSON only, local hosts only, refusing a value
    with no translation and a cell holding more than the ID, and storing what the board
    returns;
  - the token never appears in a response or a log line;
  - the list never contains a record value.
- **Fixtures:** `tests/fixtures/salesforce_*.json`, recorded from the test org.
- **Vitest:** the badge states and the panel's grouping.
- **The registry test** keeps FIELD_REGISTRY.md current.

## Open items for the user

- **Who to send the request to.** Who administers IBM Sales Cloud, and the channel for
  this kind of request.
- **The Tiger Team names** for the permission set.
- **The org's address,** when it's time to switch from the test org.
- **The exported report,** whenever it's convenient.
- **When choosing pairs:**
  - Is TCV ($M) in US dollars, or in the deal's own currency (the board has a Currency
    column)? Salesforce's Amount is in the opportunity's currency. Until this is
    answered, amounts aren't compared.
  - The board's own word for each Salesforce value: the translation tables.

## Left to the builder

- **Sign-in details:**
  - the API version: pin one and check it at sign-in;
  - batch size and query shape: SOQL `IN` lists or the sObject Collections API;
  - how the signed-in person's name and email are read with these scopes.
- **The exact failure codes** behind the plain messages, confirmed against the test org.
- **Compare kinds:** how each comparison treats blanks and rounding, within the rule that
  noisy pairs aren't compared.
- **Names:** the shared DPAPI store's module name, and how the build tells an IBM app from
  a test-org app.
