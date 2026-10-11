'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Check, LogOut, Menu, Monitor, Moon, Palette, Settings, Sun, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import CommandPalette, { PaletteTrigger } from '@/components/CommandPalette'
import OrgSwitcher from '@/components/organizations/OrgSwitcher'
import { useSession } from '@/components/SessionProvider'
import { signOutAction } from '@/lib/actions'
import { POSITION_LABEL, ROLE_LABEL } from '@/lib/constants'
import { useIdentityStore, useUIStore, useUserStore, type Theme } from '@/lib/store'
import { UI_STYLES, UI_STYLE_META } from '@/lib/ui-styles'
import { useNotifications } from '@/hooks/useIncidents'
import { apiFetch } from '@/hooks/api'
import { cn, initials, timeAgo } from '@/lib/utils'

export default function AppHeader(): React.JSX.Element {
  const setSidebarOpen = useUIStore(s => s.setSidebarOpen)

  return (
    <header className="ui-chrome sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-xl sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
        aria-controls="app-sidebar"
      >
        <Menu />
      </Button>

      <OrgSwitcher />
      <PaletteTrigger className="min-w-0 max-w-lg flex-1" />
      <CommandPalette />

      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <AppearanceMenu />
        <NotificationsMenu />
        <ProfileMenu />
      </div>
    </header>
  )
}

const THEMES: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor }
]

function AppearanceMenu(): React.JSX.Element {
  const { theme, setTheme, uiStyle, setUiStyle } = useUserStore()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Appearance: style and theme">
          <Palette />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="eyebrow text-[10px]">UI style</DropdownMenuLabel>
        {UI_STYLES.map(id => {
          const meta = UI_STYLE_META[id]
          const [bg, , primary, accent] = meta.swatches.light
          return (
            <DropdownMenuItem key={id} onSelect={e => { e.preventDefault(); setUiStyle(id) }} className="gap-3 py-2">
              <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border" style={{ background: bg }} aria-hidden="true">
                <span className="size-4 rounded-full" style={{ background: `linear-gradient(135deg, ${primary} 50%, ${accent} 50%)` }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{meta.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{meta.tagline}</span>
              </span>
              {uiStyle === id && <Check className="text-primary" aria-label="Current" />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <div role="group" aria-label="Color mode" className="grid grid-cols-3 gap-1 p-1">
          {THEMES.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md py-2 text-xs font-medium transition-colors [&_svg]:size-4',
                theme === value ? 'bg-primary-soft text-info-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Icon aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationsMenu(): React.JSX.Element | null {
  const router = useRouter()
  const signedIn = useIdentityStore(s => s.currentUser !== null)
  const { data, mutate } = useNotifications()
  if (!signedIn) return null

  const unread = data?.unread ?? 0
  const markAllRead = async (): Promise<void> => {
    if (!unread) return
    await apiFetch('/api/notifications', { method: 'PATCH', body: JSON.stringify({}) })
    await mutate()
  }

  return (
    <DropdownMenu onOpenChange={open => { if (!open) void markAllRead() }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white dark:text-background">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {unread > 0 && <span className="text-xs font-normal text-muted-foreground">{unread} unread</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!data?.items.length ? (
          <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-success-soft text-success-foreground"><Check className="size-5" aria-hidden="true" /></span>
            <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
          </div>
        ) : (
          data.items.map(n => (
            <DropdownMenuItem key={n.id} onSelect={() => router.push(`/incidents/${n.incidentId}`)} className="flex-col items-start gap-0.5">
              <span className={cn('line-clamp-2 text-sm', !n.readAt && 'font-semibold')}>
                {!n.readAt && <span className="mr-1.5 inline-block size-2 rounded-full bg-primary" aria-label="Unread" />}
                {n.title || n.notificationType}
              </span>
              <span className="text-xs text-muted-foreground">{timeAgo(n.sentAt)}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProfileMenu(): React.JSX.Element {
  const { user, membership } = useSession()
  const name = user.name || user.email
  const isAdmin = membership?.role === 'ADMIN'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Profile menu for ${name}`}>
          <span className="brand-mark flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
            {initials(name)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          {membership && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {membership.organization.name} · {membership.position ? `${POSITION_LABEL[membership.position]} · ` : ''}{ROLE_LABEL[membership.role]}
            </p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin/members">
              <Users aria-hidden="true" /> Manage members
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden="true" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOutAction()}>
          <LogOut aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
