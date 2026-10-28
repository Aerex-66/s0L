# s0L updates through monday — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every packaged s0L that is connected to monday finds a newer signed release
on the s0L item, downloads and checks it, asks the person, and swaps itself in
through the launcher. `npm run release` publishes a release.

**Architecture:**

1. **Find and stage.** In the packaged app only, Flask checks the release item's
   Files column 30 s after start and then every 4 h. It downloads the newest
   `s0L-x.y.z.zip` into `<s0L folder>\.update\` and unpacks it to `staging\`.
2. **Check.** Flask has the installed `s0L.exe --verify` check the unpacked files. A
   package that passes gets a `.update\ready` file.
3. **Ask.** The React shell asks the person. Restart now writes `.update\restart`.
4. **Swap.** The launcher's watchdog sees `.update\restart` and:
   - stops the servers;
   - copies the deals file and GSSM store aside;
   - renames the new files in, with the old ones moving to `.previous\`;
   - starts the new `s0L.exe`;
   - rolls everything back if the new version doesn't answer within 90 s.
5. **Fingerprint.** The build compiles a SHA-256 list of every file into `s0L.exe`
   before signing it.

**Tech Stack:** Python 3 standard library (urllib, zipfile, subprocess, threading) +
Flask; C# 5 on the .NET Framework 4 compiler (WinVerifyTrust through P/Invoke);
PowerShell 5.1 build; React 19 + Vitest.

**Spec:** [docs/superpowers/specs/2026-10-28-monday-updates-design.md](../specs/2026-10-28-monday-updates-design.md)

## Global Constraints

- **Release item:** board `9535661088`, item `13410016681`, Files column
  `file_mksmcq4v`. Only files named exactly `s0L-MAJOR.MINOR.PATCH.zip` count.
- **Download rules:**
  - host exactly `files-monday-com.s3.amazonaws.com`, HTTPS only, no redirects;
  - at most 314572800 bytes (300 MiB), and equal to the asset's `file_size`;
  - unpacked package at most 1073741824 bytes (1 GiB).
- **Never log** a `public_url`, token or secret.
- **Timing:** the first check runs 30 s after start, then every 4 h. A new version
  must answer within 90 s.
- **Updates run only when the launcher sets `S0L_VERSION` and `S0L_LAUNCHER`.**
  `npm run dev` never checks. Read both on every call, never at import.
- **Folder contract between Flask and the launcher.** All of these sit in the s0L
  folder (`<root>`, the folder that holds `s0L.exe`), and both sides use exactly
  these names:
  - `.update\download.zip`
  - `.update\staging\`
  - `.update\ready` (text: the version)
  - `.update\restart` (empty)
  - `.update\bad-versions` (one version per line)
  - `.update\snapshot\`
  - `.update\failed\`
  - `.previous\`
- **Verify exit codes** (the contract between Task 2 and Task 4):

  | Code | Meaning |
  | --- | --- |
  | 0 | OK |
  | 1 | the new `s0L.exe` has no valid signature |
  | 2 | a different publisher |
  | 3 | files don't match the manifest |
  | 4 | this launcher is unsigned |

- **Launcher code is C# 5** (the .NET Framework 4 `csc.exe`): no `$""`, `?.`,
  `nameof`, or expression-bodied members. No PowerShell runs in the packaged app.
- **No new Python or npm dependencies.**
- **Data is never deleted.** Update code never deletes anything in
  `%LOCALAPPDATA%\s0L`. It only copies aside, and restores on a failed start,
  `data\deals_data.json` and `gssm\store.sqlite` (plus its `-wal` and `-shm` files).
- **UI** uses the shared `Modal` and `btn btn-primary` / `btn btn-secondary`; no new
  colors, sizes or CSS (DESIGN.md).
- **Do not commit.** The working tree carries the user's uncommitted work.
- **Python style** follows the surrounding files: no type annotations, module
  docstring, small functions. The types in the Interfaces blocks are documentation.

## Review Focus

1. A file in the s0L folder is held open during the swap (antivirus, an Explorer
   preview). The launcher must undo every rename and start the old version, never
   leaving a half-swapped folder. Pinned by Task 5, manual check 5.
2. Versions compare as numbers: `s0L-1.10.0.zip` beats `s0L-1.9.0.zip`. Pinned in
   Task 1 (`test_latest_release_picks_highest_version_numerically`) and Task 2
   (`test_numeric_compare`).
3. s0L quits mid-download or mid-unpack. There must be no `ready` file, and the next
   check starts clean. Pinned in Task 2 (`test_interrupted_staging_is_cleared`).
4. Two browser tabs both press Restart now. The second request must be harmless.
   Pinned in Task 3 (`test_restart_writes_marker_and_is_idempotent`).
5. s0L was unzipped somewhere read-only. It makes no update attempts and shows no
   notice. Pinned in Task 2 (`test_unwritable_folder`).

---

### Task 1: Read the release item and download a release

**Files:**

- Modify: `core/features/integrations/monday/config.py`
- Create: `core/features/integrations/monday/releases.py`
- Modify: `core/features/integrations/monday/oauth.py:1-5`. Docstring: `post_json`
  makes monday's JSON calls; `releases.py` makes the file upload and the update
  download.
- Test: `tests/test_monday_releases.py`; modify `tests/test_monday_signin.py:91`
- Docs:
  - `UI_ARCHITECTURE.md`: invariant 2 (update downloads from
    `files-monday-com.s3.amazonaws.com`, signed off 2026-10-28) and the monday row
    (`releases.py`);
  - `.github/copilot-instructions.md`: the network convention and the backend tree.

**Interfaces:**

- Produces (config):
  - `RELEASE_ITEM_ID = '13410016681'`
  - `RELEASE_COLUMN_ID = 'file_mksmcq4v'`
  - `RELEASE_BOARD_URL = 'https://ibm.monday.com/boards/9535661088'`
  - `FILE_API_URL = 'https://api.monday.com/v2/file'`
  - `SCOPES = 'me:read boards:read boards:write assets:read'`
- Produces (`releases.py`):
  - `DOWNLOAD_HOSTS = frozenset({'files-monday-com.s3.amazonaws.com'})`
  - `MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024`
  - `class ReleaseError(Exception)` with `.kind`: `'no_access'`, `'bad_download'` or
    `'upload_failed'`
  - `parse_version(text) -> tuple[int, int, int] | None`. Accepts `'1.2.3'` only.
  - `release_version(file_name) -> tuple[int, int, int] | None`. Accepts
    `'s0L-1.2.3.zip'` only.
  - `latest_release() -> dict | None` returns `{'version', 'name', 'size', 'url'}`.
    - Returns `None` when the column holds no release file.
    - Raises `ReleaseError('no_access')` when monday returns no item.
    - Lets `client.MondayError` through.
  - `download(url, size, dest, *, opener=None) -> None`

- [ ] **Step 1: Write the failing tests** in `tests/test_monday_releases.py`. Use the
  `vault` and `fake_monday` fixtures and a session saved as in `test_monday_assign._session`.

```python
def test_release_version_reads_only_release_zips():
    assert releases.release_version('s0L-1.10.0.zip') == (1, 10, 0)
    for name in ('s0L-1.0.0-unsigned.zip', 's0L-1.0.zip', 'notes.txt', 'S0L-1.0.0.ZIP', 's0L-1.0.0.zip.exe'):
        assert releases.release_version(name) is None

