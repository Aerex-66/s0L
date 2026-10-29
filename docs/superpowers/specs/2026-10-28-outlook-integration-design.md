# Outlook integration: design

*2026-10-28 · status: approach picked by the user ("1. thats fine. proceed and be thorough");
reviewed by a builder the same day. Worked out with the user on 2026-10-28.*

## Intent

- **Emails and invites are a chore (user).** The user hates sending meeting invites and
  emails, and Outlook does a lot for the team. s0L should do the typing: open real Outlook
  emails and invites, already addressed and written, with deal documents attached. The
  person checks and presses Send.
- **Use the Outlook people already have (user).**
  - No Microsoft Graph, and no new app registration ("2 registrations is 2 too many").
  - The Outlook app on the computer is the target.
  - Outlook in the browser is a fallback ("a nice to have… not my go-to").
- **Later, not now (user).** A library of ready-made review emails and invites (risk review,
  TDA, SALs, PALs, legal or ITR, SRR and PRR…), each knowing whom to send to from the deal
  and its approvers. That's its own deliberate project. This build lays its groundwork:
  one place that turns a message into an Outlook draft or invite.

## Goals

1. **An Outlook icon in the header**, next to monday's and Salesforce's.
   - Its mark is in colour and its dot green when s0L uses the Outlook app; otherwise grey.
   - A click opens a picker: the Outlook app on this computer, or Outlook in the browser.
2. **Detection picks the start.** s0L detects whether the classic Outlook app is usable here
   and uses it if so; otherwise it uses the browser. The picker changes that, once, for this
   computer.
3. **The calendar reads itself.** The Calendar tab's Outlook events load without anyone
   starting a script, in development as in the packaged app. They are read from the open
   Outlook app. s0L never starts Outlook just to read the calendar.
4. **Real drafts and invites, in the app.**
   - Today's email buttons open a real Outlook email, filled in, with no length limit:
     approval emails (one approver, or the chase-all), contact emails (one contact, or all of
     them).
   - The meeting composer opens a real Outlook meeting invite.
   - Outlook's own signature stays on emails.
5. **Deal documents as attachments, in the app.**
   - The meeting composer lets you tick deal documents to attach.
   - Each document in Documents gets **Email in Outlook**, which opens a draft with that
     file attached.
6. **The browser fallback** opens the same emails and invites in Outlook on the web, filled
   in. It can't attach files or show the calendar.

## Non-goals

- **Microsoft Graph, any app registration, or any sign-in (user).**
- **Reading or searching mail, or saving attachments into s0L.**
- **The review-email library (user: later, deliberate).**
- **Sending anything without the person pressing Send.** s0L only opens drafts.
- **Supporting the new Outlook for Windows natively.** It has no local connection, so it
  counts as the browser.

## Anti-goals

- **Opening Outlook uninvited.** The calendar reader only reads an Outlook that's already
  open, and only a click on a draft or invite button may start Outlook.
- **Any file other than the deal's own stored documents attached.** Attachments are named
  by document ID, and the server checks every file lives in s0L's documents folder.
- **Losing what the person already set.** Their signature stays, and so does their choice
  of app or browser.

## Constraints

- **Integration rules** (UI_ARCHITECTURE invariant 2).
  - Only the Flask backend talks to the Outlook app.
  - The browser fallback is a hand-off link: the person's browser opens Outlook on the web
    and s0L makes no request, the same as today's `mailto:` and `msteams:` links. The docs
    say so explicitly.
- **Classic Outlook only.**
  - The local connection (Outlook's COM automation interface) exists only in classic
    Outlook. The new Outlook for Windows has none (checked 2026-10-28).
  - Classic and new Outlook can be installed side by side.
- **Outlook may warn about programs using it.**
  - IBM can set Outlook to warn when another program reads or sends its mail (the
    "programmatic access" setting).
  - Opening drafts with Display (never Send) and setting recipients doesn't trigger it with
    current antivirus. Reading the new draft's body, to keep the signature, can. A refused
    read falls back to plain text without the signature.
  - The first real use shows whether IBM's setting prompts.
- **Layering.** Features never import each other.
  - The Outlook connection itself lives in `core/shared/outlook_app.py`. The calendar sync
    (calendar feature) and the new Outlook integration both use it.
  - On the frontend, the Outlook mode and the `openEmail` / `openInvite` actions live in
    `shared/`, because Home and Documents both use them.
- **One writer per store.** The Outlook choice is `preferences.outlook_mode` in
  `deals_data.json`, written only by the Outlook route. The settings route merges
  preferences, so it never drops it.

## Approaches considered

1. **The Outlook app's own connection (COM) from the backend (picked by the user).** The
   only option that does emails and invites, natively, with attachments, and it's the
   connection the calendar already uses.
2. **Email files Outlook opens.** No live connection, but meeting invites open as calendar
   entries rather than invites to send. Dropped.
3. **Keep today's links.** No attachments, and the body is cut at about 2,000 characters.
   Dropped.

Microsoft Graph was ruled out by the user: it needs an app registration and probably IBM's
consent.

## How it works

### Which Outlook (detection and the picker)

- **Usable here** means the Outlook app answers locally:
  - classic Outlook's COM class is registered (`HKCR\Outlook.Application\CLSID`, today's
    `outlook_available()` check);
  - `comtypes` imports;
  - and this Windows user has at least one Outlook mail profile
    (`HKCU\Software\Microsoft\Office\16.0\Outlook\Profiles` has a subkey).

  The profile check (my call) keeps s0L from picking classic Outlook for someone who has it
  installed but never set it up, or who moved to the new Outlook.
