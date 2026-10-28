import { Check, Palette } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Tip from './Tip'
import { cx } from '../utils/cx'

// A theme is a palette; base.css derives every other token from these colors + the accent.
const THEMES = [
  { id: 'obsidian', label: 'Obsidian', mode: 'dark', canvas: '#08090d', canvas2: '#10131b', surface: '#141821', ink: '#eceff5', accent: '#4f7dff' },
  { id: 'midnight', label: 'Midnight', mode: 'dark', canvas: '#040916', canvas2: '#0a1530', surface: '#0d1730', ink: '#e4ebf8', accent: '#2ec5ff' },
  { id: 'nebula', label: 'Nebula', mode: 'dark', canvas: '#0a0713', canvas2: '#170f2a', surface: '#181228', ink: '#ede7f8', accent: '#a77bff' },
  { id: 'aurora', label: 'Aurora', mode: 'dark', canvas: '#040d0b', canvas2: '#0a1c17', surface: '#0f1e1a', ink: '#e4f3ee', accent: '#2fe0a4' },
  { id: 'ember', label: 'Ember', mode: 'dark', canvas: '#0d0a08', canvas2: '#1c130d', surface: '#1b1512', ink: '#f4ede7', accent: '#ff8040' },
  { id: 'frost', label: 'Frost', mode: 'light', canvas: '#e4eaf4', canvas2: '#f5f8fc', surface: '#ffffff', ink: '#0c1424', accent: '#2563eb' },
]

const ACCENTS = ['#4f7dff', '#2ec5ff', '#2fe0a4', '#a3e635', '#ffc53d', '#ff8040', '#ff5a7a', '#e66cff', '#a77bff', '#e6e9ef']
const RAINBOW = `conic-gradient(${ACCENTS.slice(0, 9).join(', ')}, ${ACCENTS[0]})`

// Bundled in main.jsx — never loaded from a CDN
const FONTS = [
  { id: 'geist', label: 'Geist', family: "'Geist Variable'" },
  { id: 'ibm-plex-sans', label: 'IBM Plex Sans', family: "'IBM Plex Sans Variable'" },
  { id: 'inter', label: 'Inter', family: "'Inter Variable'" },
  { id: 'manrope', label: 'Manrope', family: "'Manrope Variable'" },
  { id: 'outfit', label: 'Outfit', family: "'Outfit Variable'" },
  { id: 'plus-jakarta', label: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans Variable'" },
  { id: 'space-grotesk', label: 'Space Grotesk', family: "'Space Grotesk Variable'" },
  { id: 'sora', label: 'Sora', family: "'Sora Variable'" },
]

const STORAGE_KEY = 's0l-appearance'
const LEGACY_KEY = 's0l-theme'
// v6 auto-saved 'light' as its default, so only deliberate dark picks carry over
const LEGACY_THEMES = { dark: 'obsidian', midnight: 'midnight' }
const DEFAULTS = { theme: 'obsidian', accent: null, font: 'geist' }
const HEX = /^#[0-9a-f]{6}$/i

function loadAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved) {
      return {
        theme: THEMES.some(t => t.id === saved.theme) ? saved.theme : DEFAULTS.theme,
        accent: HEX.test(saved.accent) ? saved.accent : null,
        font: FONTS.some(f => f.id === saved.font) ? saved.font : DEFAULTS.font,
      }
    }
    const legacy = LEGACY_THEMES[localStorage.getItem(LEGACY_KEY)]
    if (legacy) return { ...DEFAULTS, theme: legacy }
  } catch { /* storage blocked or corrupt — use defaults */ }
  return DEFAULTS
}

// Text on an accent fill: dark on light accents, white otherwise (WCAG relative luminance)
function inkOn(hex) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#0b0d12' : '#ffffff'
}

function applyAppearance({ theme, accent, font }, animate = false) {
  const t = THEMES.find(x => x.id === theme) || THEMES[0]
  const f = FONTS.find(x => x.id === font) || FONTS[0]
  const a = accent || t.accent
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-transitioning')
    setTimeout(() => root.classList.remove('theme-transitioning'), 450)
  }
  root.dataset.theme = t.id
  root.dataset.mode = t.mode
  const vars = {
    '--canvas': t.canvas,
    '--canvas-2': t.canvas2,
    '--surface': t.surface,
    '--ink': t.ink,
    '--accent': a,
    '--on-accent': inkOn(a),
    '--font-ui': f.family,
  }
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
  try {
    // `mode` lets index.html paint the right background before any JS module loads
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: t.id, accent, font: f.id, mode: t.mode }))
  } catch { /* storage blocked — still applies for this session */ }
}