def test_latest_release_picks_highest_version_numerically(vault, fake_monday):
    # files s0L-1.9.0.zip, s0L-1.10.0.zip, s0L-2.0.0-unsigned.zip
    assert releases.latest_release()['version'] == (1, 10, 0)   # with that file's size and url

def test_latest_release_queries_the_release_item_column(vault, fake_monday):
    # the GraphQL variables carry '13410016681' and 'file_mksmcq4v'

def test_latest_release_none_without_release_files(vault, fake_monday): ...
def test_latest_release_no_access_when_item_hidden(vault, fake_monday):   # {'items': []} -> kind 'no_access'
def test_download_refuses_other_hosts(tmp_path):        # https://evil.example.com/x.zip -> 'bad_download', opener never called
def test_download_refuses_http(tmp_path): ...
def test_download_refuses_redirects(tmp_path):          # response.geturl() on another host -> 'bad_download'
def test_download_refuses_size_mismatch_and_oversize(tmp_path):   # short body -> error, no file left; size > MAX -> error before any request
def test_download_writes_file(tmp_path): ...
def test_download_never_logs_the_link(tmp_path, caplog):          # the X-Amz-Signature value is absent from caplog.text
```

The fake opener has `.open(request, timeout=...)` and returns a context-manager
response with `.read(n)`, `.geturl()` and `.status`.

- [ ] **Step 2: Run them** with `python -m pytest -q tests/test_monday_releases.py`.
  Expected: they fail because `releases` doesn't exist yet.
- [ ] **Step 3: Implement the config constants and `releases.py`.**
  - `latest_release` makes one `client.graphql` call:
    `items(ids: [$item]) { column_values(ids: [$column]) { ... on FileValue { files { ... on FileAssetValue { name asset { file_size public_url } } } } } }`.
  - `download` builds a urllib opener whose redirect handler refuses. It streams
    1 MiB chunks to `dest + '.part'`, then renames the file into place, and deletes
    the partial file on any failure.
- [ ] **Step 4: Update the scope assertion** in
  `test_monday_signin.py::test_connect_redirects_to_monday` to
  `['me:read boards:read boards:write assets:read']`.
- [ ] **Step 5: Run the tests** with
  `python -m pytest -q tests/test_monday_releases.py tests/test_monday_signin.py`.
  Expected: PASS.
- [ ] **Step 6: Update the docs** listed under Files.

### Task 2: Unpack, check and stage an update (Flask)

**Files:**

- Create: `core/shell/updates.py`
- Test: `tests/test_updates.py`

**Interfaces:**

- Consumes:
  - `releases.latest_release`, `releases.download`, `releases.ReleaseError`,
    `releases.parse_version`;
  - `client.MondayError` (`.kind`, message).
- Produces:
  - `current_version() -> str` (`''` when unset)
  - `launcher_path() -> str` (`''` unless `S0L_LAUNCHER` is a file)
  - `enabled() -> bool`
  - `root_dir() -> str`, `update_dir() -> str` (`<root>\.update`)
  - `class UpdateError(Exception)`
  - `extract_package(zip_path, dest) -> None`
  - `verify_with_launcher(staging) -> int`. Runs `[launcher, '--verify', staging]`
    with a 180 s timeout; `-1` on timeout or `OSError`.
  - `bad_versions() -> set[str]`, `mark_bad(version) -> None`
  - `ready_version() -> str`, `last_result() -> str`
  - `check_once(*, latest=releases.latest_release, download=releases.download, verify=verify_with_launcher) -> str`

**How `check_once` decides.** The result codes are `'disabled'`, `'unwritable'`,
`'not_connected'`, `'reconnect'`, `'no_access'`, `'up_to_date'`, `'known_bad'`,
`'already_ready'`, `'ready'`, `'rejected'`, `'unavailable'` and `'failed'`.

1. Return `'disabled'` when updates are off.
2. Probe that `.update` is writable (create it, then write and delete a file).
   Otherwise return `'unwritable'` and log one warning.
3. With no `ready` file, delete any leftover `staging` or `download.zip`.
4. Call `latest()` and compare its version numerically with the current one.
   - Same or older: `'up_to_date'`.
   - Listed in `bad-versions`: `'known_bad'`.
   - Already in `ready`: `'already_ready'`.
5. Download to `download.zip`, unpack to `staging`, then delete `download.zip`.
6. Run `verify` on `staging`:
   - `0`: write `ready` with the version and return `'ready'`;
   - `4`: delete `staging` and return `'unavailable'` (an unsigned install; not
     marked bad);
   - anything else: `mark_bad`, delete `staging`, return `'rejected'`.
7. Map failures to result codes:
   - `MondayError` kind `not_connected`: `'not_connected'`;
   - a `MondayError` whose message contains `missing required scopes`: `'reconnect'`;
   - `ReleaseError('no_access')`: `'no_access'`;
   - anything else: `'failed'`, plus a warning that contains no URL.

**`extract_package` rules.**

- Every entry sits under one shared top folder; strip it.
- Refuse absolute paths, drive letters, `..` parts and anything that resolves
  outside `dest`.
- Refuse more than 1 GiB unpacked.
- On any refusal, delete `dest` and raise `UpdateError`.

- [ ] **Step 1: Write the failing tests.** The `packaged(tmp_path, monkeypatch)`
  fixture:
  - creates `<tmp>/s0L/s0L.exe` as an empty file;
  - sets `S0L_VERSION='1.0.0'` and `S0L_LAUNCHER` to that file;
  - returns the root.

  `latest`, `download` and `verify` are faked through keyword arguments; the fake
  download writes a real zip.

```python
def test_disabled_without_launcher_env(monkeypatch): assert updates.check_once() == 'disabled'
def test_extract_strips_the_top_folder(tmp_path):    # s0L/s0L.exe, s0L/app/x.py -> dest/s0L.exe, dest/app/x.py
def test_extract_refuses_escape(tmp_path):           # 's0L/../evil.txt', '/abs.txt', 'C:/x.txt' -> UpdateError, dest absent
def test_extract_refuses_two_top_folders(tmp_path): ...
def test_extract_refuses_oversize(tmp_path, monkeypatch):   # MAX_UNPACKED_BYTES patched to 10
def test_newer_release_is_staged_and_ready(packaged):       # -> 'ready', ready_version() == '1.1.0', download.zip gone
def test_same_or_older_version_is_up_to_date(packaged): ...
def test_numeric_compare(packaged):                         # current 1.9.0, latest 1.10.0 -> 'ready'
def test_rejected_package_marked_bad_and_removed(packaged): # verify 3 -> 'rejected'; next check -> 'known_bad', no download call
def test_unsigned_install_is_unavailable_not_bad(packaged): # verify 4 -> 'unavailable', bad_versions() == set()
def test_already_ready_skips_download(packaged): ...
def test_interrupted_staging_is_cleared(packaged):          # staging without ready -> removed, download called again
def test_unwritable_folder(packaged, monkeypatch):          # probe raises PermissionError -> 'unwritable', latest never called
def test_monday_failures_map_to_results(packaged):          # not_connected / 'missing required scopes' / no_access
def test_failures_never_log_links(packaged, caplog): ...
```

- [ ] **Step 2: Run them** with `python -m pytest -q tests/test_updates.py`.
  Expected: they fail because the module is missing.
- [ ] **Step 3: Implement `core/shell/updates.py`** as specified above. Logging uses
  `logging.getLogger(__name__)`.
- [ ] **Step 4: Run them again.** Expected: PASS.

### Task 3: Update routes and the background check

**Files:**

- Modify: `core/shell/updates.py`, `core/app_factory.py` (register the blueprint),
  `deal_tracker.py` (`start_checks()` in `__main__` when `enabled()`, next to the
  Outlook sync)
- Test: `tests/test_updates.py`
- Docs: `.github/copilot-instructions.md` backend tree (`core/shell/updates.py`)

**Interfaces:**

- Consumes: Task 2; `oauth.status()`; `core.shared.security.is_local_host`.
- Produces:
  - `status() -> dict` returns `{'enabled', 'version', 'ready', 'notice'}`.
    - `notice` is `'no_access'` or `'reconnect'` (from the last result), else `None`.
    - It calls `wake()` when the last result was `'not_connected'` and
      `oauth.status()['connected']` is now true.
  - `request_restart() -> bool`. Writes `restart` when `ready` exists, and returns
    True again when it already exists.
  - `wake() -> None`, `start_checks() -> threading.Thread`. The thread is a daemon
    named `update-checks`. It waits 30 s, then loops every 4 h, and `wake()` cuts
    the wait short.
  - `updates_blueprint` routes:

    | Route | Answer |
    | --- | --- |
    | `GET /api/updates/status` | JSON `status()` |
    | `GET /api/updates/version` | `text/plain` `current_version()` (the launcher reads it) |
    | `POST /api/updates/restart` | 202 `{"restarting": true}`; 409 `{"error": "No update is ready."}`; 415 without a JSON body; 403 on a non-local `Host` |

- [ ] **Step 1: Write the failing tests** with `tmp_store` and `packaged`:

```python
def test_status_when_disabled(tmp_store):   # == {'enabled': False, 'version': '', 'ready': '', 'notice': None}
def test_status_reports_ready_and_notice(tmp_store, packaged):   # ready '1.1.0', last result no_access -> notice 'no_access'
def test_version_is_plain_text(tmp_store, packaged):             # body b'1.0.0', mimetype 'text/plain'
def test_restart_needs_json(tmp_store, packaged):                # 415
def test_restart_needs_a_ready_update(tmp_store, packaged):      # 409, no marker
def test_restart_writes_marker_and_is_idempotent(tmp_store, packaged):   # 202 twice, marker exists
def test_restart_refuses_foreign_host(tmp_store, packaged):      # headers={'Host': 'evil.example.com'} -> 403
```

- [ ] **Step 2: Run them.** Expected: FAIL (404).
- [ ] **Step 3: Implement** the routes, `wake`, `start_checks` and the registration.
- [ ] **Step 4: Run the whole Python suite** with `python -m pytest -q`.
  Expected: PASS.

### Task 4: Fingerprint the package and let the launcher check it

**Files:**

- Create: `packaging/launcher/Updates.cs`
- Modify:
  - `packaging/launcher/s0L.cs` (`Main`: handle `--verify <dir>` and
    `--check-files` before the mutex, and return their codes);
  - `packaging/build.ps1`.

**Interfaces:**

- Produces, in static class `S0L.Updates`:
  - `int CheckFiles(string dir)`
    - Returns 0 when every line of the embedded resource `s0L.manifest` matches,
      and no file other than `dir\s0L.exe` exists that isn't listed.
    - Returns 3 otherwise, including when the resource is missing.
  - `int Verify(string dir)` returns the codes in Global Constraints.
    1. Get this launcher's publisher: `X509Certificate.CreateFromSignedFile(Application.ExecutablePath).Subject`.
       If it throws: 4.
    2. Run `WinVerifyTrust` on `dir\s0L.exe` with:
       - `WINTRUST_ACTION_GENERIC_VERIFY_V2` `{00AAC56B-CD44-11d0-8CC2-00C04FC295EE}`
       - `WTD_UI_NONE` (2)
       - `WTD_REVOKE_NONE` (0)
       - `WTD_CHOICE_FILE` (1)
       - state action 0
       - `WTD_CACHE_ONLY_URL_RETRIEVAL` (0x1000), so the check never goes online

       Anything but 0: 1.
    3. If the new file's signer Subject differs (ordinal comparison): 2.
    4. Run `dir\s0L.exe --check-files` with a 120 s limit. Not 0: 3.
- **Manifest:** UTF-8 without a BOM. One line per file:
  `<sha256 lowercase hex> <path relative to the package root, backslashes>`. Lines
  are sorted ordinal, and every file in the package is listed except `s0L.exe`.
- **New `build.ps1` order:**
  1. Copy the app, Python and Node (unchanged).
  2. Run the private-data check.
  3. Sign every unsigned PE file in the stage. `s0L.exe` doesn't exist yet.
  4. Write `$cache\s0L.manifest`.
  5. Compile `s0L.exe` with `launcher\Updates.cs` and `/resource:<manifest>,s0L.manifest`.
  6. Sign `s0L.exe`.
  7. Zip.

  Also:
  - The stage becomes `release\staging\s0L`, so the zip's top folder is `s0L`.
  - Signing becomes a function called twice.
  - `-NoSign` still embeds the manifest.

- [ ] **Step 1: Implement** `Updates.cs`, the two `Main` modes and the build order.
- [ ] **Step 2: Build unsigned** with `npm run package:unsigned`. Expected: it
  succeeds, and the zip's first entry starts with `s0L/`.
- [ ] **Step 3: Check the files.** Run
  `(Start-Process release\staging\s0L\s0L.exe --check-files -Wait -PassThru).ExitCode`.
  Expected: 0.
- [ ] **Step 4: Tamper.** Append a byte to `app\deal_tracker.py`: 3. Add a stray
  file: 3. Restore both: 0.
- [ ] **Step 5: Verify an unsigned build.** `s0L.exe --verify <stage>` from the
  unsigned build. Expected: 4.
- [ ] **Step 6: Verify a signed build.** Run `az login` first, then `npm run package`.
  Copy the stage to `%TEMP%\s0L-a` and `%TEMP%\s0L-b`, and run
  `%TEMP%\s0L-a\s0L.exe --verify %TEMP%\s0L-b`.
  - Untouched: 0.
  - `%TEMP%\s0L-b\app\deal_tracker.py` tampered: 3.
  - `%TEMP%\s0L-b\s0L.exe` replaced by the unsigned one: 1.
- [ ] **Step 7: Run the Python suite** with `python -m pytest -q`. Expected: PASS
  (the contract is unchanged).

### Task 5: Swap, hand over and roll back (launcher)

**Files:**

- Modify:
  - `packaging/launcher/s0L.cs` (TrayContext, Session env, mutex held in a static
    field with an owned flag);
  - `packaging/launcher/Updates.cs` (folder helpers, swap and undo, snapshot,
    `update.log`).
- Docs: `UI_ARCHITECTURE.md`, "The packaged app": updates, `.update\` and
  `.previous\`.

**Interfaces:**

- Consumes: the folder contract, `GET /api/updates/version` and `Updates.Verify`.
- Produces: the Flask environment variables `S0L_VERSION` (the
  `AssemblyInformationalVersion`; leave it unset when there is none) and
  `S0L_LAUNCHER` (`Application.ExecutablePath`).

**When an update is applied.**

- At start (first instance), when `.update\ready` exists, apply it before starting
  the servers. The new version opens the browser as usual.
- While running, the watchdog (every 2 s) applies it with `--no-browser` when
  `.update\restart` exists.
- Apply runs on a background thread. Meanwhile the tray says `s0L - updating`, Quit
  is disabled and `CheckServers` is skipped. Mutex and tray calls go through the
  UI thread (`ui.Invoke`), because a mutex belongs to the thread that took it.

**Apply(target, fromRestart):**

1. Stop Flask and GSSM, then wait until 5121 and 5175 stop answering (at most
   20 s).
2. Run `Verify(.update\staging)`. If it isn't 0:
   - add the target to `bad-versions` (unless the code was 4);
   - delete `staging`, `ready` and `restart`;
   - start this launcher's own servers again, and stop.
3. Copy `data\deals_data.json` and `gssm\store.sqlite`, `-wal` and `-shm` (whichever
   exist) into `.update\snapshot\`.
4. Delete any old `.previous`. Rename `app`, `runtime` and `s0L.exe` into
   `.previous\`, then rename `staging\app`, `staging\runtime` and
   `staging\s0L.exe` into the root. If any rename fails:
   - undo the renames done so far, in reverse;
   - delete the snapshot and `restart`, but keep `staging` and `ready` so the next
     start tries again;
   - start this launcher's own servers again, and stop.
5. Delete `ready`, `restart` and the empty `staging`.
6. On the UI thread, hide the tray icon and release the mutex.
7. Start `<root>\s0L.exe`, adding `--no-browser` when `fromRestart`.
8. Poll `/api/updates/version` once a second for up to 90 s until its body equals
   the target. Stop early if the new launcher exits.
9. On success, delete the snapshot and exit.
10. On failure:
    - kill the new launcher, which takes its servers down with its job;
    - wait until the ports are free;
    - copy `logs\flask.log` and `logs\gssm.log` to
      `logs\update-<target>-flask.log` and `logs\update-<target>-gssm.log`;
    - rename the root's `app`, `runtime` and `s0L.exe` into `.update\failed\`, and
      rename `.previous\*` back into the root;
    - restore the snapshot files, then add the target to `bad-versions` and delete
      `.update\failed`;
    - on the UI thread, take the mutex again, show the tray icon and the balloon
      `s0L couldn't start version {target}, so it's back on version {current}.`;
    - start this launcher's own servers again.

Every step adds a timestamped line to `%LOCALAPPDATA%\s0L\logs\update.log`.

**Manual checks.** Use signed builds unpacked to `%TEMP%\s0L-test\s0L`, and
nothing gets published.

- [ ] **1. Run.** Build 1.1.0 (set `package.json` to that version), unzip it and
  run it. Expected: `GET /api/updates/version` answers `1.1.0`.
- [ ] **2. Restart.** Build 1.1.1 and unzip its `s0L\*` into
  `.update\staging\`. Write `1.1.1` into `.update\ready`, then run
  `Invoke-RestMethod -Method Post http://localhost:5121/api/updates/restart -ContentType application/json -Body '{}'`.
  Expected within about 30 s:
  - the version endpoint answers `1.1.1`;
  - `.previous` holds 1.1.0;
  - no new browser tab opened;
  - the deals file is unchanged (same hash).