- **The mode.**
  - `preferences.outlook_mode` is `app` or `web`.
  - When it's unset, the effective mode is `app` if Outlook is usable here, else `web`.
  - The picker is the only way to set it (`PUT /api/outlook/mode`).
  - No first-run prompt (my call): detection already makes the only sensible first choice.
- **The picker** (`shell/OutlookPicker.jsx`) is a small modal: "Which Outlook do you use?"
  with two choice blocks.
  - **The Outlook app on this computer**: "Found" or "Not found: s0L needs the classic
    Outlook app". Can't be chosen when it isn't usable.
  - **Outlook in the browser**: "Emails and invites open in Outlook on the web. s0L can't
    attach files or show your Outlook calendar."
- **`GET /api/outlook/status`** returns `{ app: { found, running }, mode, effective }`.
  `running` is whether Outlook is open now; the tooltip uses it.

### The header icon

`shell/OutlookConnect.jsx`, with a badge helper like `mondayBadge.js`. It sits after
Salesforce's icon and uses `integration-logos/outlook.svg`.

| State | Mark | Dot | Tooltip |
|---|---|---|---|
| loading | grey | muted | Outlook |
| app mode, Outlook open | colour | green | Outlook · the app on this computer · click to change |
| app mode, Outlook closed | colour | muted | Outlook · the app on this computer (open it to see your calendar) · click to change |
| app mode but not usable | grey | muted | Outlook · the app isn't set up on this computer · click to choose |
| browser | grey | muted | Outlook · in the browser · click to change |

A click opens the picker. The mark uses the shared `.header-signed-out` grey.

### The calendar

- **The reader always starts.** `deal_tracker.py` starts it whenever the Outlook app is
  usable, no longer only in the packaged app. `S0L_OUTLOOK_SYNC` is no longer read, and
  the launcher stops setting it.
  - Every minute it skips when the effective mode is `web`.
  - It reads only an Outlook that's already open (`GetActiveObject`), never launching it.
  - Otherwise it writes the cache as today, with the same fields and filter.
- **`GET /api/calendar/outlook` reports the mode.** It reads the mode from preferences
  (stored data, not code from another feature).
  - effective `web` → `{ status: 'web' }`, no events. That includes nobody having chosen
    yet on a computer where the app isn't usable.
  - `no_app` only when someone chose the app and it's no longer usable.
  - no cache yet → `{ status: 'waiting' }` ("Open Outlook and your calendar appears here
    within a minute").
  - otherwise as today: `ok` with the cache's age, which the tab marks stale after five
    minutes.
- **The Calendar tab's badge** says, in turn: "Outlook synced (n min ago)", "Open Outlook
  to refresh", "Outlook in the browser", "No Outlook app". The "Run
  outlook_calendar.ps1" badge goes, and so does the script (deleted with the user's go,
  2026-10-28).

### Drafts and invites in the app (`core/features/integrations/outlook/`)

- **`POST /api/outlook/draft`** `{ deal_id?, to: [], cc: [], subject, body, attachments: [doc ids] }`
  1. Validate: addresses must look like emails; at most 100 recipients; subject up to 500
     characters; body up to 100,000; at most 20 attachments.
  2. Resolve attachments. Each ID must be a document on that deal, its `stored_path` must
     exist, and its real path must lie inside `DOCUMENTS_ROOT`. Anything else is a 400
     naming the document.
     - Stored files are named `<token>_<name>`, so each checked file is copied under the
       document's own name into a fresh folder in the user's temp folder. The copy is
       attached and then deleted (Outlook keeps its own copy once attached).
     - This was the builder's call: recipients see "Acme iSBD.pptx", not the stored name.
  3. Through `core/shared/outlook_app.py`, on the request thread (`CoInitialize` and
     `CoUninitialize` around it):
     - reuse the open Outlook, or start it (a click asked for it);
     - `CreateItem(0)`;
     - set `To` and `CC` (`; `-joined) and `Subject`;
     - add each attachment;
     - `Display()`, then put the text above Outlook's signature
       (`HTMLBody = <escaped text, line breaks as <br>> + HTMLBody`), falling back to
       `Body = text` if that read is refused;
     - bring the window forward (`GetInspector.Activate()`, best effort).
  4. Answer `{ opened: true }`.
