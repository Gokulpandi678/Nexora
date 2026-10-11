'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Copy, Loader2, RotateCw, Send, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState, ErrorNotice, FieldError } from '@/components/states'
import { useFormErrors } from '@/components/auth/fields'
import { apiFetch, postJson } from '@/hooks/api'
import { cn, timeAgo } from '@/lib/utils'
import { createInvitationSchema } from '@/lib/validators'

export interface InvitationRow {
  id: string
  email: string
  organizationName: string
  state: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
  createdAt: string
  expiresAt: string
}

type EmailResult = { ok: true } | { ok: false; reason: 'disabled' | 'failed'; message: string }

interface SentLink {
  email: string
  result: EmailResult
  url: string
}

const STATE_BADGE = {
  PENDING: { label: 'Pending', variant: 'warning' },
  ACCEPTED: { label: 'Accepted', variant: 'success' },
  REVOKED: { label: 'Revoked', variant: 'neutral' },
  EXPIRED: { label: 'Expired', variant: 'danger' }
} as const

/** Shows the result of sending an invite; the link can be copied when email delivery is off. */
function SentNotice({ sent }: { sent: SentLink }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(sent.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div role="status" className={cn(
      'flex flex-col gap-2 rounded-md p-3 text-sm',
      sent.result.ok ? 'bg-success-soft text-success-foreground' : 'bg-warning-soft text-warning-foreground'
    )}>
      <span className="flex items-start gap-2">
        {sent.result.ok ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
        <span>
          {sent.result.ok
            ? `Invitation emailed to ${sent.email}.`
            : sent.result.reason === 'disabled'
              ? `Invitation created for ${sent.email}, but email is not configured (RESEND_API_KEY). Share this link with them:`
              : `Invitation created, but the email to ${sent.email} failed: "${sent.result.message}". Share this link with them instead:`}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 font-mono text-xs text-foreground">{sent.url}</code>
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? 'Copied' : 'Copy link'}
        </Button>
      </span>
    </div>
  )
}

export function InviteOrganizationForm(): React.JSX.Element {
  const router = useRouter()
  const [value, setValue] = useState({ organizationName: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<SentLink | null>(null)
  const form = useFormErrors(createInvitationSchema, value)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const data = form.submit()
    if (!data) return
    setBusy(true)
    setSent(null)
    try {
      const res = await postJson<{ email: EmailResult; link: string }>('/api/invitations', data)
      setSent({ email: data.email, result: res.email, url: `${window.location.origin}${res.link}` })
      setValue({ organizationName: '', email: '' })
      router.refresh()
    } catch (error) {
      form.setApiError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate>
        <CardHeader>
          <CardTitle>Invite an organization</CardTitle>
          <CardDescription>We email a one-time link (valid 7 days). Whoever accepts it becomes the organization&apos;s admin.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-org">Organization name</Label>
            <Input id="inv-org" placeholder="Acme Corp" value={value.organizationName}
              onChange={e => setValue(v => ({ ...v, organizationName: e.target.value }))}
              aria-invalid={Boolean(form.errors.organizationName)} aria-describedby="inv-org-error" />
            <FieldError id="inv-org-error" message={form.errors.organizationName} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-email">Admin&apos;s email</Label>
            <Input id="inv-email" type="email" placeholder="it-lead@acme.com" value={value.email}
              onChange={e => setValue(v => ({ ...v, email: e.target.value }))}
              aria-invalid={Boolean(form.errors.email)} aria-describedby="inv-email-error" />
            <FieldError id="inv-email-error" message={form.errors.email} />
          </div>
          {sent && <div className="sm:col-span-2"><SentNotice sent={sent} /></div>}
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          {form.serverError && <ErrorNotice message={form.serverError} className="sm:mr-auto" />}
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />} Send invitation
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function InvitationsPanel({ rows }: { rows: InvitationRow[] }): React.JSX.Element {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<SentLink | null>(null)

  const act = async (row: InvitationRow, action: 'resend' | 'revoke'): Promise<void> => {
    setBusyId(row.id)
    setError(null)
    setSent(null)
    try {
      if (action === 'resend') {
        const res = await postJson<{ email: EmailResult; link: string }>(`/api/invitations/${row.id}/resend`, {})
        setSent({ email: row.email, result: res.email, url: `${window.location.origin}${res.link}` })
      } else {
        await apiFetch(`/api/invitations/${row.id}`, { method: 'DELETE' })
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitations</CardTitle>
        <CardDescription>Resending issues a new link; the previous one stops working.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <ErrorNotice message={error} />}
        {sent && <SentNotice sent={sent} />}
        {rows.length === 0 ? (
          <EmptyState title="No invitations sent yet" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(row => {
              const badge = STATE_BADGE[row.state]
              const busy = busyId === row.id
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.organizationName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.email} · sent {timeAgo(row.createdAt)}
                      {row.state === 'PENDING' && <> · expires {timeAgo(row.expiresAt)}</>}
                    </p>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {row.state !== 'ACCEPTED' && (
                    <span className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(row, 'resend')}>
                        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCw aria-hidden="true" />} Resend
                      </Button>
                      {row.state === 'PENDING' && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(row, 'revoke')} aria-label={`Revoke invitation for ${row.email}`}>
                          <XCircle aria-hidden="true" /> Revoke
                        </Button>
                      )}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
