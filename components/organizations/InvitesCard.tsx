'use client'

import { useState } from 'react'
import { Building2, Check, Loader2, MailOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorNotice } from '@/components/states'
import { apiFetch, postJson } from '@/hooks/api'
import { POSITION_LABEL, ROLE_LABEL } from '@/lib/constants'
import type { AppSession, SessionInvite } from '@/lib/session'

/** Invitations from organization admins, accepted or declined with one click. Renders nothing when there are none. */
export default function InvitesCard({ invites, onAccepted, onChanged }: {
  invites: SessionInvite[]
  onAccepted: (session: AppSession) => void
  onChanged: () => void
}): React.JSX.Element | null {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (invites.length === 0) return null

  const accept = async (invite: SessionInvite): Promise<void> => {
    setBusy(`${invite.id}:accept`)
    setError(null)
    try {
      onAccepted(await postJson<AppSession>(`/api/member-invites/${invite.id}/accept`, {}))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept the invitation')
      setBusy(null)
    }
  }
  const decline = async (invite: SessionInvite): Promise<void> => {
    setBusy(`${invite.id}:decline`)
    setError(null)
    try {
      await apiFetch(`/api/member-invites/${invite.id}`, { method: 'DELETE' })
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not decline the invitation')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="ring-2 ring-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MailOpen className="size-4 text-primary" aria-hidden="true" /> You’re invited</CardTitle>
        <CardDescription>An admin added you to {invites.length === 1 ? 'an organization' : 'these organizations'}. Accept to join straight away.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <ErrorNotice message={error} />}
        <ul className="grid gap-2 md:grid-cols-2">
          {invites.map(invite => (
            <li key={invite.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-info-foreground">
                <Building2 className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{invite.organization.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {invite.position ? `${POSITION_LABEL[invite.position]} · ` : ''}{ROLE_LABEL[invite.role]} · from {invite.invitedBy}
                </span>
              </span>
              <span className="flex gap-1.5">
                <Button size="sm" disabled={busy !== null} onClick={() => void accept(invite)}>
                  {busy === `${invite.id}:accept` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Accept
                </Button>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void decline(invite)} aria-label={`Decline invitation to ${invite.organization.name}`}>
                  {busy === `${invite.id}:decline` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />} Decline
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