- **`POST /api/outlook/invite`** `{ deal_id?, attendees: [], subject, start, end, location?, body, attachments }`
  - Same checks. `start` and `end` are local times (`YYYY-MM-DDTHH:MM`), and `end` must come
    after `start`.
  - `CreateItem(1)`, then `MeetingStatus = 1` (a meeting) and `RequiredAttendees`
    (`; `-joined). Then `Subject`, `Start`, `End`, `Location`, `Body`, the attachments, and
    `Display()`.
  - The invite has no Teams link of its own. The person adds one with Outlook's Teams
    button; the composer's hint says so.
- **Failures:**
  - Outlook app not usable → 409 `{ kind: 'no_app' }`.
  - Outlook refused or crashed → 502 `{ kind: 'outlook_failed', error }`, with Outlook's
    message reduced to one line.
- **Every route** is local hosts only, POSTs are JSON only, and there are no tokens or
  secrets.

### Messages, and the frontend

- **`features/home/handoff.js` splits each message from its delivery.**
  - New builders return `{ to, cc, subject, body }`:
    - `approvalEmail({ label, recipients, items })`;
    - `contactEmail({ contact, pending, label })`, moved out of `Contacts.jsx`;
    - `groupEmail({ contacts, label })`.
  - `approvalEmailLink` stays, now `mailtoLink(approvalEmail(...))`, so its tests keep
    passing.
- **`shared/utils/outlookLinks.js`** builds the browser fallback.
  - Emails: `outlookWebMailLink(message)` →
    `https://outlook.office.com/mail/deeplink/compose?to=…&cc=…&subject=…&body=…`.
  - Invites: `outlookWebEventLink(meeting)` →
    `https://outlook.office.com/calendar/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=…&startdt=…&enddt=…&location=…&body=…&to=…`.
  - The body is shortened to keep a link under 8,000 characters, the way `fit` does for
    `mailto:`. Recipients are never shortened.
  - The calendar link's form was seen in a real public "add to Outlook" link. Its `to`
    (attendees) parameter is best effort.
- **`shared/outlookStore.js`** (Zustand) keeps:
  - `status` and `load()`, refreshed on app start and after the picker saves;
  - `effective`, plus `setMode(mode)`;
  - `openEmail(message, { attachments })`: in app mode it POSTs the draft and reports
    failures through `setAppNotice`; in browser mode it opens the web link in a new tab;
  - `openInvite(meeting, { attachments })` the same way.

  Mode-independent pieces (the deal label, recipients) stay with their callers.
- **The email buttons** in `Activities.jsx` and `Contacts.jsx` become one shared Home
  component, `OutlookEmailButton`.
  - Browser mode: an `<a target="_blank">` to the web link.
  - App mode: a button calling `openEmail`, with an "Opening Outlook…" state.

  The look stays the same.
- **`MeetingComposer`** keeps everything it has (attendees, subject, time, agenda, **Open in
  Teams**, **Copy link**).
  - Its primary action becomes **Open in Outlook** (app) or **Open in Outlook on the web**
    (browser).
  - "Email in Outlook" goes.
  - In app mode it gains **Attach** chips for the deal's documents.
  - The title becomes "Schedule a meeting".
  - The hint follows the mode: "Outlook opens the invite with everything filled in. Add a
    Teams link there if you want one, then press Send."
- **Documents** gets **Email in Outlook** on each document (library card, required slot,
  preview), in app mode only.
  - It calls `openEmail({ to: [], subject: `${deal label}: ${document name}`, body: '' }, { attachments: [doc.id] })`.
  - The person picks recipients in Outlook.
- **`shared/services/outlookService.js`** has `status()`, `setMode(mode)`, `draft(payload)`
  and `invite(payload)`.

### Docs

- UI_ARCHITECTURE.md: the integration's row, Outlook-on-the-web links under invariant 2,
  and the calendar reader running in development too.
- DESIGN.md: the Outlook icon, the picker, Attach chips, and the document action.
- `.github/copilot-instructions.md`: the structure map.
- Repo memory.

## Testing

- **pytest** (fake Outlook objects; no real COM):
  - detection: registered, no profile, not registered, `comtypes` missing;
  - mode route: JSON only, valid values, persisted, and settings merges keep it;
  - status: effective mode from detection or choice;
  - draft:
    - validation;
    - attachments: unknown ID, another deal's document, a path outside the documents
      folder, a missing file;
    - item calls: `CreateItem(0)`, recipients, subject, attachments, `Display`, and text
      above the signature;
    - the signature-read fallback;
    - `no_app` and `outlook_failed`;
  - invite: `MeetingStatus`, attendees, times parsed and checked, and the same attachment
    rules;
  - calendar sync: skips in browser mode; never launches Outlook (`CreateObject` not
    called); writes when Outlook is open;
  - calendar route: every status.
- **Vitest:**
  - the badge states;
  - the message builders (approval, contact, group);
  - the web links (encoding, the 8,000 cap, recipients kept);
  - the effective mode.

## Left to the builder

- **Message format:** the exact HTML for the text above the signature (escape, then `<br>`
  for line breaks, wrapped in Outlook's default font).
- **Picker visuals**, within DESIGN's templates (choice blocks on `--control-fill`, the
  selected one accent-washed).
- **Detection details:** the Office version key (`16.0`) is the current one; checking
  other versions isn't needed.
