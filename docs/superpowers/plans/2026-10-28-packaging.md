# Signed Portable Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command (`npm run package`) turns the repo into `release\s0L-<version>.zip`: unzip, double-click `s0L.exe`, s0L opens in the browser — no install, no admin, signed with the Aerex certificate.

**Architecture:** The zip carries the app code, the built frontend, an embeddable Python and the build machine's `node.exe`. `s0L.exe` (a small C# tray app built with the .NET Framework compiler every Windows has) starts Flask and the GSSM server hidden, inside a job object so they die with it, and points them at `%LOCALAPPDATA%\s0L` through environment variables. Flask serves the built frontend and forwards `/gssm-api` to the GSSM server, replacing the Vite dev proxy. With no environment variables set, everything behaves exactly as today, so `npm run dev` is untouched.

**Tech Stack:** Flask, Express, Vite build, `comtypes` (PowerPoint and Outlook automation), C# 5 / .NET Framework 4.x `csc.exe`, PowerShell 5.1 build script, SignTool + Azure Artifact Signing dlib.

**Spec:** The decisions agreed in chat on 2026-10-27 (listed under Global Constraints) and the monday design in `docs/superpowers/specs/2026-10-27-monday-integration-design.md` ("Connecting: sign in with monday").

## Global Constraints

- Dev mode unchanged: with no `S0L_*` variables, data stays in the repo root and `npm run dev` works as before.
- Packaged data: `%LOCALAPPDATA%\s0L\data` (deals file, documents, client logos, calendar cache), `%LOCALAPPDATA%\s0L\gssm` (`store.sqlite`, `engine-imports`), `%LOCALAPPDATA%\s0L\logs`; monday credentials stay in `%LOCALAPPDATA%\s0L\monday`.
- Ports stay 5121 (Flask, also serves the UI) and 5175 (GSSM); the monday redirect `http://localhost:5121/api/monday/oauth/callback` keeps working.
- LibreOffice is not shipped. Slide previews come from PowerPoint; LibreOffice stays a fallback only where it is installed.
- The monday app's client ID and secret ship inside the package (`app\monday-app.json`); colleagues only click Connect and sign in.
- No PowerShell runs in the packaged app (no hidden `-ExecutionPolicy Bypass` windows); the Outlook calendar is read from Python.
- No runtime network beyond the existing sanctioned integrations. Build-time downloads only: python.org (embeddable Python), nuget.org (SignTool, Artifact Signing dlib).
- Runtimes: embeddable Python = the build machine's Python version (3.14.x); `node.exe` = the build machine's (v22.20.0), so `better-sqlite3` matches.
- Signing: endpoint `https://cus.codesigning.azure.net/`, account `Aero`, profile `Aerex`, `/fd SHA256 /tr http://timestamp.acs.microsoft.com /td SHA256`, AzureCliCredential only (`az login --tenant 53766e3f-8ad5-418c-bac7-aaad7bdc46df --use-device-code` first). Every PE file that isn't already validly signed gets signed.
- Edits under `gssm-server/` get a GSSM_SYNC.md entry. No commits: the tree carries unrelated uncommitted work; the owner reviews and commits.

## Review Focus

1. **Client data in the zip** — the dev machine holds `deals_data.json`, `documents/`, `gssm-server/.gssm`, `engine-imports`, a real `isbdReference.json` and `ref_slide*.png`. None may ship; the build checks the staged tree and stops if any appear (Task 8).
2. **The ports are taken** (dev servers running) — the launcher must say so, not fail silently (Task 7).
3. **The user already has PowerPoint open** — rendering must never close their PowerPoint or decks (Task 3 test `test_powerpoint_left_running_when_it_was_already_open`).
4. **Updating = replacing the folder** — data must not live in, or depend on, the app folder or the working directory (Task 1 test `test_data_root_ignores_working_directory`).
5. **The SPA fallback swallowing API errors or serving files outside the build** — `/api/...` 404s stay JSON and `..` paths are refused (Task 2 tests).

---

### Task 1: Data root

**Files:** Modify `core/shared/state.py:12-13`, `core/features/documents/pptx_io.py:22`, `core/features/calendar/calendar.py:9-12`. Test: `tests/test_packaging.py`.

**Interfaces — Produces:** `state.resolve_data_root(environ: Mapping[str, str]) -> str`; `state.DATA_ROOT: str`; `state.DATA_FILE = join(DATA_ROOT, 'deals_data.json')`; `state.DOCUMENTS_ROOT = join(DATA_ROOT, 'documents')`; `pptx_io.WORKSPACE_ROOT = state.DATA_ROOT`; `calendar.cache_file() -> str` = `join(state.DATA_ROOT, 'outlook_calendar_cache.json')`.