- [ ] **3. Start.** Quit, stage 1.1.2 the same way with `ready`, then double-click
  `s0L.exe`. Expected: the browser opens on 1.1.2.
- [ ] **4. Roll back.** Make a throwaway signed 1.1.3 whose `deal_tracker.py`
  starts with `raise SystemExit(1)`. Don't publish it. Stage it and restart.
  Expected after about 90 s:
  - the balloon shows;
  - the version endpoint answers `1.1.2`;
  - `bad-versions` lists 1.1.3;
  - `logs\update-1.1.3-flask.log` exists;
  - the deals file hash is unchanged.
- [ ] **5. Locked file.** Stage 1.1.4, then hold
  `[IO.File]::Open("<root>\app\deal_tracker.py",'Open','Read','None')` open in
  PowerShell and restart. Expected:
  - s0L comes back on 1.1.2;
  - `update.log` shows the undo;
  - after the handle is closed and s0L restarted, 1.1.4 applies.
- [ ] **6. Unsigned install.** Run an unsigned package and let a check run.
  Expected: `/api/updates/status` never reports `ready`.

### Task 6: Ask the person (frontend)

**Files:**

- Create:
  - `frontend/src/shared/services/updateService.js`
  - `frontend/src/shell/updatePrompt.js` and `frontend/src/shell/updatePrompt.test.js`
  - `frontend/src/shell/UpdatePrompt.jsx`
