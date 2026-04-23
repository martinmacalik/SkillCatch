import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthProvider'

export type ThemePreference = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: ThemePreference
  setTheme: (t: ThemePreference) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyDarkClass(effective: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', effective === 'dark')
}

function resolveEffective(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [theme, setThemeState] = useState<ThemePreference>('system')

  useEffect(() => {
    if (!session?.user) {
      applyDarkClass(resolveEffective('system'))
      return
    }
    supabase
      .from('profiles')
      .select('theme')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        const t = (data?.theme ?? 'system') as ThemePreference
        setThemeState(t)
        applyDarkClass(resolveEffective(t))
      })
  }, [session])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyDarkClass(resolveEffective('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback(
    async (t: ThemePreference) => {
      setThemeState(t)
      applyDarkClass(resolveEffective(t))
      if (session?.user) {
        await supabase.from('profiles').update({ theme: t }).eq('id', session.user.id)
      }
    },
    [session],
  )

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
