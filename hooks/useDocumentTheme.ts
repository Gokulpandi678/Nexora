'use client'

import { useEffect, useState } from 'react'

/**
 * Re-renders whenever <html> switches light/dark or UI style, and exposes the resolved
 * value of any design token (RGB triplet → `rgb(r g b)`). For SVG/canvas that cannot use CSS classes.
 */
export function useDocumentTheme(): { dark: boolean; style: string; token: (name: string) => string } {
  const [state, setState] = useState({ dark: false, style: '', version: 0 })

  useEffect(() => {
    const el = document.documentElement
    const update = (): void =>
      setState(s => ({ dark: el.classList.contains('dark'), style: el.getAttribute('data-style') ?? '', version: s.version + 1 }))
    update()
    const observer = new MutationObserver(update)
    observer.observe(el, { attributes: true, attributeFilter: ['class', 'data-style'] })
    return () => observer.disconnect()
  }, [])

  const token = (name: string): string => {
    if (typeof window === 'undefined') return 'currentColor'
    const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
    return raw ? `rgb(${raw})` : 'currentColor'
  }

  return { dark: state.dark, style: state.style, token }
}
