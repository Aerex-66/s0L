# s0L — How The Interface Looks

*The companion to [UI_ARCHITECTURE.md](UI_ARCHITECTURE.md). That doc explains
the code layers; this one explains the look. Last updated: 2026-10-28.*

---

## The idea in one sentence

The app has **one set of tokens** (colors, type, glass, shadows, motion), and a
**theme is just a palette** — canvas, surface, ink and an accent the user owns.
Every token derives from that palette, so no component ever invents its own value.

This is **personal glass**: square, outline-free glass surfaces floating over a
deep canvas lit by the user's own accent. Nothing is boxed in and nothing is
rounded — surfaces separate by tone, spacing, soft depth and ambient glow, and
rise to meet the cursor. Each person picks the theme, accent and font that make
it feel like theirs.

## Themes — and making it yours

The palette icon in the header opens the **Appearance** panel
([ThemeSwitcher.jsx](frontend/src/shared/ui/ThemeSwitcher.jsx)): theme, accent
(10 swatches or any custom color) and UI font. The choice is saved per device in
`localStorage` (`s0l-appearance`) and applied on `<html>` as inline palette
variables plus `data-theme` / `data-mode`.

| Theme | Mode | Feels like |
|---|---|---|
| **Obsidian** *(default)* | dark | Graphite-black canvas, electric blue |
| **Midnight** | dark | Deep navy, cyan |
| **Nebula** | dark | Plum-black, violet |
| **Aurora** | dark | Pine-black, mint |
| **Ember** | dark | Warm charcoal, orange |
| **Frost** | light | Cool tinted daylight (never plain white), blue |

A palette is `canvas`, `canvas2`, `surface`, `ink`, `accent` and `mode`. A new
theme is one entry in `THEMES` — if it needs component CSS, it's designed wrong.
Dark is the default; `[data-mode="light"]` in base.css overrides only what
differs (shadows, specular light, status shades, fields, header).

**Dark-first.** Build in Obsidian, then check Frost and one light-accent theme
(Aurora or Ember: their accents take dark text).

## The seamless law (adopted 2026-10-21 — carried into v7 "Personal Glass" 2026-10-27)

Every surface follows these rules. They're encoded in the tokens and the
`.glass-panel` / `.liquid-raise` classes — screens inherit the law by using
them, never by hand-rolling:

- **Square corners. Everywhere.** Every `--radius-*` token is `0px`, and one
  rule in base.css squares anything that hardcodes a radius (module CSS,
  ag-grid). The only round things are *marks*, not corners — status dots and
  spinners, whitelisted next to that rule. The ladder names are kept so a
  future change stays one edit.
- **No seams.** Surfaces carry no outline (`--glass-border*` and
  `--modal-border*` are transparent) and shadows have no outer rings.
  Sections are not split by divider lines — they separate by tone, spacing
  and soft depth. Small controls (chips, pills, secondary actions) are
  **tonal blocks** on `--control-fill`, not outlined boxes.
  Kept on purpose: input field edges (affordance), data-row separators, table
  column rules and the timeline month grid (reading data). The dashboard pipeline band has no
  panel at all: it sits on the canvas, closed by a fading hairline with a soft
  accent gradient shadow below (`.pipeline-band::before` / `::after`), and its
  filter is an underline field. Its stats are one quiet line of text: bold
  numbers, muted words, `--divider-fade` hairlines between. Once monday knows
  who you are, the line opens with "Welcome, **name**" and an accent "Not you?"
  link that reopens the name picker (a modal of the board's names as tonal
  blocks on `--control-fill`, the current one in accent). The stats count the
  deals on screen — the active or archived view after the search, the list's
  filters and the grouping: deals, their TCV ("pipeline" on the active view),
  how many have their RFP submission due within a week (active view; the number
  turns `--status-warning` above zero), the number of groups, and wins (Metrics
  view of Archives only).
