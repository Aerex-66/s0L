# Deal folders: design (in progress)

*2026-10-29 · status: brainstorming. The points under "Decided" and "Reading the folder"
were agreed in chat; the open questions at the end still need the user. Next: test
restoring a broken workbook on a copy, settle the open questions, lay out the approaches,
finish this doc for approval (superpowers brainstorming), then write the plan.*

## Intent

Solutioners keep each deal's working files (GSSM workbook, iSBD deck, GenAI calculator,
PRR memo and deck…) in folders they organize by hand. s0L should give that a standard
shape, in a folder each person chooses. In the user's words: "the process doesn't always
start with s0L. s0L's job is to either initiate it or seamlessly read the documents."

AppData stays the app's own store. The deal folders hold solution artifacts only.

## What stays where

- **`%LOCALAPPDATA%\s0L`** (packaged app) or the repo root (dev) is unchanged. It holds:
  - `data\deals_data.json`, the deal record;
  - client logos, the calendar cache and uploaded documents (`data\documents`);
  - the GSSM store and logs;
  - the encrypted monday and Salesforce sign-ins.

  Its `backup\` folder is copies an earlier chat made, not s0L's.
- **The deal folders** hold only artifacts: exports from s0L, and documents people put
  there themselves.

## Decided (by the user, 2026-10-29)

- **Location:** each person picks the folder in Settings, on the local drive or a OneDrive
  path. The default is `Documents\s0L\Deals`.
- **Who:** only the Lead SSC (`lead_ssc`), for their own deals. TT Execs get folders only
  when they are the Lead SSC.
- **Layout:**

  ```text
  Documents\s0L\Deals\
    <Client>\
      <Deal name>\
        Tiger Team\
          GSSM\  ISBD\  GenAI\  Greenstar\  Metrics\  PRR\
  ```

- **Tiger Team** marks the solutioners' own space. It matters most when the folder sits
  inside the deal team's shared folder, where solutioners need to control their part.
- **Module folders:** s0L's modules plus PRR.
  - Greenstar is a folder only for now; the user hasn't decided what its file looks like.
  - GenAI and Metrics are folders only for now; no export is defined yet.
  - WSA is a deal-team thing, not s0L's (see Open).
- **When folders are made:** when s0L reads the board and finds a deal where you are the
  Lead SSC. s0L never renames or deletes them; a reassigned deal keeps its folder.
- **Starting state:** new folders start empty. Files appear only on export.
- **Exports:** every export is a new version and never overwrites. The name is
  `<Module> - <Client> - v<N>.<ext>`, for example `GSSM - Contoso - v4.xlsm`, where N is
  one more than the highest version already in that folder.
- **No templates.** `C:\Users\Abide\Downloads\Deal Template` is the user's manual copy,
  there only to show the expected shape. monday's "Templates" group is out of scope.
- **Not in this piece:** linking one deal to a shared OneDrive folder. That's today's
  Documents-module "Cloud Sync Folder", `cloud_sync_path`, and it needs a later rework
  with OneDrive. For now there is one root folder for all of a person's deals.

## Naming (agreed)

1. **Client folder** = the deal's **Client** on the monday board, as written, so all of a
   client's deals sit together.
2. **Deal folder** = the deal's **Opportunity Description** on the board (`project_name`),
   which is the opportunity's name in Salesforce. It is always there, even for a client's
   only deal, so no folder moves when a second deal for that client arrives.
3. **Safe for Windows:**
   - replace `\ / : * ? " < > |`;
   - trim trailing dots and spaces;
   - refuse `..` and reserved names (CON, PRN, AUX, NUL, COM1…, LPT1…);
   - shorten anything that would push a path past 260 characters.
4. **Fixed once made.** A name is set when the folder is created. If the board later
   changes the client or the description, s0L keeps using the folder it made for that
   deal, so it has to remember each deal's folder.

## Reading the folder (agreed 2026-10-29)

In the user's words, the process doesn't always start with s0L: s0L either starts the
files (exports) or reads what's already there. The folder is the source of truth.

- **Always the latest.** Whenever s0L works on a module's file, it checks that module's
  folder and works on the latest file there, never an older one. If v5 was saved from
  Excel, or v5 was edited in place without being renamed, s0L picks up v5 by itself.
- **Which file is latest:** the highest `vN`. If another file in the folder was saved
  after it (an older version edited in place, or a file without a version number), s0L
  asks which one to use.
- **When s0L checks:** when a module opens, when the person comes back to the s0L window,
  and right before an export. No background watcher.
- **Conflicts:** if s0L has changes of its own that aren't exported yet and the folder's
  latest file also changed, s0L asks which one to work on. The prompt says what each
  choice costs: "Use v5 (drops your s0L changes since v4)" or "Keep s0L's copy (your next
  export, v6, won't include v5's changes)".
- **Exports always move one version forward.**
- **Only the Tiger Team folder counts.** Copies the deal team keeps elsewhere don't matter.
- **iSBD works the same way** and doesn't need an imported deck. Decks differ (some have
  more slides); the slides s0L codes (executive summary, deal profile…) are the baseline.
  - An iSBD export starts from the folder's latest deck when there is one, so extra slides
    survive; otherwise from a clean baseline deck that ships with s0L. The real reference
    deck can't ship (client data). Candidate: the user's `ISBD - Temp - v1.pptx`, if it
    holds no client data (to check).
  - Deck values for fields owned by monday, GSSM or Salesforce don't come in: the deal
    record stays their source, and the next export writes the deal's values back. s0L
    shows those differences instead of dropping them silently.
