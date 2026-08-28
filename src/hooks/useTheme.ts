import { useEffect, useSyncExternalStore } from 'react'

const KEY = 'vocab-theme'
type Theme = 'light' | 'dark'

function getSnapshot(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

let listeners = new Set<() => void>()
function emit() { listeners.forEach(l => l()) }

function setTheme(next: Theme) {
  const root = document.documentElement
  if (next === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
  try { localStorage.setItem(KEY, next) } catch {}
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function useTheme(): [Theme, (t: Theme) => void, () => void] {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'light' as Theme)
  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark')
  return [theme, setTheme, toggle]
}

/** Apply persisted theme BEFORE React mounts (to avoid FOUC) */
export const ThemeBootstrap = {
  apply() {
    if (typeof document === 'undefined') return
    try {
      const saved = localStorage.getItem(KEY) as Theme | null
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
      const shouldDark = saved === 'dark' || (!saved && prefersDark)
      if (shouldDark) document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
    } catch {
      /* ignore */
    }
  },
}