- Modify: `frontend/src/App.jsx:110-128` (mount it, and change the connect notice)
- Docs: `DESIGN.md`, one line saying the update prompt is the shared Modal with one
  primary action; `.github/copilot-instructions.md` frontend tree.

**Interfaces:**

- Consumes: `GET /api/updates/status` and `POST /api/updates/restart`.
- Produces:
  - `updateService.status()`, `updateService.restart()`
  - `promptFor(status, laterVersion) -> string | null`
  - `updateNotice(status) -> string | null`
  - `LATER_KEY = 's0l-update-later'` (sessionStorage)

- [ ] **Step 1: Write the failing tests** in `updatePrompt.test.js`:

```js
expect(promptFor(null)).toBe(null)
expect(promptFor({ enabled: false, ready: '1.1.0' })).toBe(null)
expect(promptFor({ enabled: true, ready: '' })).toBe(null)
expect(promptFor({ enabled: true, ready: '1.1.0' }, null)).toBe('1.1.0')
expect(promptFor({ enabled: true, ready: '1.1.0' }, '1.1.0')).toBe(null)
expect(promptFor({ enabled: true, ready: '1.1.1' }, '1.1.0')).toBe('1.1.1')
expect(updateNotice({ notice: 'no_access' })).toBe("Your monday account can't see s0L's update board, so s0L can't update itself. Ask the board's owner for access.")
expect(updateNotice({ notice: 'reconnect' })).toBe('Connect monday again (the icon at the top) so s0L can keep itself up to date.')
expect(updateNotice({ notice: null })).toBe(null)
```

