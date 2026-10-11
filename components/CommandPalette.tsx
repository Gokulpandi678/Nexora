'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  BarChart3, CornerDownLeft, LayoutDashboard, ListTree, Monitor, Moon, Palette, Plus, Search, Settings, Sun
} from 'lucide-react'
import { SeverityBadge } from '@/components/incident-badges'
import { fetcher } from '@/hooks/api'
import { useIncidentStats } from '@/hooks/useIncidents'
import { useUIStore, useUserStore } from '@/lib/store'
import { UI_STYLES, UI_STYLE_META } from '@/lib/ui-styles'
import type { IncidentListItem, IncidentRef, Paginated } from '@/lib/types'
import { cn, timeAgo } from '@/lib/utils'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  keywords?: string
  icon: React.ReactNode
  run: () => void
}

/** ⌘K / Ctrl+K: jump anywhere, search incidents, switch style or theme — all from the keyboard. */
export default function CommandPalette(): React.JSX.Element {
  const { paletteOpen: open, setPaletteOpen: setOpen } = useUIStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]')
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!useUIStore.getState().paletteOpen)
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="ui-pop fixed left-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          {open && <PaletteBody close={() => setOpen(false)} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function PaletteBody({ close }: { close: () => void }): React.JSX.Element {
  const router = useRouter()
  const { theme, setTheme, uiStyle, setUiStyle } = useUserStore()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const { data: stats } = useIncidentStats()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 180)
    return () => clearTimeout(t)
  }, [query])

  const { data: found, isLoading } = useSWR<Paginated<IncidentListItem>>(
    debounced ? `/api/incidents/search?q=${encodeURIComponent(debounced)}&pageSize=6` : null,
    fetcher,
    { keepPreviousData: true }
  )

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => (): void => { close(); router.push(href) }
    const q = query.trim().toLowerCase()

    const base: Command[] = [
      { id: 'new', group: 'Actions', label: 'Report an incident', hint: 'Start a new report', keywords: 'create new add', icon: <Plus />, run: go('/incidents/new') },
      { id: 'dash', group: 'Go to', label: 'Dashboard', icon: <LayoutDashboard />, run: go('/dashboard') },
      { id: 'list', group: 'Go to', label: 'All incidents', keywords: 'browse list', icon: <ListTree />, run: go('/incidents') },
      { id: 'analytics', group: 'Go to', label: 'Analytics', keywords: 'patterns charts trends', icon: <BarChart3 />, run: go('/analytics') },
      { id: 'settings', group: 'Go to', label: 'Settings', keywords: 'profile preferences', icon: <Settings />, run: go('/settings') },
      ...UI_STYLES.map<Command>(id => ({
        id: `style-${id}`,
        group: 'Appearance',
        label: `${UI_STYLE_META[id].name} style`,
        hint: uiStyle === id ? 'Current' : UI_STYLE_META[id].tagline,
        keywords: 'theme look skin style',
        icon: <Palette />,
        run: () => setUiStyle(id)
      })),
      { id: 'light', group: 'Appearance', label: 'Light mode', hint: theme === 'light' ? 'Current' : undefined, keywords: 'theme', icon: <Sun />, run: () => setTheme('light') },
      { id: 'dark', group: 'Appearance', label: 'Dark mode', hint: theme === 'dark' ? 'Current' : undefined, keywords: 'theme night', icon: <Moon />, run: () => setTheme('dark') },
      { id: 'system', group: 'Appearance', label: 'Match system', hint: theme === 'system' ? 'Current' : undefined, keywords: 'theme auto', icon: <Monitor />, run: () => setTheme('system') }
    ]

    const matching = q ? base.filter(c => `${c.label} ${c.keywords ?? ''} ${c.group}`.toLowerCase().includes(q)) : base

    const incidentCmd = (i: IncidentRef, group: string): Command => ({
      id: `inc-${i.id}`,
      group,
      label: i.title,
      hint: `${i.createdBy} · ${timeAgo(i.createdAt)}`,
      icon: <SeverityBadge severity={i.severity} />,
      run: go(`/incidents/${i.id}`)
    })

    const incidents = q
      ? (found?.items ?? []).map(i => incidentCmd(i, 'Incidents'))
      : (stats?.recent ?? []).slice(0, 4).map(i => incidentCmd(i, 'Recent incidents'))

    const searchAll: Command[] = q
      ? [{ id: 'search-all', group: 'Incidents', label: `Search all incidents for “${query.trim()}”`, icon: <Search />, run: go(`/incidents?q=${encodeURIComponent(query.trim())}`) }]
      : []

    return [...incidents, ...searchAll, ...matching]
  }, [query, found, stats, close, router, theme, setTheme, uiStyle, setUiStyle])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % Math.max(1, commands.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + commands.length) % Math.max(1, commands.length)) }
    else if (e.key === 'Enter') { e.preventDefault(); commands[active]?.run() }
  }

  let lastGroup = ''
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-subtle" aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search incidents, jump to a page, change style…"
          className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle focus-visible:ring-0 focus-visible:ring-offset-0"
          role="combobox"
          aria-label="Command"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={commands[active] ? `palette-${commands[active].id}` : undefined}
        />
        {isLoading && <span className="text-xs text-muted-foreground">Searching…</span>}
        <kbd className="kbd">esc</kbd>
      </div>

      <ul ref={listRef} id="palette-list" role="listbox" aria-label="Commands" className="flex-1 overflow-y-auto p-2">
        {commands.length === 0 && <li className="px-3 py-10 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</li>}
        {commands.map((c, i) => {
          const header = c.group !== lastGroup ? c.group : null
          lastGroup = c.group
          return (
            <li key={c.id} role="presentation">
              {header && <p className="eyebrow px-3 pb-1 pt-3 text-[10px]">{header}</p>}
              <div
                id={`palette-${c.id}`}
                role="option"
                aria-selected={i === active}
                data-index={i}
                onMouseMove={() => setActive(i)}
                onClick={c.run}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm [&_svg]:size-4 [&_svg]:shrink-0',
                  i === active ? 'bg-primary-soft text-foreground' : 'text-foreground/90'
                )}
              >
                <span className={cn('flex shrink-0 items-center', i === active ? 'text-info-foreground' : 'text-muted-foreground')}>{c.icon}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                {c.hint && <span className="hidden max-w-[45%] truncate text-xs text-muted-foreground sm:block">{c.hint}</span>}
                {i === active && <CornerDownLeft className="text-muted-foreground" aria-hidden="true" />}
              </div>
            </li>
          )
        })}
        {found && debounced && found.items.length > 0 && (
          <li role="presentation" className="sr-only" aria-live="polite">{found.items.length} incidents found</li>
        )}
      </ul>

      <div className="flex items-center gap-4 border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
        <span className="flex items-center gap-1"><kbd className="kbd">↵</kbd> open</span>
        <span className="ml-auto flex items-center gap-1"><kbd className="kbd">/</kbd> or <kbd className="kbd">Ctrl K</kbd> anywhere</span>
      </div>
    </>
  )
}

/** Header trigger that looks like a search field. */
export function PaletteTrigger({ className }: { className?: string }): React.JSX.Element {
  const setOpen = useUIStore(s => s.setPaletteOpen)
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        'ui-input group flex h-10 w-full items-center gap-2.5 px-3 text-left text-sm text-subtle transition-colors hover:border-primary/50',
        className
      )}
      aria-label="Search incidents or run a command"
      aria-keyshortcuts="Control+K Meta+K /"
    >
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate"><span className="sm:hidden">Search…</span><span className="hidden sm:inline">Search incidents, symptoms, or jump to…</span></span>
      <span className="hidden items-center gap-1 sm:flex" aria-hidden="true">
        <kbd className="kbd">Ctrl</kbd><kbd className="kbd">K</kbd>
      </span>
    </button>
  )
}
