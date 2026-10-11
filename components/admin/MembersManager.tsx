'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Inbox, Loader2, Mail, Trash2, UserPlus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorNotice, FieldError } from '@/components/states'
import { apiFetch, postJson } from '@/hooks/api'
import {
  POSITION_DEFAULT_ROLE, POSITION_LABEL, POSITIONS, ROLE_HINT, ROLE_LABEL, ROLES, type Department, type Position, type Role
} from '@/lib/constants'
import { initials, timeAgo } from '@/lib/utils'

export interface MemberRow {
  id: string
  status: 'ACTIVE' | 'PENDING'
  role: Role
  position: Position | null
  message: string | null
  requestedAt: string
  isYou: boolean
  user: {
    name: string
    email: string
    jobTitle: string | null
    department: Department | null
    phone: string | null
    bio: string | null
  }
}

export interface InviteRow {
  id: string
  email: string
  role: Role
  position: Position | null
  invitedBy: string
  createdAt: string
}

const NO_POSITION = '__none'

function Person({ row }: { row: MemberRow }): React.JSX.Element {
  const { user } = row
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground" aria-hidden="true">
        {initials(user.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {user.name} {row.isYou && <span className="font-normal text-muted-foreground">(you)</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        {(user.jobTitle || user.department) && (
          <p className="truncate text-xs text-muted-foreground">{[user.jobTitle, user.department].filter(Boolean).join(' · ')}</p>
        )}
      </div>
    </div>
  )
}

/** Position: who someone is in the organization. */
function PositionSelect({ value, onChange, label, disabled }: {
  value: Position | null
  onChange: (value: Position | null) => void
  label: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <Select value={value ?? NO_POSITION} disabled={disabled} onValueChange={v => { if (v) onChange(v === NO_POSITION ? null : (v as Position)) }}>
      <SelectTrigger className="w-48" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_POSITION}><span className="text-muted-foreground">No position</span></SelectItem>
        {POSITIONS.map(p => <SelectItem key={p} value={p}>{POSITION_LABEL[p]}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/** Access: what someone can do in Nexora. */
function AccessSelect({ value, onChange, label, disabled }: {
  value: Role
  onChange: (value: Role) => void
  label: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <Select value={value} disabled={disabled} onValueChange={v => { if (v) onChange(v as Role) }}>
      <SelectTrigger className="w-36" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        {ROLES.map(r => <SelectItem key={r} value={r} title={ROLE_HINT[r]}>{ROLE_LABEL[r]}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export default function MembersManager({ rows, invites, organizationName }: {
  rows: MemberRow[]
  invites: InviteRow[]
  organizationName: string
}): React.JSX.Element {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pending = rows.filter(r => r.status === 'PENDING')
  const active = rows.filter(r => r.status === 'ACTIVE')

  const run = async (key: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const update = (row: MemberRow, body: { status?: 'ACTIVE' | 'REJECTED'; role?: Role; position?: Position | null }, key: string): Promise<void> =>
    run(key, () => postJson(`/api/memberships/${row.id}`, body, 'PATCH'))
  const remove = (row: MemberRow): Promise<void> => {
    if (!window.confirm(`Remove ${row.user.name} from the organization? They will lose access immediately.`)) return Promise.resolve()
    return run(`${row.id}:remove`, () => apiFetch(`/api/memberships/${row.id}`, { method: 'DELETE' }))
  }

  return (
    <div className="grid gap-6">
      {error && <ErrorNotice message={error} />}

      <AddMemberCard organizationName={organizationName} invites={invites} onChanged={() => router.refresh()} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Join requests {pending.length > 0 && <Badge variant="warning">{pending.length}</Badge>}
          </CardTitle>
          <CardDescription>Choose their position and access, then approve. You can change both later.</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <EmptyState title="No pending requests">
              <span className="inline-flex items-center gap-1.5"><Inbox className="size-4" aria-hidden="true" /> New requests appear here and are emailed to you.</span>
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {pending.map(row => <PendingRow key={row.id} row={row} busy={busy} update={update} />)}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members <span className="font-normal text-muted-foreground">({active.length})</span></CardTitle>
          <CardDescription>
            <strong className="font-medium text-foreground">Position</strong> is who someone is in the organization.{' '}
            <strong className="font-medium text-foreground">Access</strong> is what they can do in Nexora:{' '}
            {ROLES.map(r => `${ROLE_LABEL[r]} — ${ROLE_HINT[r].charAt(0).toLowerCase()}${ROLE_HINT[r].slice(1)}`).join('; ')}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-1 hidden justify-end gap-2 pr-11 text-xs font-medium text-muted-foreground md:flex" aria-hidden="true">
            <span className="w-48">Position</span><span className="w-36">Access</span>
          </div>
          <ul className="divide-y divide-border">
            {active.map(row => (
              <li key={row.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center">
                <Person row={row} />
                <div className="ml-12 flex flex-wrap items-center gap-2 md:ml-0">
                  <PositionSelect value={row.position} label={`Position of ${row.user.name}`} disabled={busy !== null}
                    onChange={p => { if (p !== row.position) void update(row, { position: p }, `${row.id}:position`) }} />
                  <AccessSelect value={row.role} label={`Access for ${row.user.name}`} disabled={busy !== null}
                    onChange={r => { if (r !== row.role) void update(row, { role: r }, `${row.id}:role`) }} />
                  <span className="flex size-9 items-center justify-center">
                    {busy === `${row.id}:role` || busy === `${row.id}:position` ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />
                    ) : !row.isYou ? (
                      <Button size="icon" variant="ghost" disabled={busy !== null} onClick={() => void remove(row)} aria-label={`Remove ${row.user.name}`}>
                        {busy === `${row.id}:remove` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                      </Button>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function PendingRow({ row, busy, update }: {
  row: MemberRow
  busy: string | null
  update: (row: MemberRow, body: { status?: 'ACTIVE' | 'REJECTED'; role?: Role; position?: Position | null }, key: string) => Promise<void>
}): React.JSX.Element {
  const [position, setPosition] = useState<Position | null>(null)
  const [role, setRole] = useState<Role>(row.role)
  const pickPosition = (p: Position | null): void => {
    setPosition(p)
    if (p) setRole(POSITION_DEFAULT_ROLE[p])
  }

  return (
    <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Person row={row} />
        {row.message && <p className="ml-12 rounded-md bg-muted/60 p-2 text-sm">&ldquo;{row.message}&rdquo;</p>}
        {row.user.bio && <p className="ml-12 text-xs text-muted-foreground">{row.user.bio}</p>}
        <p className="ml-12 text-xs text-muted-foreground">Requested {timeAgo(row.requestedAt)}</p>
      </div>
      <div className="ml-12 flex flex-wrap items-center gap-2 lg:ml-0">
        <PositionSelect value={position} onChange={pickPosition} label={`Position for ${row.user.name}`} disabled={busy !== null} />
        <AccessSelect value={role} onChange={setRole} label={`Access for ${row.user.name}`} disabled={busy !== null} />
        <Button size="sm" variant="success" disabled={busy !== null} onClick={() => void update(row, { status: 'ACTIVE', role, position }, `${row.id}:approve`)}>
          {busy === `${row.id}:approve` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Approve
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void update(row, { status: 'REJECTED' }, `${row.id}:reject`)}>
          {busy === `${row.id}:reject` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />} Decline
        </Button>
      </div>
    </li>
  )
}

/** Invite someone by email; they accept it in Nexora. Lists invitations still waiting. */
function AddMemberCard({ organizationName, invites, onChanged }: {
  organizationName: string
  invites: InviteRow[]
  onChanged: () => void
}): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [position, setPosition] = useState<Position | null>('TEAM_MEMBER')
  const [role, setRole] = useState<Role>('REPORTER')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const emailError = email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email' : undefined

  const pickPosition = (p: Position | null): void => {
    setPosition(p)
    if (p) setRole(POSITION_DEFAULT_ROLE[p])
  }

  const invite = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!email.trim() || emailError) {
      setError('Enter the email address of the person to add')
      return
    }
    setBusy('invite')
    setError(null)
    setNotice(null)
    try {
      const res = await postJson<{ outcome: 'invited' | 'approved'; email: string }>('/api/member-invites', { email: email.trim(), role, position })
      setNotice(res.outcome === 'approved'
        ? `${res.email} had already asked to join, so they're in now.`
        : `Invitation sent to ${res.email}. They'll see it in Nexora as soon as they sign in.`)
      setEmail('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invitation')
    } finally {
      setBusy(null)
    }
  }

  const revoke = async (id: string): Promise<void> => {
    setBusy(id)
    setError(null)
    try {
      await apiFetch(`/api/member-invites/${id}`, { method: 'DELETE' })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the invitation')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserPlus className="size-4 text-primary" aria-hidden="true" /> Add a member</CardTitle>
        <CardDescription>
          Invite someone to {organizationName} by email instead of waiting for their request. They accept it with one click
          after signing in — new to Nexora? They get an email and see it right after signing up.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={invite} noValidate className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" placeholder="name@company.com" value={email} onChange={e => setEmail(e.target.value)}
              aria-invalid={Boolean(emailError)} aria-describedby="invite-email-error" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Position</Label>
            <PositionSelect value={position} onChange={pickPosition} label="Position" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Access</Label>
            <AccessSelect value={role} onChange={setRole} label="Access" />
          </div>
          <Button type="submit" disabled={busy !== null}>
            {busy === 'invite' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Mail aria-hidden="true" />} Send invitation
          </Button>
        </form>
        <FieldError id="invite-email-error" message={emailError} />
        {error && <ErrorNotice message={error} />}
        {notice && <p role="status" className="rounded-md bg-success-soft p-3 text-sm text-success-foreground">{notice}</p>}

        {invites.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Waiting to accept ({invites.length})</p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {invites.map(inv => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{inv.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {inv.position ? `${POSITION_LABEL[inv.position]} · ` : ''}{ROLE_LABEL[inv.role]} · invited {timeAgo(inv.createdAt)}
                  </span>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void revoke(inv.id)} aria-label={`Revoke invitation for ${inv.email}`}>
                    {busy === inv.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />} Revoke
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