- [ ] **Step 2: Run them** with `npm --prefix frontend test -- updatePrompt`.
  Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`UpdatePrompt.jsx`:**
    - Fetch the status on mount and every 10 minutes, and set any
      `updateNotice` text through `useDealStore((s) => s.setAppNotice)`.
    - When `promptFor` returns a version, show a `Modal` titled
      `s0L ${version} is ready` with the text "Restart s0L to use it. Your deals and
      documents stay as they are." and two buttons, **Later** (`btn btn-secondary`)
      and **Restart now** (`btn btn-primary`).
    - **Later** stores the version under `LATER_KEY` and closes.
    - **Restart now** calls `restart()`, then shows "Restarting s0L…" with no
      buttons. It polls `status()` every 2 s for up to 3 min, and calls
      `window.location.reload()` once `status.version === version`. On timeout it
      shows "s0L is taking longer than usual. Open it again from its tray icon."
      with a Close button.
  - **`App.jsx`:** render `<UpdatePrompt />` once. Change the not-connected branch to
    `else if (status.app_configured) setAppNotice('monday: click the monday icon at the top to connect, keep deals in sync and get s0L updates.')`.
- [ ] **Step 4: Check it.** Run `npm --prefix frontend test`,
  `npm --prefix frontend run lint` and `npm --prefix frontend run build`. Expected:
  all pass.
