'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

/**
 * Offline theme switcher (dark / light) without external dependencies.
 *
 * The initial theme is applied before hydration by a tiny inline script in
 * layout.tsx (no flash), then this provider takes over: it persists the choice
 * to localStorage and toggles the `.dark` class on <html>, which drives all
 * shadcn/ui tokens in globals.css.
 *
 * Implemented as a tiny external store + useSyncExternalStore so no state is
 * set synchronously inside effects (React 19 compiler rules).
 */

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'humnote-theme'
export const DEFAULT_THEME: Theme = 'dark'

const THEME_COLORS: Record<Theme, string> = {
  dark: '#0a0a0b',
  light: '#f7f7f8',
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', THEME_COLORS[theme])
  })
}

function detectTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return DEFAULT_THEME
  }
}

let currentTheme: Theme = DEFAULT_THEME
let initialized = false
const listeners = new Set<() => void>()

function ensureInit() {
  if (!initialized && typeof window !== 'undefined') {
    currentTheme = detectTheme()
    initialized = true
  }
}

const themeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  get(): Theme {
    ensureInit()
    return currentTheme
  },
  set(next: Theme) {
    ensureInit()
    currentTheme = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage unavailable */
    }
    for (const l of listeners) l()
  },
}

const noopSubscribe = () => () => undefined

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server + hydration render the default; the real value appears right after mount.
  const storeTheme = useSyncExternalStore(themeStore.subscribe, themeStore.get, () => DEFAULT_THEME)
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const theme = mounted ? storeTheme : DEFAULT_THEME

  // Sync the DOM with the resolved theme (class + color-scheme + meta color).
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => themeStore.set(next), [])
  const toggle = useCallback(() => {
    themeStore.set(themeStore.get() === 'dark' ? 'light' : 'dark')
  }, [])

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

/** Pre-hydration bootstrap: applies the stored theme before first paint. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t?(t==='dark'):!window.matchMedia('(prefers-color-scheme: light)').matches;var e=document.documentElement;if(d){e.classList.add('dark')}else{e.classList.remove('dark')}e.style.colorScheme=d?'dark':'light'}catch(x){}})()`