- [ ] Write failing tests: `test_data_root_defaults_to_repo_root` (`resolve_data_root({})` == repo root), `test_data_root_from_env` (`{'S0L_DATA_DIR': str(tmp)}` → that path, absolute), `test_data_root_ignores_working_directory` (chdir to tmp, `resolve_data_root({})` unchanged).
- [ ] Run `python -m pytest tests/test_packaging.py -q` → fails (no `resolve_data_root`).
- [ ] Implement; `DATA_FILE` becomes absolute (today it is relative to the working directory, which is the repo root in dev, so dev behavior is identical). Client logos follow `DATA_FILE` already (`client_logos/store.py:cache_dir`).
- [ ] Run the full suite `python -m pytest -q` → all pass.

### Task 2: Flask serves the built frontend and the GSSM proxy

**Files:** Create `core/shell/__init__.py`, `core/shell/frontend.py`. Modify `core/app_factory.py`. Test: `tests/test_packaging.py`.

**Interfaces — Produces:** `create_frontend_blueprint(dist_dir: str, gssm_origin: str = 'http://127.0.0.1:5175') -> Blueprint`; `create_app()` registers it when `S0L_FRONTEND_DIST` names a folder holding `index.html`.

- [ ] Write failing tests (env `S0L_FRONTEND_DIST` → tmp dist with `index.html`, `assets/app.js`): `test_serves_index_and_assets`, `test_unknown_page_falls_back_to_index`, `test_api_404_stays_json` (`/api/nope` → 404 JSON, not HTML), `test_refuses_paths_outside_dist` (`/assets/..%2f..%2fsecret.txt` → 404), `test_no_dist_no_frontend_routes` (env unset → `/` is 404), `test_gssm_proxy_forwards_method_body_query` (fake `urlopen` sees `POST http://127.0.0.1:5175/api/engine/edits?workbookId=7`, body and Content-Type passed; upstream status and body returned), `test_gssm_proxy_reports_engine_down` (`URLError` → 502 JSON), `test_gssm_proxy_refuses_foreign_host` (Host `evil.test` → 403).
- [ ] Run → fail.
- [ ] Implement: static files via `send_from_directory`; fallback to `index.html` for GET paths outside `api/` and `gssm-api/`; proxy with `urllib.request` (no `Accept-Encoding` forwarded; `HTTPError` is passed through as the response; body streamed back in 64 KB chunks; forward `Content-Type`, `Content-Disposition`, `Content-Length`, `Cache-Control`; timeout 300 s).
- [ ] Run the full suite → pass.

### Task 3: PowerPoint slide previews

**Files:** Modify `core/features/documents/slide_render.py`, `requirements.txt` (+ `comtypes>=1.4`). Test: `tests/test_slide_render.py`.

**Interfaces — Produces:** `render_with_powerpoint(pptx_path: str, output_dir: str, width: int = 1280) -> list[str]` writing `slide-001.jpg`… (the route already reads 3-digit names); `_open_powerpoint() -> tuple[app, started: bool]` (attach with `GetActiveObject`, else `CreateObject`; both `dynamic=True`); `render_slide_images()` tries PowerPoint first, then LibreOffice, else returns `[]`.

- [ ] Write failing tests with a fake COM app: `test_powerpoint_exports_numbered_jpgs` (3 slides, 16:9 → files `slide-001..003.jpg`, `Export(path, 'JPG', 1280, 720)`), `test_powerpoint_quits_only_when_it_started_it`, `test_powerpoint_left_running_when_it_was_already_open`, `test_presentation_closed_when_export_fails`, `test_falls_back_to_libreoffice_when_powerpoint_missing`, `test_nothing_installed_returns_empty`.
- [ ] Run → fail.
- [ ] Implement: open read-only and windowless (`Open(path, -1, 0, 0)`), one render at a time (module lock), `CoInitialize`/`CoUninitialize` in the render thread, quit only if this call started PowerPoint and no presentations remain. Availability = Windows + `comtypes` importable + `HKCR\PowerPoint.Application\CLSID`.
- [ ] Install `comtypes`; run the full suite → pass. Live check on this PC (PowerPoint is installed): render a sample deck, see the JPGs.

### Task 4: Outlook calendar from Python

**Files:** Create `core/features/calendar/outlook_sync.py`. Modify `deal_tracker.py`, `core/features/calendar/calendar.py` (packaged-mode "waiting for Outlook" message). Test: `tests/test_outlook_sync.py`.

**Interfaces — Produces:** `read_outlook_events(outlook, now: datetime, days_before: int = 7, days_after: int = 60) -> list[dict]` (keys exactly as the script: `subject, start, end, location, isAllDay, categories, organizer, busyStatus`; times `%Y-%m-%dT%H:%M:%S`; same `Restrict` filter text); `write_cache(events, path)` (atomic); `start_outlook_sync(cache_file: str, interval: int = 60) -> threading.Thread`. `deal_tracker.py` starts it when `S0L_OUTLOOK_SYNC == '1'`.