- **Everything interactive answers the cursor** — one language, all tokens:
  - *Raise* (free-standing cards and tiles): `transform: var(--lift)`,
    `box-shadow: var(--shadow-raise)`, `border-color: var(--hover-border)`.
    A new card just adds `.liquid-raise`.
  - *Highlight* (rows, tabs, and any card holding inputs or dropdowns):
    `--hover-wash` / `--hover-ring` / `--hover-glow` only. **Never move
    something the user is typing into** — a transform also traps dropdowns
    in a new stacking context.
  - Primary buttons (`.btn-primary`, `.cmd-btn--primary`, `.header-new-deal`)
    are flat `var(--accent)` fills with `var(--on-accent)` text (white or
    near-black, picked from the accent's luminance) and a soft accent halo
    (never 3-stop convex bevel gradients or diagonal sheen sweeps).
  - Buttons and chips lift `--lift-sm`. All of it rides
    `transition: var(--transition-liquid)`.
- **Glass tiers, one blur per stack:** light surfaces `blur(14px)`
  (`--glass-blur-light`) · standard panels `blur(24px)` (`--glass-blur`) ·
  modals and the header `blur(40px)` (`--glass-blur-heavy`). Anything nested
  inside glass is translucent but **never re-blurs**.
- **Glass is translucent palette surface, never murky or flat paper.** Fills
  are `--surface` mixed toward transparent (`--glass-bg*`), lit by a 1px
  `--specular-edge` along the top and real depth below.
- **Every glass surface is three layers + one light:** translucent fill →
  backdrop blur+saturate → soft blue-cast depth (`--shadow-glass*`) — plus
  an **ambient accent field** (`--ambient-field`, accent light pooling
  inside the surface) and subtle grain. That's what `.glass-panel` is; use it.
- **Glass needs something to refract.** The canvas mesh (three accent-family
  pools over `--canvas`, strengths `--mesh-*`), the aurora (`body::before` —
  four blurred accent fields drifting on a 90s loop, `--aurora-*`) and the
  film grain (`body::after`) stay visible behind every page. Never flat-fill
  the body, and keep `<html>` background-free so the body background
  propagates under the aurora.
  ⚠ One hard-won lesson: a single invalid gradient in a `background-image`
  list silently voids the ENTIRE list — `radial-gradient(circle 40% at …)`
  is invalid (a circle radius can't be a percentage) and once killed the
  whole mesh. Use `radial-gradient(40% 40% at …)`.
- **Glows are additive and subtle** — a `--glow-*` composes *with* a shadow,
  never replaces one.
- **The header is translucent canvas** (`--header-bg` / `--header-text`) with
  the flowing accent → accent-2 → accent-3 hairline under it.

## Where sizes and colors come from

A ladder — always take the highest rung that fits:

1. **Type roles first:** every text element plays a named role on the
   12-step scale — `--type-micro` (0.6875rem / 11px) up to `--type-3xl`
   (2rem / 32px), with `--type-body` at 0.875rem (14px).
   The full table lives in [.github/copilot-instructions.md](.github/copilot-instructions.md).
   Raw `rem`/`px` sizes in component CSS are wrong.
2. **Typography hierarchy:** headings (`h1`–`h4`) and titles are crisp
   sentence-case (`font-weight: 500–600`, `letter-spacing: -0.015em`).
   Uppercase + wide letter-spacing (`0.06em–0.08em`) is reserved for eyebrow
   labels, KPI captions, and column/axis strips (`.ribbon-cell`). Every
   `button`, `input`, `select`, `textarea` (and Radix reset) explicitly
   inherits `var(--font-family-sans)` so browser default Arial never leaks.
3. **Colors:** theme tokens (`--text-*`, `--glass-*`, `--status-*`,
   `--interactive-*`). Accent washes via
   `color-mix(in srgb, var(--accent) N%, transparent)`; text on an accent
   fill is `var(--on-accent)`. Never hardcode a blue — the accent is the
   user's. `--ibm-blue*` and `--accent-cyan` survive only as aliases of the
   accent family.
4. **Numbers have one style:** tabular figures in the UI font (set once on
   `body`). KPI values are semibold with tight tracking (`-0.02em` to
   `-0.03em`). Mono (`--font-family-mono`) is for IDs and codes only, never
   for amounts or counts.
5. **Fields and modals have exactly one source of truth each:**
   every input/select/textarea takes `--field-bg` / `--field-border`
   (translucent canvas in dark themes, crisp white in Frost, an accent
   halo on focus and no sunken inset shadow), every native dropdown list
   (`option`, one rule in components.css) the opaque `--surface` with
   `--text-primary` (the browser can't draw it translucent), and every
   modal/dialog shell takes `--modal-bg` / `--modal-border` (transparent
   theme-tinted glass, heavy blur). Never restyle a field background or a
   modal surface per component — size and layout are the only per-modal
   overrides allowed. Long pick lists inside a modal (the New Deal client
   field) are s0L's own list (`ClientPicker`, opaque `--surface`, rows on
   `--hover-wash`), never a `<datalist>`: the dialog blocks scrolling outside
   itself, so the browser's suggestion popup can't be scrolled.
6. **Domain colors:** implementation types ride `--impl-color`; practices (the
   monday groups) ride `--practice-1` … `--practice-5`, five fixed hues (SAP
   blue, Oracle red, Salesforce · Adobe · ServiceNow teal, Workday · SuccessFactors
   orange, AMO · Supply Chain violet) at the accent's lightness and chroma, so every
   theme keeps them. SAP Activate
   phases come from [shared/domain_constants.json](shared/domain_constants.json)
   and are identical in Home timelines, GSSM sheets, and exported PPTX
   Gantt bars. Never restyle a phase locally. iSBD slide canvases are the
   other fixed palette: they stay white like the PowerPoint they export to.
7. **Raw hex/rgba:** only inside `base.css` token definitions and the palette
   objects in `ThemeSwitcher.jsx`. Inline color literals in components are
   legacy — convert on touch.

## The brand words (non-negotiable)

| # | Law | Why |
|---|-----|-----|
| 1 | **The accent is the user's.** `var(--accent)` is the one accent: the theme's default or the user's pick. `--accent-2` / `--accent-3` are derived from it (±50° hue in OKLCH) for glows, gradients and the aurora. No fixed accent hues in components. | Every screen agrees, and every user gets their own color |
| 2 | **Bundled fonts only**, from `@fontsource-variable/*` in `main.jsx`: Geist *(default)*, IBM Plex Sans, Inter, Manrope, Outfit, Plus Jakarta Sans, Space Grotesk, Sora for the UI; Geist Mono for IDs and code. **No CDN fonts, ever.** | Air-gapped policy |
| 3 | **Square & seamless** (the seamless law). Square corners, no outlines or divider lines, tonal controls, flat accent primary buttons. | Clean and continuous — rounded edges and boxed-in Carbon panels were both retired 2026-10-21 |
| 4 | **Dark-first.** Obsidian is the default and the reference; Frost is the light option. | The v6 light default read as plain white |
| 5 | **No external assets of any kind.** All icons come from `lucide-react` via `shared/ui/Icons.jsx` (never raw emoji). The one exception: vendor logos are the vendors' own marks, bundled as files and never fetched: business apps (SAP, Oracle, Salesforce…) in `frontend/src/assets/practice-logos/`, connected services (monday) in `frontend/src/assets/integration-logos/`. | Air-gapped policy + visual consistency |

## Motion

| Token | Use |
|---|---|
| `--ease-glass` | The default for everything |
| `--ease-spring` | Modal entrances only |
| `--duration-fast/normal/slow` (120/200/300ms) | Micro / standard / panel |
| `--ease-liquid` + `--duration-hover` (240ms) | Every hover raise and highlight — bundled as `--transition-liquid` |

Hover feedback starts at once and settles within 240ms. Animate `transform`,
`opacity`, colors and shadows — never layout properties. Raises drop their
lift under `prefers-reduced-motion`. Ambient loops (aurora drift, header
accent flow) run ≥ 14s and respect `prefers-reduced-motion`, no exceptions.

## The signature elements (protect these)

- **The aurora** — the drifting light field that makes the glass real.
- **The liquid raise** — cards float up into a soft accent halo under the
  cursor; square buttons glow.
- **The film grain** — kills banding on large gradients.
- **The translucent header** (`--header-bg`) with the flowing accent-family
  hairline under it.
- **The monospace `s0L` wordmark** with its accent → accent-2 gradient and glow.
- **Accent-edge cards** — a 3px left bar in the implementation-type color;
  hover glows in that same color. Dashboard deal tiles use the deal's practice
  color instead.
- **The deal tile** — practice-tinted glass: the practice hue blooms in the
  top-right corner and rims the top edge; a generative **deal glyph** (a square
  quadtree mosaic seeded by the deal, finer for bigger TCV) glows behind the
  content; a 2px meter on the bottom edge shows TCV against the deals on screen
  (log scale). Layout: the status line top-left (status | implementation type,
  quiet sentence-case text split by a short `--divider-fade` hairline) closed by
  a 1px rule fading out of the practice hue — the tile's two sanctioned lines
  (the user's call, 2026-10-28)
  and the client's own logo top-right — a small add-on next to the name,
  looked up by the backend (Wikidata, else the client's website icon) and
  served from the local cache; only sure matches and logos a person approved
  show; the client as the headline in the TCV's treatment
  (medium weight, fading into the practice hue with a soft glow), always shown
  whole: a long name shrinks to fit (`FitText`, down to 12px) and only then wraps; and
  the description (without the client's name when it repeats it, parts split by
  practice-hue dots); TCV bottom-left, then the lead solutioner when it isn't you
  behind a short hairline (in the bottom line, so every tile is the same height), and
  the **business app** bottom-right — the app's own logo (`<vendor>.svg`, `.png`
  or `.webp` in `assets/practice-logos/`, picked up automatically) straight on the glass.
  Single-app practices (SAP, Oracle) always show their app; multi-app practices
  show the app the deal's description names, else a lucide practice emblem with
  its short name on a tonal chip. Neither has a frame (removed 2026-10-28).
- **The GSSM sync chip** — syncing · synced · failed, always visible truth
  about the deal record.

## The blocks (`frontend/src/shared/ui/`)

If a block exists here, don't build your own — use it and let the tokens
dress it:

| Block | File | Notes |
|---|---|---|
| Modal shell | `Modal.jsx` | glass, Escape handling, sizes |
| Confirm dialog | `ConfirmDialog.jsx` | promise-based confirm |
| Loaders | `Loader.jsx` | `Loader.Page` and `Loader.Module` |
| Form field | `FormField.jsx` | label + input + validation slot |
| Timeline bar | `TimelineBar.jsx` | phase segments from the shared palette |
| Workspace tabs | `WorkspaceTabs.jsx` | the module-level tab row |
| Error boundary / lazy gate | `ErrorBoundary.jsx`, `LazyGate.jsx` | shell plumbing |
| Tooltip | `Tip.jsx` | Radix-based, dark glass |
| Appearance panel | `ThemeSwitcher.jsx` | theme · accent · font; owns the palettes |

Same promotion bar as the architecture doc: a component becomes a block the
moment a **second** feature needs it — not before.

## The chrome templates (`components.css`, adopted 2026-07-14)

CSS-only templates for app chrome. **If one fits, use it — never draw a
one-off control:**

| Template | Class | What it is |
|---|---|---|
| Command button | `.cmd-btn` (+ `--primary`) | Chrome actions (header, toolbars): square tonal block, sentence-case label, rises with an accent halo on hover. One `--primary` per surface, max |
| Ribbon | `.ribbon` + `.ribbon-cell` | THE column-header/axis strip: blue-tinted wash (no lines), uppercase micro type, 30px rhythm. Used by the timeline axis; use it for any tabular header row |
| Data-table header | `.pm-table th` | A recessed bar (`--table-head-bg`, darker than the rows) with small-caps micro labels and column rules. The sorted column gets an accent label and a 2px accent underline |
| Chip | `.chip` (+ `--interactive`, `--active`, `.chip-swatch`) | Legends, filters, brushes, counts. Square tonal chip on `--control-fill`, micro type. Active = accent wash + ring |
| Toolbar strip | `.toolbar-strip` (+ `-group`, `-label`, `-hint`) | The control row above data: groups separated by spacing, uppercase group labels, right-aligned hint |
| Segmented toggle | `.header-toggle-group` / `.header-toggle` | Exclusive choice in the header: icon-only items, no track and no box. The selected one is an accent glyph with a short glowing underline. Label and count live in the tooltip and `aria-label` |

The header is icon-only: every action is a 34px square icon with a `Tip` and an
`aria-label`, and icons never sit in a box: hover lifts and lights the glyph
(`drop-shadow`), and open or selected states turn it accent. The groups (deal
list · layout · search & appearance) are split by a short fading vertical
hairline (`.header-divider`, background `--divider-fade`), the header's one sanctioned divider. The one accent
fill is the `+` (New deal, `.header-new-deal`). The layout group is Tile view ·
Metrics view · TT Exec. The TT Exec view covers the whole team, active and archived,
so the deal-list toggles step aside there: a stat line, a Month · Quarter · Half · Year
chip strip with a period stepper, five KPI glass tiles (deals added, submitted, won,
lost, win rate, each with the previous period beneath), the last six periods as a
data table, open deals by status, practice and lead solutioner as rows with a thin bar
in the status colour, practice hue or accent, and the deals waiting for assignment
as the list view's own table, search, Group, Filter and Rows (`ArrangeToolbar` + `useArrangement`,
shared with the dashboard) with its people pickers (TT Execs only), under a Notices panel with a send field
(TT Execs only; disabled for everyone else). Nothing there lifts. On the Tile and Metrics views (not the
TT Exec view, not inside a deal) notices show in the middle of the header
(`NoticeBanner`, between the left and right groups, which share the rest of the row): an accent-washed
bar with a megaphone, one notice at a time with its date, turning every 6 s; hovering opens
the latest five with dates and author on solid `--surface` (it sits in the blurred header), and
the chevron pins the whole list open. monday sits between Appearance and Settings as its own logo with a
round status dot (`.header-monday-dot`): muted = not connected (a click starts the
sign-in), accent = signing in or syncing, `--status-success` = connected (a click
syncs). The tooltip names who is signed in and when the board last synced.

Under the pipeline band, a toolbar strip arranges the deals. **Group** (None ·
Solutioner · Status · Practice · TCV; Solutioner only in the team view, which opens on it) works in Tile view and the list alike:
each group is one summary row (name, deal count, TCV and a thin accent bar of its TCV
against the biggest group's) that opens onto its tiles or rows, never a cloud of chips.
Groups run A–Z (Unassigned, No status and No practice last); TCV bands run biggest first.
Status and practice groups lead with their status colour or practice hue as a dot.
The list adds **Filter** (status, practice, implementation type, solutioner, close
quarter, sales stage) as tonal selects on `--control-fill`, accent-washed when set,
and **Rows** (25 · 50 · 100) when ungrouped. Group, Filter, Rows and the open groups are remembered
on this computer (`s0l-arrange-dashboard`, `s0l-arrange-exec-waiting`; the TT Exec period in
`s0l-exec-period`), the search is not, and a remembered filter value the deals on screen no longer
have is ignored rather than emptying the list. On deals linked to monday, the Lead SSC,
TT Executive, SC 2 and SC 3 cells are quiet pickers (`AssignCell`) for TT Execs (everyone
else sees the plain name): the name, a chevron
on the row's hover, a tonal block on `--control-fill` under the cursor, and a heavy-glass
menu of the names that board column already has (the current one in accent). Picking a
name asks first (`ConfirmDialog`), then changes the board.

Radix note: the `all: unset` resets for Radix primitives are **scoped with
`:not()`** to keep them from nuking these templates — components.css loads
after layout.css, so an unscoped reset wins by source order. Extend the
`:not()` lists when a new templated class lands on a Radix primitive.

## Accessibility floor

- `:focus-visible` = 2px outline in `--interactive-focus` (the accent), 2px offset. Never remove it. It
  follows each element's own corners — never set a radius in the focus rule.
- Text contrast ≥ 4.5:1 against the *effective* (post-blur) surface.
- All looping motion honors `prefers-reduced-motion`.
- Hit targets ≥ 32×32px in the header and rails.

## Don't

- ❌ Round a corner, or add an outline or divider line between sections — the seamless law. (Hover highlights and input edges are the exceptions.)
- ❌ Hand-roll a hover — use the liquid tokens.
- ❌ Lift a surface that holds inputs or dropdowns — highlight it instead.
- ❌ Declare `:root` tokens or restyle shared classes (`.btn`, `.chip`…) from a module stylesheet — scope module CSS under the room's root class (GSSM: `.gssm-module`), or it leaks into every room once loaded.
- ❌ Hardcode a theme color — every color follows the palette or the user's accent. Check Obsidian, Frost and a light accent before shipping.
- ❌ Invent a color, size, shadow, or duration inline.
- ❌ Animate layout properties.
- ❌ Flat-fill a background the aurora should shine through.
- ❌ Re-blur nested glass.