- [ ] **Step 5: Look at it.** Run Flask with `S0L_VERSION=1.0.0`, `S0L_LAUNCHER`
  pointing at any file, and `1.0.1` written into the `.update\ready` next to it.
  Expected: the prompt appears. Check it in Obsidian, Frost and Aurora. Remove the
  test files afterwards.

### Task 7: Publish from VS Code (`npm run release`)

**Files:**

- Modify: `core/features/integrations/monday/releases.py` (`upload`), `package.json`
  (`"release": "python -m core.features.integrations.monday.publish"`)
- Create: `core/features/integrations/monday/publish.py`
- Test: `tests/test_monday_publish.py`
- Docs:
  - `.github/copilot-instructions.md`: Build and Test (`npm run release`) and the
    backend tree;
  - `UI_ARCHITECTURE.md`: "The packaged app", publishing.

**Interfaces:**

- Consumes: `releases.latest_release`, `releases.parse_version`, `oauth.status`,
  `oauth.access_token`, `oauth.api_headers`.
- Produces:
  - `releases.upload(zip_path, *, post=None) -> str` returns the asset id.
    - It sends a multipart POST to `config.FILE_API_URL` with two fields:
      - `query`:
        `mutation ($file: File!) { add_file_to_column(item_id: 13410016681, column_id: "file_mksmcq4v", file: $file) { id } }`
      - `variables[file]`: the zip, under its own file name, as `application/zip`.
    - A non-200 answer or GraphQL errors raise
      `ReleaseError('upload_failed', <monday's message>)`.
  - `publish.next_version(on_monday, in_package, requested=None) -> tuple`
  - `publish.write_package_version(path, version) -> None`
  - `publish.main(argv=None, *, run_build=None) -> int`. It runs these steps:
    1. Refuses unless connected with `can_write`. The message tells the person to
       reconnect monday.
    2. Reads the newest release and picks the version.
    3. Writes it to `package.json`.
    4. Runs
       `powershell -NoProfile -ExecutionPolicy Bypass -File packaging/build.ps1`.
    5. Uploads `release\s0L-<v>.zip`.
    6. Reads the item again and confirms the version.
    7. Prints `Published s0L <v> to monday.` It never runs git.