export function initTheme() {
  applyAppearance(loadAppearance())
}

function Swatch({ color, active, label, onClick }) {
  return (
    <button
      className={cx('appearance-swatch', active && 'is-active')}
      style={{ '--swatch': color, '--swatch-ink': inkOn(color) }}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
    >
      {active && <Check size={12} />}
    </button>
  )
}

export default function ThemeSwitcher() {
  const [appearance, setAppearance] = useState(loadAppearance)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const update = (patch, animate = true) => {
    const next = { ...appearance, ...patch }
    setAppearance(next)
    applyAppearance(next, animate)
  }

  const theme = THEMES.find(t => t.id === appearance.theme) || THEMES[0]
  const accent = appearance.accent || theme.accent
  const customAccent = appearance.accent && !ACCENTS.includes(appearance.accent) ? appearance.accent : null

  return (
    <div className="appearance" ref={rootRef}>
      <Tip content="Appearance">
        <button
          ref={buttonRef}
          className={cx('header-action-btn', open && 'is-open')}
          onClick={() => setOpen(o => !o)}
          aria-label="Appearance"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Palette size={15} />
        </button>
      </Tip>

      {open && (
        <div className="appearance-panel" role="dialog" aria-label="Appearance">
          <div className="appearance-title">Appearance</div>

          <section>
            <div className="appearance-label">Theme</div>
            <div className="appearance-themes">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  className={cx('appearance-theme', t.id === theme.id && 'is-active')}
                  aria-pressed={t.id === theme.id}
                  onClick={() => update({ theme: t.id, accent: null })}
                  style={{
                    '--tile-canvas': t.canvas,
                    '--tile-canvas-2': t.canvas2,
                    '--tile-surface': t.surface,
                    '--tile-ink': t.ink,
                    '--tile-accent': t.accent,
                  }}
                >
                  <span className="appearance-theme-preview" aria-hidden="true">
                    <span className="appearance-theme-bar" />
                    <span className="appearance-theme-card" />
                    <span className="appearance-theme-dot" />
                  </span>
                  <span className="appearance-theme-name">
                    {t.label}
                    {t.id === theme.id && <Check size={12} />}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="appearance-label">Accent</div>
            <div className="appearance-accents">
              <Swatch
                color={theme.accent}
                active={!appearance.accent}
                label={`${theme.label} default`}
                onClick={() => update({ accent: null })}
              />
              {ACCENTS.filter(c => c !== theme.accent).map(c => (
                <Swatch key={c} color={c} active={appearance.accent === c} label={c} onClick={() => update({ accent: c })} />
              ))}
              <label
                className={cx('appearance-swatch', 'appearance-swatch--custom', customAccent && 'is-active')}
                style={customAccent
                  ? { '--swatch': customAccent, '--swatch-ink': inkOn(customAccent) }
                  : { '--swatch': 'transparent', backgroundImage: RAINBOW }}
                title="Custom color"
              >
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => update({ accent: e.target.value }, false)}
                  aria-label="Custom accent color"
                />
                {customAccent && <Check size={12} />}
              </label>
            </div>
          </section>

          <section>
            <div className="appearance-label">Font</div>
            <div className="appearance-fonts">
              {FONTS.map(f => (
                <button
                  key={f.id}
                  className={cx('appearance-font', f.id === appearance.font && 'is-active')}
                  aria-pressed={f.id === appearance.font}
                  style={{ fontFamily: f.family }}
                  onClick={() => update({ font: f.id })}
                >
                  <span>{f.label}</span>
                  <span className="appearance-font-sample">$1,284.50</span>
                </button>
              ))}
            </div>
          </section>

          <div className="appearance-foot">
            <span className="appearance-hint">Saved on this device</span>
            <button className="cmd-btn" onClick={() => update(DEFAULTS)}>Reset</button>
          </div>
        </div>
      )}
    </div>
  )
}
