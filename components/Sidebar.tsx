'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import {
  BarChart3, Building2, ChevronsLeft, ChevronsRight, FolderKanban, Gauge, LayoutDashboard, ListTree, Plus, Settings, Settings2, Users, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Logo from '@/components/Logo'
import { useSession } from '@/components/SessionProvider'
import { useUIStore, useUserStore } from '@/lib/store'
import { useIncidentStats } from '@/hooks/useIncidents'
import { UI_STYLES, UI_STYLE_META } from '@/lib/ui-styles'
import { cn } from '@/lib/utils'

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, exact: true, count: false },
      { href: '/incidents', label: 'Incidents', Icon: ListTree, exact: false, count: true },
      { href: '/analytics', label: 'Analytics', Icon: BarChart3, exact: true, count: false },
      { href: '/sla', label: 'SLA & uptime', Icon: Gauge, exact: true, count: false }
    ]
  },
  {
    label: 'Account',
    items: [
      { href: '/organizations', label: 'Organizations', Icon: Building2, exact: true, count: false },
      { href: '/settings', label: 'Settings', Icon: Settings, exact: true, count: false }
    ]
  }
] as const

/** Shown to organization admins only. */
const ADMIN_GROUP = {
  label: 'Organization',
  items: [
    { href: '/admin/members', label: 'Members', Icon: Users, exact: false, count: false },
    { href: '/admin/projects', label: 'Projects & SLAs', Icon: FolderKanban, exact: true, count: false },
    { href: '/admin/organization', label: 'Organization settings', Icon: Settings2, exact: true, count: false }
  ]
} as const

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href
  // "/incidents" is active for list and detail pages but not for "/incidents/new"
  return pathname === href || (pathname.startsWith(`${href}/`) && pathname !== '/incidents/new')
}

