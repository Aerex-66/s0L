# s0L — How The Interface Looks

*The companion to [UI_ARCHITECTURE.md](UI_ARCHITECTURE.md). That doc explains
the code layers; this one explains the look. Last updated: 2026-10-26.*

---

## The idea in one sentence

The app has **one set of tokens** (colors, type, glass, shadows, motion) and
**three themes** — every surface wears the tokens, and the theme decides what
the tokens mean. No component ever invents its own value.

This is **luminous seamless glass with IBM roots**: bundled IBM Plex Sans/Mono
and IBM Blue carry the identity; square, outline-free crystal surfaces
floating over a luminous pearl-ice field carry the feel. Nothing is boxed in
and nothing is rounded — surfaces separate by tone, spacing, soft depth and
subtle ambient glow, and rise to meet the cursor.

## The three themes

| Theme | Attr | Feels like |
|---|---|---|
| **Arctic Glass** *(default)* | *(none)* | Luminous pearl-ice mesh, translucent crystal glass, ink text |
| **Obsidian** | `data-theme="dark"` | Deep navy, outline-free frosted obsidian glass |
| **Midnight** | `data-theme="midnight"` | Ultra-dark, neon blue ambient glows |

Building something new? Build it in **Arctic Glass first** — light is the
personality of this app, dark is an option. Then verify both dark themes.
A fourth theme is a token-block override, nothing more; if it needs
component CSS, it's designed wrong.

## The seamless law (adopted 2026-10-21 — refined 2026-10-26 as "Luminous Seamless")

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
  Kept on purpose: input field edges (affordance), data-row separators and
  the timeline month grid (reading data).
- **Everything interactive answers the cursor** — one language, all tokens:
  - *Raise* (free-standing cards and tiles): `transform: var(--lift)`,
    `box-shadow: var(--shadow-raise)`, `border-color: var(--hover-border)`.
    A new card just adds `.liquid-raise`.
  - *Highlight* (rows, tabs, and any card holding inputs or dropdowns):
    `--hover-wash` / `--hover-ring` / `--hover-glow` only. **Never move
    something the user is typing into** — a transform also traps dropdowns
    in a new stacking context.
  - Primary buttons (`.btn-primary`, `.cmd-btn--primary`, `.header-new-deal`)
    are flat-luminous `var(--ibm-blue)` with a subtle diffused blue halo glow
    (never 3-stop convex bevel gradients or diagonal sheen sweeps).
  - Buttons and chips lift `--lift-sm`. All of it rides
    `transition: var(--transition-liquid)`.
- **Glass tiers, one blur per stack:** light surfaces `blur(14px)`
  (`--glass-blur-light`) · standard panels `blur(24px)` (`--glass-blur`) ·
  modals and the header `blur(40px)` (`--glass-blur-heavy`). Anything nested
  inside glass is translucent but **never re-blurs**.
- **Glass is luminous and translucent, never murky or flat paper.** In Arctic
  Glass, surfaces sit over a bright pearl-ice mesh (`#f2f6fc` → `#eaf0fa`)
  with whisper-soft inner top luminance (`inset 0 1px 0 rgba(255,255,255,0.72)`)
  and soft blue-cast ambient depth.
- **Every glass surface is three layers + one light:** translucent fill →
  backdrop blur+saturate → soft blue-cast depth (`--shadow-glass*`) — plus
  an **ambient accent field** (`--ambient-field`, accent light pooling
  inside the surface) and subtle grain. That's what `.glass-panel` is; use it.
