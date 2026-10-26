import { Sun, Moon, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import Tip from './Tip'

const THEMES = [
  { id: 'light', label: 'Arctic Glass', icon: Sun },
  { id: 'dark', label: 'Obsidian', icon: Moon },
  { id: 'midnight', label: 'Midnight', icon: Sparkles },
]

const STORAGE_KEY = 's0l-theme'

function getInitialTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(themeId) {
  const root = document.documentElement
  root.classList.add('theme-transitioning')
  if (themeId === 'light') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', themeId)
  }
  try { localStorage.setItem(STORAGE_KEY, themeId) } catch { /* noop */ }
  requestAnimationFrame(() => {
    setTimeout(() => root.classList.remove('theme-transitioning'), 450)
  })
}

export function initTheme() {
  const saved = getInitialTheme()
  if (saved && saved !== 'light') {
    document.documentElement.setAttribute('data-theme', saved)
  }
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const cycle = () => {
    const idx = THEMES.findIndex(t => t.id === theme)
    const next = THEMES[(idx + 1) % THEMES.length]
    setTheme(next.id)
  }

  const current = THEMES.find(t => t.id === theme) || THEMES[0]
  const Icon = current.icon

  return (
    <Tip content={`Theme: ${current.label}`}>
      <button
        className="header-action-btn theme-switcher-btn"
        onClick={cycle}
        aria-label={`Switch theme (current: ${current.label})`}
      >
        <Icon size={15} />
      </button>
    </Tip>
  )
}
