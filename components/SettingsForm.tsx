'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Info, Loader2, Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorNotice } from '@/components/states'
import { useSession } from '@/components/SessionProvider'
import { emptyProfile, ProfileFields, profilePayload, useFormErrors, type ProfileValue } from '@/components/auth/fields'
import { postJson } from '@/hooks/api'
import { ROLE_LABEL } from '@/lib/constants'
import { profileSchema } from '@/lib/validators'
import { useUserStore, type Theme } from '@/lib/store'
import { UI_STYLES, UI_STYLE_META, type UiStyle } from '@/lib/ui-styles'
import { useDocumentTheme } from '@/hooks/useDocumentTheme'
import { cn } from '@/lib/utils'

const THEMES: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor }
]

export default function SettingsForm(): React.JSX.Element {
  const { theme, uiStyle, setTheme, setUiStyle } = useUserStore()
  const { dark } = useDocumentTheme()

  return (
    <div className="grid max-w-4xl gap-6">
      <ProfileCard />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Pick a UI style that suits how you work — each one comes in light and dark. Try them live; press Ctrl K anywhere to switch fast.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div role="radiogroup" aria-label="UI style" className="grid gap-4 sm:grid-cols-2">
            {UI_STYLES.map(id => <StylePreview key={id} id={id} selected={uiStyle === id} dark={dark} onSelect={() => setUiStyle(id)} />)}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Color mode</p>
            <div role="radiogroup" aria-label="Theme" className="ui-input inline-flex gap-0.5 p-1">
              {THEMES.map(({ value, label, Icon }) => (
                <label key={value} className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring',
                  theme === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}>
                  <input type="radio" name="theme" className="sr-only" checked={theme === value} onChange={() => setTheme(value)} />
                  <Icon className="size-4" aria-hidden="true" /> {label}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** Your profile from onboarding. Email comes from your sign-in; role and organization are set by your admin. */
function ProfileCard(): React.JSX.Element {
  const router = useRouter()
  const { user, membership } = useSession()
  const [profile, setProfile] = useState<ProfileValue>(() => emptyProfile(user))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const payload = profilePayload(profile)
  const form = useFormErrors(profileSchema, payload)

  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!form.submit()) return
    setBusy(true)
    try {
      await postJson('/api/me', payload, 'PATCH')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      router.refresh()
    } catch (error) {
      form.setApiError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={save} noValidate>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Used to attribute reports and solutions and to route notifications.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-3 rounded-md bg-muted/60 p-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="truncate font-medium">{user.email}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Organization</dt><dd className="truncate font-medium">{membership?.organization.name ?? '—'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Role</dt><dd className="font-medium">{membership ? ROLE_LABEL[membership.role] : user.isSuperAdmin ? 'Superadmin' : '—'}</dd></div>
          </dl>
          <ProfileFields value={profile} onChange={setProfile} errors={form.errors} />
          <p className="flex gap-2 text-xs text-muted-foreground">
            <Info className="size-4 shrink-0" aria-hidden="true" />
            Your email comes from your sign-in account. Your role is managed by your organization&apos;s admin.
          </p>
        </CardContent>
        <CardFooter className="justify-end gap-3">
          {saved && <span role="status" className="mr-auto flex items-center gap-1.5 text-sm text-success-foreground"><CheckCircle2 className="size-4" aria-hidden="true" /> Saved</span>}
          {form.serverError && <ErrorNotice message={form.serverError} className="mr-auto" />}
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" aria-hidden="true" />} Save profile</Button>
        </CardFooter>
      </form>
    </Card>
  )
}

/**
 * A miniature of the app rendered in the given style: data-style on the wrapper re-scopes every token,
 * so the preview is the real palette, type and radius rather than a screenshot.
 */
function StylePreview({ id, selected, dark, onSelect }: { id: UiStyle; selected: boolean; dark: boolean; onSelect: () => void }): React.JSX.Element {
  const meta = UI_STYLE_META[id]
  return (
    <label className={cn(
      'group flex cursor-pointer flex-col gap-3 rounded-xl border-2 p-2 transition-all focus-within:ring-2 focus-within:ring-ring',
      selected ? 'border-primary shadow-md' : 'border-transparent hover:border-border'
    )}>
      <input type="radio" name="ui-style" className="sr-only" checked={selected} onChange={onSelect} />
      <div data-style={id} className={cn(dark && 'dark', 'pointer-events-none overflow-hidden rounded-lg border border-border bg-background text-foreground')} aria-hidden="true">
        <div className="flex h-36">
          <div className={cn('flex w-14 flex-col gap-1.5 border-r border-border bg-surface p-2', id === 'neo' && 'border-r-2')}>
            <span className="mb-1 size-5 rounded-md bg-primary" />
            <span className="h-1.5 rounded-sm bg-primary-soft" />
            <span className="h-1.5 w-8 rounded-sm bg-muted" />
            <span className="h-1.5 w-7 rounded-sm bg-muted" />
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3">
            <span className="font-display text-sm font-bold leading-none tracking-tight">Welcome back</span>
            <div className="grid grid-cols-3 gap-1.5">
              {[0, 1, 2].map(i => (
                <span key={i} className={cn('flex flex-col gap-1 rounded-md border border-border bg-surface p-1.5 shadow-sm', id === 'neo' && 'border-2 border-foreground')}>
                  <span className="h-1 w-6 rounded-sm bg-muted" />
                  <span className="font-display text-xs font-bold leading-none">{[12, 3, '4h'][i]}</span>
                </span>
              ))}
            </div>
            <span className={cn('flex flex-1 flex-col justify-center gap-1 rounded-md border border-border bg-surface p-2 shadow-sm', id === 'neo' && 'border-2 border-foreground')}>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-danger" /><span className="h-1 w-16 rounded-sm bg-muted" /></span>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-warning" /><span className="h-1 w-12 rounded-sm bg-muted" /></span>
            </span>
            <span className={cn('self-start rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground', id === 'neo' && 'border-2 border-foreground')}>Report</span>
          </div>
        </div>
      </div>
      <span className="flex items-start justify-between gap-2 px-1">
        <span>
          <span className="block text-sm font-semibold">{meta.name}</span>
          <span className="block text-xs text-muted-foreground">{meta.tagline}</span>
        </span>
        {selected && <CheckCircle2 className="size-5 shrink-0 text-primary" aria-label="Selected" />}
      </span>
    </label>
  )
}