- **Glass needs something to refract.** The aurora (`body::before` — four
  blurred color fields drifting on a 90s loop) and the film grain
  (`body::after`) stay visible behind every page. Never flat-fill the body.
  ⚠ One hard-won lesson: a single invalid gradient in a `background-image`
  list silently voids the ENTIRE list — `radial-gradient(circle 40% at …)`
  is invalid (a circle radius can't be a percentage) and once killed the
  whole mesh. Use `radial-gradient(40% 40% at …)`.
- **Glows are additive and subtle** — a `--glow-*` composes *with* a shadow,
  never replaces one.
- **The header is theme-aware translucent crystal** (`--header-bg` /
  `--header-text`): airy frosted crystal in Arctic Glass, deep frosted
  obsidian in Obsidian and Midnight, with the flowing blue→cyan→purple
  luminous hairline under it.

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
   `color-mix(in srgb, var(--x) N%, transparent)`.
4. **Fields and modals have exactly one source of truth each:**
   every input/select/textarea takes `--field-bg` / `--field-border`
   (crisp translucent white in Arctic Glass, dark translucent in dark themes,
   with a subtle blue halo on focus and no sunken inset shadow), and every
   modal/dialog shell takes `--modal-bg` / `--modal-border` (transparent
   theme-tinted glass, heavy blur). Never restyle a field background or a
   modal surface per component — size and layout are the only per-modal
   overrides allowed.
5. **Domain colors:** implementation types ride `--impl-color`; SAP Activate
   phases come from [shared/domain_constants.json](shared/domain_constants.json)
   and are identical in Home timelines, GSSM sheets, and exported PPTX
   Gantt bars. Never restyle a phase locally.
6. **Raw hex/rgba:** only inside `base.css` token definitions. Inline color
   literals in components are legacy — convert on touch.

## The brand words (non-negotiable)

| # | Law | Why |
|---|-----|-----|
| 1 | **IBM Blue `#0f62fe` is THE accent.** Cyan and purple are supporting cast (gradients, glows, aurora). No new accent hues. | One brand color, unmistakable |
| 2 | **IBM Plex Sans / Plex Mono**, bundled locally from `@ibm/plex-sans` and `@ibm/plex-mono` in `main.jsx`. **No CDN fonts, ever.** | Brand + air-gapped policy |
| 3 | **Square & seamless** (the seamless law). Square corners, no outlines or divider lines, tonal controls, flat-luminous primary buttons. | Clean and continuous — rounded edges and boxed-in Carbon panels were both retired 2026-10-21 |
| 4 | **Light-first.** Arctic Glass is the default and the reference. | This is a daylight working tool |
| 5 | **No external assets of any kind.** All icons come from `lucide-react` via `shared/ui/Icons.jsx` (never raw emoji). | Air-gapped policy + visual consistency |

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
- **The liquid raise** — cards float up into a soft blue halo under the
  cursor; square buttons glow.
- **The film grain** — kills banding on large gradients.
- **The translucent crystal header** (`--header-bg`) with the flowing
  blue→cyan→purple hairline under it.
- **The monospace `s0L` wordmark** with its soft blue-cyan gradient and glow.
- **Accent-edge cards** — a 3px left bar in the implementation-type color;
  hover glows in that same color.
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

Same promotion bar as the architecture doc: a component becomes a block the
moment a **second** feature needs it — not before.

## The chrome templates (`components.css`, adopted 2026-07-14)

CSS-only templates for app chrome. **If one fits, use it — never draw a
one-off control:**

| Template | Class | What it is |
|---|---|---|
| Command button | `.cmd-btn` (+ `--primary`) | Chrome actions (header, toolbars): square tonal block, sentence-case label, rises with an accent halo on hover. One `--primary` per surface, max |
| Ribbon | `.ribbon` + `.ribbon-cell` | THE column-header/axis strip: blue-tinted wash (no lines), uppercase micro type, 30px rhythm. Used by the timeline axis; use it for any tabular header row |
| Chip | `.chip` (+ `--interactive`, `--active`, `.chip-swatch`) | Legends, filters, brushes, counts. Square tonal chip on `--control-fill`, micro type. Active = accent wash + ring |
| Toolbar strip | `.toolbar-strip` (+ `-group`, `-label`, `-hint`) | The control row above data: groups separated by spacing, uppercase group labels, right-aligned hint |
| Segmented toggle | `.header-toggle-group` / `.header-toggle` | Exclusive choice in the header: an unframed track; the active segment is a lit block |

Radix note: the `all: unset` resets for Radix primitives are **scoped with
`:not()`** to keep them from nuking these templates — components.css loads
after layout.css, so an unscoped reset wins by source order. Extend the
`:not()` lists when a new templated class lands on a Radix primitive.

## Accessibility floor

- `:focus-visible` = 2px IBM-blue outline, 2px offset. Never remove it. It
  follows each element's own corners — never set a radius in the focus rule.
- Text contrast ≥ 4.5:1 against the *effective* (post-blur) surface.
- All looping motion honors `prefers-reduced-motion`.
- Hit targets ≥ 32×32px in the header and rails.

## Don't

- ❌ Round a corner, or add an outline or divider line between sections — the seamless law. (Hover highlights and input edges are the exceptions.)
- ❌ Hand-roll a hover — use the liquid tokens.
- ❌ Lift a surface that holds inputs or dropdowns — highlight it instead.
- ❌ Declare `:root` tokens or restyle shared classes (`.btn`, `.chip`…) from a module stylesheet — scope module CSS under the room's root class (GSSM: `.gssm-module`), or it leaks into every room once loaded.
- ❌ Default new UI to dark styling — light-first, always.
- ❌ Invent a color, size, shadow, or duration inline.
- ❌ Animate layout properties.
- ❌ Flat-fill a background the aurora should shine through.
- ❌ Re-blur nested glass.
