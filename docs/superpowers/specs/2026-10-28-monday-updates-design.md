# s0L updates through monday — design

*2026-10-28 · status: approved by the user, after a builder check. The user signed
off the download address and confirmed v2 is live (see Open, now settled).*

## Intent

s0L ships as a signed portable zip (`npm run package`, plan
`2026-10-28-packaging.md`): colleagues unzip it and double-click `s0L.exe`.
Until now a new version meant sending a new zip and having everyone extract it
and delete the old folder by hand. The user rejected a OneDrive folder for this
(most colleagues don't sync OneDrive) and doesn't want anyone extracting or
deleting anything.

monday is already the one outside service every colleague signs into from s0L.
So the user publishes each new version to one monday item, and every copy of s0L
that is connected to monday finds it, downloads it, checks it, and asks the
person to restart. A copy that is never connected is never updated, which the
user accepts.

## Decided by the user

- **Where releases live:** the item named "s0L" on board 9535661088 ("Files"),
  Files column `file_mksmcq4v`. s0L finds the item by name, never by id: the
  first item (13410016681) was deleted on 2026-10-28 and replaced by 13411298619,
  and a fixed id would have stranded every installed copy. 1.1.0 was published
  there on 2026-10-28 (asset 3350262503).
- **Updates arrive through the app**, and s0L restarts only when the person agrees.
- **No monday sign-in, no updates.** s0L prompts people to connect.
- **Whoever can see the Files board gets s0L** (and, inside the zip, the monday
  app secret, as with any shared link). Accepted.
- **`assets:read` is on s0L's monday app**, in its version 2 (live versions can't
  be edited). v2 is live.
- **Downloads from `files-monday-com.s3.amazonaws.com` are signed off** (2026-10-28):
  people reach the link only through their own monday sign-in.
- **Signing stays as it is:** Artifact Signing, account Aero, profile Aerex.
- **Dragging the zip into the item by hand is a valid way to publish** (the user
  did it for 1.0.0).

## Goals

1. A published version reaches every connected copy without anyone downloading,
   extracting or deleting anything.
2. Nothing restarts without the person's yes.
3. Only a package the user built and signed installs, and the check covers every
   file, not just the `.exe` and `.dll` files.
4. An update never edits or deletes anything in `%LOCALAPPDATA%\s0L` (deals,
   documents, logos, GSSM store, logs, monday sign-in). If a new version fails its
   first start, the deals file and GSSM store go back to exactly how they were
   before the update.
5. A failed update leaves the person on a working s0L.
6. Publishing is one command from VS Code: `npm run release`.

## Non-goals

- A GitHub pipeline. It can come later; it would need the Azure signing, the
  monday app secret and a monday token stored on GitHub.
- Forced updates, pilot groups, release notes, downgrades, partial (delta)
  updates.
- Updating the dev setup. Updates run only in the packaged app.
- Updating copies older than the first version with the updater. 1.0.0 has no
  updater; anyone running it installs the next version by hand once (download
  from the item, Extract All, run). Their data carries over.

## Anti-goals

- Installing anything not signed by the user.
- A restart the person didn't agree to.
- Losing or changing anyone's data or monday sign-in.
- The browser calling monday or the download address (backend only, invariant 2).
- The one-hour download link, or any token, in a log.

## Constraints (checked 2026-10-28)