- [ ] Write failing tests with fake Outlook objects: `test_reads_events_in_script_format`, `test_restrict_filter_matches_script`, `test_skips_items_without_subject`, `test_write_cache_is_atomic_json`.
- [ ] Run → fail. Implement (GetFirst/GetNext iteration, cap 5000 items). Run the full suite → pass.

### Task 5: monday app credentials inside the package

**Files:** Modify `core/features/integrations/monday/credentials.py`. Test: `tests/test_packaging.py`.

**Interfaces — Produces:** `load_app()` returns the file named by `S0L_MONDAY_APP` when it holds a non-empty `client_id` and `client_secret`, else the DPAPI store as today.

- [ ] Failing tests (use the `vault` fixture): `test_bundled_app_credentials_win`, `test_bad_bundled_file_falls_back_to_store`, `test_no_env_uses_store`. Run → fail. Implement. Full suite → pass.

### Task 6: GSSM database location

**Files:** Modify `gssm-server/storage.js:8`, `GSSM_SYNC.md` (changelog entry).

- [ ] `DEFAULT_DB_PATH = process.env.GSSM_DB_PATH || <current path>`.
- [ ] Verify: start `node index.js` with `GSSM_DB_PATH` and `ENGINE_IMPORT_ROOT` in a temp folder and `API_PORT=5199`; `GET /api/engine/workbooks` answers and `store.sqlite` appears there; stop it.

### Task 7: The launcher

**Files:** Create `packaging/launcher/s0L.cs`, `packaging/launcher/s0L.ico`.

**Interfaces — Consumes:** the package layout of Task 8 (`app\`, `runtime\python\python.exe`, `runtime\node\node.exe`) and every variable named in Tasks 1–6 plus `FRONTEND_PORT=5121`, `PYTHON_PATH`, `PYTHONDONTWRITEBYTECODE=1`, `PYTHONUTF8=1`. **Produces:** `s0L.exe [--no-browser]`.

- [ ] Write it (C# 5 only — the built-in compiler): single instance (named mutex; a second launch just opens the browser); if 5121 or 5175 already answers, explain and exit; start both servers hidden with stdout/stderr to `logs\flask.log` / `logs\gssm.log`; job object with kill-on-close; wait up to 60 s for `http://127.0.0.1:5121/`; open `http://localhost:5121/`; tray icon (Open s0L · Quit); if Flask dies, say so with the log path and exit.
- [ ] Build it with `csc.exe /target:winexe` and check it compiles cleanly.

### Task 8: Build script, signing and docs

**Files:** Create `packaging/build.ps1`. Modify `package.json` (`package`, `package:unsigned`; `install:all` also installs `gssm-server`), `.gitignore` (`release/`), `README.md`, `UI_ARCHITECTURE.md`, `.github/copilot-instructions.md`.

- [ ] `build.ps1 [-NoSign]`: version from `package.json`; stage `release\staging\s0L-<version>\` from an explicit include list (`deal_tracker.py`, `deal_structure.py`, `core\` minus `__pycache__` and `*.ps1`, `shared\` minus `test-fixtures`, `gssm-server\` minus `.gssm` and `engine-imports`, `frontend\dist`); build the frontend with any real iSBD reference files moved aside and always restored; embeddable Python (cached in `release\cache`) with `python314._pth` = `python314.zip`, `.`, `Lib\site-packages`, `..\..\app`, `import site`; `pip install -r requirements.txt --target`; `compileall`; copy `node.exe`; write `app\monday-app.json` from the owner's store (stop if missing); compile the launcher with the version stamped in; refuse to continue if any forbidden file (Review Focus 1) is staged; sign (SignTool + `Microsoft.ArtifactSigning.Client` from nuget.org, `metadata.json` excluding every credential but `AzureCliCredential`), then check every PE file reads `Valid`; zip to `release\s0L-<version>.zip` and print the full path.
- [ ] Docs: packaged layout, data folders, `npm run package`, PowerPoint instead of LibreOffice.

### Task 9: End-to-end check

- [ ] `npm test` passes.
- [ ] `npm run package:unsigned`; run `release\staging\s0L-<version>\s0L.exe --no-browser`; `/` returns the app, `/api/deals` returns JSON, `/gssm-api/api/engine/workbooks` returns JSON, data appears under `%LOCALAPPDATA%\s0L\data`; quit from the tray (or end the launcher) and both servers are gone.
- [ ] With the owner signed in to Azure: `npm run package`; `Get-AuthenticodeSignature` on `s0L.exe` shows `Valid`, signer `CN=Abidemi Bolatiwa`.
