import { useEffect } from 'react'
import { ThemeProviderContext } from '@/contexts/ThemeProviderContext'
import { useSettingsStore } from '@/stores/settings'

type ThemeProviderProps = {
  children: React.ReactNode
}

/**
 * Component that provides the theme state and setter function to its children.
 * Synchronizes both classList ('light' | 'dark') and HeroUI v3's data-theme attribute.
 */
export default function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const theme = useSettingsStore.use.theme()
  const setTheme = useSettingsStore.use.setTheme()

  useEffect(() => {
    const root = window.document.documentElement
    const applyResolvedTheme = (resolved: 'light' | 'dark') => {
      root.classList.remove('light', 'dark')
      root.classList.add(resolved)
      root.setAttribute('data-theme', resolved)
    }

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = (e: MediaQueryListEvent) => {
        applyResolvedTheme(e.matches ? 'dark' : 'light')
      }

      applyResolvedTheme(mediaQuery.matches ? 'dark' : 'light')
      mediaQuery.addEventListener('change', handleChange)

      return () => mediaQuery.removeEventListener('change', handleChange)
    } else {
      applyResolvedTheme(theme)
    }
  }, [theme])

  const value = {
    theme,
    setTheme
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}