- [ ] **Step 1: Write the failing tests:**

```python
def test_next_version_bumps_what_is_on_monday(): assert publish.next_version((1, 0, 0), (1, 0, 0)) == (1, 0, 1)
def test_next_version_keeps_a_higher_package_version(): assert publish.next_version((1, 0, 0), (1, 2, 0)) == (1, 2, 0)
def test_next_version_first_release(): assert publish.next_version(None, (1, 0, 0)) == (1, 0, 0)
def test_requested_version_must_be_newer():   # (1,2,0) on monday + requested (1,2,0) -> ValueError; (1,3,0) -> (1,3,0)
def test_write_package_version_changes_only_the_version(tmp_path):   # a nested "version" in dependencies stays; other lines byte-identical
def test_upload_sends_multipart_with_the_mutation(tmp_path, vault):  # body has name="query", 13410016681, file_mksmcq4v,
    # name="variables[file]"; filename="s0L-1.0.1.zip" and the file bytes; returns '555'
def test_upload_reports_monday_refusal(tmp_path, vault):   # errors [{'message': 'Unsupported file type'}] -> 'upload_failed' with that text
def test_main_refuses_without_board_write(vault, capsys):  # scopes me:read,boards:read -> 1, run_build never called
def test_main_refuses_an_old_requested_version(vault, fake_monday): ...
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `upload`, `publish.py` and the npm script.
- [ ] **Step 4: Run the suites** with `python -m pytest -q` and
  `npm --prefix frontend test`. Expected: PASS.
- [ ] **Step 5: First real release, only with the user's go-ahead.** It needs:
  - `az login`;
  - a monday reconnect on this PC, since its sign-in lacks `boards:write`.

  Then run `npm run release`. Expected: `s0L-1.1.0.zip` appears in the item's Files
  column. This is the first upload through the API. If monday refuses `.zip`,
  report its message; the user can drag `release\s0L-1.1.0.zip` into the item by
  hand instead.
