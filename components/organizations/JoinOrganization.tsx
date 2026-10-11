'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { ArrowRightLeft, Ban, Building2, Check, Clock, Loader2, LogOut, Search, Users, X, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorNotice, LoadingRows } from '@/components/states'
import { apiFetch, postJson } from '@/hooks/api'
import { ROLE_LABEL } from '@/lib/constants'
import type { OrganizationSummary } from '@/lib/organizations'
import type { AppSession, SessionMembership } from '@/lib/session'
import { cn } from '@/lib/utils'

/** Search organizations, pick one and ask its admins to let you in. */
export function JoinOrganizationCard({ onRequested, title = 'Which organization do you want to join?' }: {
  onRequested: (session: AppSession) => void
  title?: string
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const { data, error: loadError, isLoading, mutate } = useSWR<{ items: OrganizationSummary[] }>(
    `/api/organizations${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`
  )

  const submit = async (): Promise<void> => {
    if (!selected) {
      setError('Choose an organization')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const session = await postJson<AppSession>('/api/memberships', { organizationId: selected, message: message || null })
      setSelected(null)
      setMessage('')
      await mutate()
      onRequested(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your request')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          You can belong to several organizations, for example your employer and freelance clients. Each one&apos;s admin
          approves you separately. Not listed? Organizations are set up by invitation, so ask their admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="Search organizations" placeholder="Search organizations" className="pl-9" value={query} onChange={e => setQuery(e.target.value)} />
          </div>

          {loadError ? (
            <ErrorNotice message="Could not load organizations." onRetry={() => void mutate()} />
          ) : isLoading && !data ? (
            <LoadingRows count={3} />
          ) : !data?.items.length ? (
            <EmptyState title={debounced ? 'No organizations match your search' : 'No other organizations to join'}>
              Organizations you already belong to or asked to join are not listed.
            </EmptyState>
          ) : (
            <div role="radiogroup" aria-label="Organizations" className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {data.items.map(org => {
                const on = selected === org.id
                return (
                  <label key={org.id} className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring',
                    on ? 'border-primary bg-primary-soft' : 'border-border hover:bg-muted'
                  )}>
                    <input type="radio" name="organization" className="sr-only" checked={on} onChange={() => { setSelected(org.id); setError(null) }} />
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Building2 className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{org.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {org.industry && <>{org.industry} · </>}
                        <Users className="size-3" aria-hidden="true" /> {org.memberCount} {org.memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </span>
                    {on && <Check className="size-4 text-primary" aria-label="Selected" />}
                  </label>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-message">Note to the admin <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="join-message" rows={4} maxLength={500} placeholder="e.g. I joined the payments team last week"
              value={message} onChange={e => setMessage(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-danger-foreground">{error}</p>}
          <Button onClick={() => void submit()} disabled={busy} className="self-end">
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Request to join
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

const STATUS_BADGE = {
  ACTIVE: { label: 'Member', variant: 'success', Icon: Check },
  PENDING: { label: 'Waiting for approval', variant: 'warning', Icon: Clock },
  REJECTED: { label: 'Declined', variant: 'danger', Icon: XCircle }
} as const
const SUSPENDED_BADGE = { label: 'Suspended by Nexora', variant: 'neutral', Icon: Ban } as const

/** The user's organizations and requests, with switch / leave / cancel actions. */
export function MembershipList({ memberships, currentOrgId, onChanged, emptyText }: {
  memberships: SessionMembership[]
  currentOrgId?: string | null
  onChanged: () => void
  emptyText?: string
}): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const remove = async (m: SessionMembership): Promise<void> => {
    const leaving = m.status === 'ACTIVE'
    if (leaving && !window.confirm(`Leave ${m.organization.name}? You will lose access to its incidents until an admin approves you again.`)) return
    setBusy(m.id)
    setError(null)
    try {
      await apiFetch(`/api/memberships/${m.id}`, { method: 'DELETE' })
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  if (memberships.length === 0) return <EmptyState title={emptyText ?? 'No organizations yet'} />

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorNotice message={error} />}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {memberships.map(m => {
          const badge = m.suspended && m.status === 'ACTIVE' ? SUSPENDED_BADGE : STATUS_BADGE[m.status]
          const current = m.organization.id === currentOrgId
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Building2 className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {m.organization.name} {current && <span className="font-normal text-muted-foreground">(current)</span>}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={badge.variant}><badge.Icon aria-hidden="true" /> {badge.label}</Badge>
                  {m.status === 'ACTIVE' && ROLE_LABEL[m.role]}
                </p>
              </div>
              <span className="flex gap-1">
                {m.status === 'ACTIVE' && !m.suspended && !current && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`/switch-org?org=${encodeURIComponent(m.organization.id)}&next=/dashboard`}><ArrowRightLeft aria-hidden="true" /> Switch</a>
                  </Button>
                )}
                {m.status !== 'REJECTED' && (
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void remove(m)}>
                    {busy === m.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : m.status === 'ACTIVE' ? <LogOut aria-hidden="true" /> : <X aria-hidden="true" />}
                    {m.status === 'ACTIVE' ? 'Leave' : 'Cancel request'}
                  </Button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
