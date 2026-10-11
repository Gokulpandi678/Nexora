'use client'

import { useEffect } from 'react'
import { SWRConfig } from 'swr'
import { useUserStore } from '@/lib/store'
import { fetcher } from '@/hooks/api'

export default function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  const theme = useUserStore(s => s.theme)
  const uiStyle = useUserStore(s => s.uiStyle)
  // Until saved preferences are loaded, the inline script in app/layout.tsx has already applied them
  const hydrated = useUserStore(s => s.hydrated)

  useEffect(() => {
    void useUserStore.persist.rehydrate()
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches))
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme, hydrated])

  useEffect(() => {
    if (hydrated) document.documentElement.setAttribute('data-style', uiStyle)
  }, [uiStyle, hydrated])

  return <SWRConfig value={{ fetcher, shouldRetryOnError: false }}>{children}</SWRConfig>
}