- **Windows locks a running program's files.** Python, Node and the launcher run
  from the s0L folder (`runtime\python`, `runtime\node`, `app\`, `s0L.exe`;
  [s0L.cs](../../../packaging/launcher/s0L.cs) `Session`), so files can only be
  swapped while the servers are stopped, by something outside them: the launcher.
  Windows does let a running `.exe` be renamed out of the way.
- **The launcher treats any server exit as a crash** and quits with an error
  (`CheckServers`/`Fail`). A restart for an update must go through the launcher.
- **One launcher at a time** (mutex `Local\s0L-launcher`); a second start just
  opens the browser. The launcher refuses to start while 5121 or 5175 is taken.
  `--no-browser` already exists.
- **Data lives outside the s0L folder** in `%LOCALAPPDATA%\s0L\{data,gssm,logs,monday}`.
- **Versions:** `package.json` → `build.ps1` → compiled into `s0L.exe` as its
  informational version (`build.ps1`, LauncherVersion.cs). Flask doesn't know
  its version today. The zip is `release\s0L-<version>.zip` and its top folder is
  `s0L-<version>`.
- **Signing covers `*.exe`, `*.dll`, `*.pyd`, `*.node` only** (`build.ps1`). The
  Python, JavaScript, JSON and built frontend carry no signature. Artifact
  Signing issues short-lived certificates, so a check must trust the publisher
  name, never a certificate thumbprint.
- **monday, tested live with the user's sign-in (scopes `me:read boards:read`):**
  - the item and its Files column are readable with `boards:read`;
  - the column value's `files { ... on FileAssetValue { name asset { file_size
    public_url } } }` returns the download link with those same scopes;
  - the root `assets(ids:)` query is refused without `assets:read`;
  - `public_url` is a presigned link on `files-monday-com.s3.amazonaws.com`
    (Amazon S3, `X-Amz-*` parameters) that monday documents as valid for one hour.
- **Network rule (invariant 2):** sanctioned integrations call their own hosts,
  from the backend only; any other address needs the user's explicit sign-off.
  The S3 host is monday's file storage but not a monday.com address (see Open).
  `oauth.post_json` is the only code that calls monday and only POSTs JSON; a
  download is a new kind of call.
- **Upload API:** `https://api.monday.com/v2/file`, `add_file_to_column`, needs
  `boards:write`, up to 500 MB. monday's docs list uploadable types without
  `.zip`; the API upload is untested (the browser upload works).
- **The user's own sign-in on this PC (2026-10-27) has `me:read boards:read`
  only.** It predates `boards:write` in the code, so the release command (and the
  TT Exec pickers) need one reconnect on this PC.
- **On load the frontend checks monday** and shows a notice only to people who
  synced before ([App.jsx](../../../frontend/src/App.jsx), monday effect); someone who never
  connected sees only the grey dot.

## Approaches

| | Approach | Verdict |
| --- | --- | --- |
| A | **In-app check, launcher swap.** The backend finds, downloads and stages the update; the app asks; the existing launcher stops the servers, swaps the files and starts again. | **Picked.** Nothing new for colleagues to run; uses the launcher that already owns starting and stopping. |
| B | An update launcher that runs before the app, like a game launcher | Rejected: an extra step on every start, and monday sign-in would have to be rebuilt in C#. |
| C | The app replaces its own files | Impossible: Windows locks running files. |
| D | OneDrive folder + `latest.json` (proposed earlier) | Rejected by the user. |

Publishing: a VS Code command now, GitHub later if wanted (Non-goals).

## Design

### Publishing

- `npm run release` runs the signed build (never `-NoSign`), then uploads
  `release\s0L-<version>.zip` to the item's Files column through
  `api.monday.com/v2/file`, using this PC's s0L monday sign-in. It reads the item
  first and refuses a version that isn't newer than the newest one there.
- It picks the version itself: one patch above the newest zip on the item, or the
  `package.json` version if that is higher. It writes that version to
  `package.json` and never touches git. Working from two PCs can't collide.
  Giving a version explicitly overrides the pick.
- Dragging the zip into the Files column by hand does the same job; s0L doesn't
  care how the file got there. This also covers the API refusing `.zip`.
- Only files named `s0L-<major>.<minor>.<patch>.zip` count; anything else in the
  column (an `-unsigned` zip, notes) is ignored. The highest version wins. Old zips
  can stay; removing them is manual.
- From the first updater version on, the zip's top folder is plain `s0L`, so an
  updated folder's name never shows an old version.

### Finding an update (backend, packaged app only)

- The launcher passes its version to Flask (`S0L_VERSION`). No version (dev) means
  no update checks.
- When connected: at start, then every 4 hours, one GraphQL read of the item's
  Files column through the existing client (`client.graphql`). If the highest
  version is newer than the running one and isn't already staged or known bad,
  download it.
- Failures (offline, rate limit, refused) go to the log and wait for the next
  round. People never see those.
- One exception: if the person's monday account can't see the item (monday
  returns no item), s0L shows one quiet notice that their account can't see
  s0L's update board and they should ask the board owner for access. It shows
  once per session.
- Not connected: s0L shows a notice inviting the person to connect monday to get
  updates, including people who never connected. A sign-in that monday answers
  with "missing required scopes" gets the same notice, worded as reconnect.

### Downloading

- Ask monday for a fresh `public_url` right before downloading, then GET it over
  HTTPS. The host must be exactly `files-monday-com.s3.amazonaws.com`, with no
  redirects elsewhere. The size must equal the asset's `file_size` and stay under
  300 MB. Stream it into the s0L folder's own `.update\` folder, so the later swap
  is a rename on the same drive. Never log the link.
- The code lives in `core/features/integrations/monday/`, with host checks in the
  style of `client_logos/fetcher.py`.

### Checking it's the user's package

- **Build:** after every other file is signed, the build writes a manifest (each
  file's path and SHA-256) and compiles it into `s0L.exe`, then signs `s0L.exe`.
  One signature then covers the whole package.
- **Check:** extract into a staging folder (refuse any entry that would land
  outside it). Then the running launcher, which is already trusted, checks that:
  - the new `s0L.exe` has a valid signature from the same publisher as itself;
  - the new `s0L.exe` is the version being installed (an older genuine `s0L.exe`
    doesn't know the file check, so it must never stand in for a newer package);
  - every staged file matches the manifest (checked by running that new
    `s0L.exe`, which the signature check has just made trustworthy);
  - there are no extra files.

  On any failure, delete the staging folder, log it, and don't offer that version.
- Unsigned builds never offer or accept updates.

### Asking

- Once a checked update is staged, s0L shows a small prompt (the shared Modal or
  ConfirmDialog, styled per DESIGN.md): **s0L 1.1.0 is ready · Restart now · Later**.
- **Restart now:** the backend asks the launcher to restart.
- **Later:** it installs the next time s0L starts. The prompt doesn't come back
  that session.

### Swapping (launcher)

- On a restart request, or at start when an update is staged:
  1. Stop Flask and GSSM without the crash dialog and wait for their ports to free.
  2. Copy `data\deals_data.json` and `gssm\store.sqlite` aside, and move the
     current files aside as `previous`.
  3. Move the staged files in, renaming the running `s0L.exe` out of the way.
  4. Release the single-instance lock and start the new `s0L.exe` with
     `--no-browser`.
- The open browser tab reloads itself when the server answers again; no second
  tab.
- If the new version doesn't answer within 90 seconds (the new launcher's own
  60-second start wait, plus margin):
  - put `previous` and the two copied data files back;
  - start the old version;
  - remember the failed version as bad until a newer one appears.

  A new version may already have migrated the deals file at load
  (`state.py`), and nobody can have edited anything during a start that never
  answered, so restoring the copies loses nothing. After a successful start,
  delete the copies. Keep `previous` until the next successful update.
- If the s0L folder isn't writable, skip updates and log it.

### monday permissions

- Add `assets:read` to `config.SCOPES`, matching v2. Downloads use the Files
  column path, which works with `boards:read` today, so people who connected
  earlier keep getting updates without reconnecting. `assets:read` is the safety
  net if monday closes that path.
- v2 must be live before this ships. Requesting a scope the live version lacks
  makes monday refuse every sign-in (`invalid_scope`).

### Docs and tests

- UI_ARCHITECTURE.md: "The packaged app" (updates), invariant 2 (the download
  host), the monday row. copilot-instructions.md: the network convention.
  DESIGN.md: the update prompt.
- Python tests: picking the newest file, comparing versions, the host allowlist,
  the size cap, the folder-escape guard, the manifest check and the release
  command's refusals. The launcher's swap and rollback are checked by hand on a
  packaged build, since the launcher has no test harness.

## Calls made in this design (the user can overrule any)

- **Later** installs at the next start.
- Check at start, then every 4 hours.
- Roll back to `previous` when a new version fails to start, and skip that
  version afterwards.
- **No forced updates.** An outdated copy can only write names a people column
  already has, and new rows with the board's own options. monday refuses labels a
  column doesn't have ([client.py](../../../core/features/integrations/monday/client.py)
  `_SET_LABEL_MUTATION`), so an old copy can't damage the board.
- Publish from VS Code first; GitHub later.
- The release command picks the next version from what's on monday and never
  touches git.
- A failed first start restores the deals file and GSSM store with the old
  version.
- An account that can't see the update board gets one notice; other update
  failures stay in the log.
- The zip's top folder becomes plain `s0L`.
- The running launcher, not the backend, makes the trust decision.
- 300 MB download cap.

## Open (settled 2026-10-28)

1. **Download address:** signed off. s0L's backend downloads update zips from
   `files-monday-com.s3.amazonaws.com`, only through links monday's API hands out
   for this one item, over HTTPS, size-capped, checked before use.
2. **v2 is live**, so `assets:read` ships in `config.SCOPES`.

## Left to the builder

- How the backend asks the launcher to check a package and to restart (for
  example a `--verify` run of the installed `s0L.exe` that skips the
  single-instance lock, or a file handshake the launcher watches).
- How the manifest is embedded in `s0L.exe` and read back.
- Copy-versus-move details for `previous` (it lives in the s0L folder as
  `.previous\`, next to `.update\`).
- Retry timing, log wording, and where the prompt sits on screen within DESIGN.md.