- **Broken files are restored as well as s0L can** (the user wants this explored):
  - never touch the broken file;
  - start from the last good version s0L read;
  - carry over the broken file's changes that still read cleanly;
  - leave out the damage (a deleted sheet, formulas that now show `#REF!`);
  - save the result as the next version, reusing the export code (it already writes cell
    changes onto a workbook);
  - a file that won't open at all could go through Excel's own Open and Repair.

  To be tested on a **copy** of the user's template GSSM before the design depends on it.

## Today's code this touches (checked 2026-10-29)

- **Exports are browser downloads into Downloads:**
  - iSBD deck: `frontend/src/shared/services/dealService.js` (about lines 31–45), calling
    `POST /api/documents/isbd/export` in `core/features/documents/documents.py`.
  - GSSM workbook: `frontend/src/features/gssm/GssmModule.jsx` (about lines 363–385),
    through `gssm-server/routes/spreadsheet.js`, which writes to an OS temp `xlsm-*`
    folder before the download.
  - Not module artifacts: Admin's record JSON, the deals CSV/JSON (`ExportModal`) and the
    calendar `.ics`.
  - GenAI, Greenstar and Metrics have no export today.
- **How files get in today: s0L works on its own copies.**
  - GSSM: upload only (`POST /api/engine/import`, `gssm-server/routes/engine.js`). The
    workbook is copied to `ENGINE_IMPORT_ROOT\import-<hash>\source\`, s0L's edits are kept
    per workbook id in SQLite, and an export is that copy with the edits applied
    (`gssm-server/routes/spreadsheet.js` + `xlsm_update_zip.py`).
  - iSBD: `POST /api/documents/powerpoint/read` takes an upload, or a path inside the data
    root only (`resolve_local_source_path`, `pptx_io.py`). The deck is copied to
    `data\documents`; `apply_isbd_import` (`records.py`) puts the deck's iSBD-only values
    over the deal's and fills deal fields only where they're blank.
  - iSBD export (`export_isbd`, `documents.py`) uses the latest imported deck as its
    template and refuses without one.
- **Who "I" am:**
  - `preferences.solutioner` is the board name picked once and bound to the monday email
    (`core/features/integrations/monday/identity.py`).
  - The people fields are `lead_ssc`, `solution_consultant_2`, `solution_consultant_3`,
    `solution_consultant_4` and `tt_executive` (`frontend/src/shared/utils/solutioners.js`).
- **Per-deal OneDrive link today:**
  - `cloud_sync_path` and `CloudSyncSection` in
    `frontend/src/features/documents/DocumentsModule.jsx`;
  - the routes `/api/documents/cloud-sync/discover`, `/browse` and
    `/api/documents/<id>/send-to-cloud`;
  - `core/features/documents/onedrive.py`, which finds OneDrive folders in the registry.
- **Data root and preferences:**
  - the data root is set in `core/shared/state.py` (`S0L_DATA_DIR`);
  - preferences live in `deals_data.json` through `core/features/settings/settings.py`
    (`_PREFERENCE_KEYS`).

## Constraints

- **The browser can't write into a chosen folder.** The Flask backend writes every file,
  and the frontend asks it to.
- **Path safety.** Names come from monday, so a client or description must never reach
  outside the chosen folder. Resolve every path and check it stays under the root.
- **New per-deal fields**, such as the remembered folder, go in `shared/field_index.json`
  first, then `npm run registry`. `FIELD_REGISTRY.md` is generated, never edited by hand.
- **No new network.** OneDrive here is just a folder on disk that OneDrive syncs.
- **Docs change with the code:** UI_ARCHITECTURE.md, DESIGN.md for any new UI, and
  copilot-instructions.md.
- **Picking the folder** could be a native folder dialog opened by the backend, or a
  path field. Still to decide.
- **The user's Deal Template files are originals.** Test only on copies. Its
  `GSSM - Temp - v1.xlsm` is the newest GSSM; the user plans to use it to update s0L's
  GSSM later.
- **Don't copy the old browse route.** `/api/documents/cloud-sync/browse` lists any folder
  on the computer with no root check. The new folder code checks every path against its
  root; tightening that route belongs in this piece (proposal).

## Open questions (for the user)

1. **Where the Tiger Team folder lives on team deals.** The iSBD usually sits in a Tiger
   Team folder inside the deal team's shared folder, outside the one root folder agreed
   above. How should s0L find that folder for a deal? (Was "folders s0L didn't make"; ties
   into the OneDrive rework and today's `cloud_sync_path`.)
2. **WSA:** should s0L create it at all? The user's sample keeps it inside Tiger Team, but
   the user called WSA a deal-team thing.
3. **Exports:** does an export still download in the browser too, or only save to the
   folder (with an "Open folder" link)? Does the iSBD module's PRR document export into the
   PRR folder?
4. **Duplicate names:** if two of your deals have the same client and description, add the
   opportunity number to the second?
5. **Changing the root folder later:** move existing deal folders, or use the new root only
   for new ones?

## Elsewhere in flight

- s0L updates itself through monday (design `2026-10-28-monday-updates-design.md`);
  1.1.0 is published. The user is testing 1.1.1 on a work computer: the first
  `npm run release` run end to end, and the first real auto-update.
- Another chat may be working in this same folder at the same time.