export default function Sidebar(): React.JSX.Element {
  const pathname = usePathname()
  const { sidebarOpen, setSidebarOpen } = useUIStore()
  const { sidebarCollapsed: collapsed, setSidebarCollapsed } = useUserStore()
  const { data } = useIncidentStats()
  const { membership } = useSession()
  const groups = membership?.role === 'ADMIN' ? [NAV_GROUPS[0], ADMIN_GROUP, NAV_GROUPS[1]] : NAV_GROUPS

  useEffect(() => setSidebarOpen(false), [pathname, setSidebarOpen])

  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sidebarOpen, setSidebarOpen])

  const reporting = pathname === '/incidents/new'

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        id="app-sidebar"
        className={cn(
          'ui-chrome fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          collapsed && 'lg:w-[76px]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Sidebar"
      >
        <div className={cn('flex h-16 items-center justify-between gap-2 px-4', collapsed && 'lg:justify-center lg:px-0')}>
          <Link href="/dashboard" className="min-w-0" aria-label="Nexora dashboard">
            <Logo sub={membership?.organization.name} hideText={collapsed ? 'lg:hidden' : undefined} />
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X />
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-3 pt-2" aria-label="Main navigation">
          <Link
            href="/incidents/new"
            aria-current={reporting ? 'page' : undefined}
            title={collapsed ? 'Report incident' : undefined}
            className={cn(
              'ui-btn ui-btn-primary group flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90',
              collapsed && 'lg:px-0'
            )}
          >
            <Plus className="size-4 shrink-0 transition-transform group-hover:rotate-90" aria-hidden="true" />
            <span className={cn(collapsed && 'lg:sr-only')}>Report incident</span>
          </Link>

          {groups.map(group => (
            <div key={group.label}>
              <p className={cn('eyebrow mb-1.5 px-3 text-[10px]', collapsed && 'lg:sr-only')}>{group.label}</p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map(({ href, label, Icon, exact, count }) => {
                  const active = isActive(pathname, href, exact)
                  const open = count ? data?.totals.open : undefined
                  const hot = count && (data?.totals.openP1 ?? 0) > 0
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? label : undefined}
                        className={cn('nav-item', collapsed && 'lg:justify-center lg:px-0')}
                      >
                        <span className="relative">
                          <Icon className="size-[18px]" aria-hidden="true" />
                          {hot && collapsed && <span className="absolute -right-1 -top-1 hidden size-2 rounded-full bg-danger lg:block" aria-hidden="true" />}
                        </span>
                        <span className={cn('flex-1', collapsed && 'lg:sr-only')}>{label}</span>
                        {open !== undefined && open > 0 && (
                          <span className={cn(
                            'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                            hot ? 'bg-danger text-white dark:text-background' : 'bg-muted text-muted-foreground',
                            collapsed && 'lg:hidden'
                          )}>
                            {open}<span className="sr-only"> open</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={cn('flex flex-col gap-3 p-3', collapsed && 'lg:items-center')}>
          <StatusPulse collapsed={collapsed} />
          <StyleDots collapsed={collapsed} />
          <Button
            variant="ghost"
            size="sm"
            className={cn('hidden justify-start text-muted-foreground lg:flex', collapsed && 'justify-center')}
            onClick={() => setSidebarCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronsRight /> : <><ChevronsLeft /> Collapse</>}
          </Button>
        </div>
      </aside>
    </>
  )
}

/** Live health of the incident queue — red pulse while a P1 is open. */
function StatusPulse({ collapsed }: { collapsed: boolean }): React.JSX.Element | null {
  const { data } = useIncidentStats()
  if (!data) return null
  const { open, openP1 } = data.totals
  const tone = openP1 > 0 ? 'text-danger' : open > 0 ? 'text-warning' : 'text-success'
  const headline = openP1 > 0 ? `${openP1} critical open` : open > 0 ? `${open} open, none critical` : 'All clear'

  if (collapsed) {
    return (
      <Link href="/incidents" title={headline} className="hidden size-10 items-center justify-center rounded-lg border border-border lg:flex">
        <span className={cn('pulse-ring size-2.5 rounded-full bg-current', tone)} aria-hidden="true" />
        <span className="sr-only">{headline}</span>
      </Link>
    )
  }

  return (
    <Link href="/incidents" className="ui-card ui-card-interactive block p-3 transition-colors hover:border-primary/40">
      <span className="flex items-center gap-2 text-xs font-semibold">
        <span className={cn('pulse-ring size-2 rounded-full bg-current', tone)} aria-hidden="true" />
        <span className="ui-label-mono">{headline}</span>
      </span>
      <span className="mt-2 grid grid-cols-2 gap-2">
        <span>
          <span className="block text-[11px] text-muted-foreground">Open</span>
          <span className="font-display text-xl font-bold tabular-nums">{open}</span>
        </span>
        <span>
          <span className="block text-[11px] text-muted-foreground">Open P1</span>
          <span className={cn('font-display text-xl font-bold tabular-nums', openP1 > 0 && 'text-danger-foreground')}>{openP1}</span>
        </span>
      </span>
    </Link>
  )
}

/** One-click style switcher. */
function StyleDots({ collapsed }: { collapsed: boolean }): React.JSX.Element {
  const { uiStyle, setUiStyle } = useUserStore()
  return (
    <div role="radiogroup" aria-label="UI style" className={cn('flex items-center gap-1.5 px-1', collapsed && 'lg:flex-col')}>
      <span className={cn('mr-auto text-[11px] text-muted-foreground', collapsed && 'lg:hidden')}>Style</span>
      {UI_STYLES.map(id => {
        const meta = UI_STYLE_META[id]
        const [, , primary, accent] = meta.swatches.light
        const on = uiStyle === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${meta.name} style`}
            title={`${meta.name} — ${meta.tagline}`}
            onClick={() => setUiStyle(id)}
            className={cn(
              'size-5 rounded-full border-2 transition-transform hover:scale-110',
              on ? 'scale-110 border-foreground' : 'border-transparent'
            )}
            style={{ background: `linear-gradient(135deg, ${primary} 50%, ${accent} 50%)` }}
          />
        )
      })}
    </div>
  )
}
