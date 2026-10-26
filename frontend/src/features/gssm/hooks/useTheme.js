import { useCallback, useEffect, useState } from 'react'

const THEMES = ['carbon', 'midnight', 'forest', 'sandstone', 'slate']
const STORAGE_KEY = 'gssm-theme'

const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && THEMES.includes(stored)) return stored
  } catch { /* ignore */ }
  return 'carbon'
}

/**
 * GSSM theme hook — scoped to a container element (via ref) so it does not
 * interfere with the s0L shell theme on <html>.
 *
 * The container gets a `data-gssm-theme` attribute. CSS selectors key off this
 * attribute instead of `[data-theme]` on `:root`.
 */
export default function useTheme(containerRef) {
  const [theme, setThemeState] = useState(getInitialTheme)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  const setTheme = useCallback((t) => {
    if (THEMES.includes(t)) setThemeState(t)
  }, [])

  return { theme, setTheme, themes: THEMES }
}
