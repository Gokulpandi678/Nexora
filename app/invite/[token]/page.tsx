import type { Metadata } from 'next'
import { Building2, LogIn, MailWarning, UserPlus } from 'lucide-react'
import AuthShell from '@/components/auth/AuthShell'
import AcceptInvitationForm from '@/components/auth/AcceptInvitationForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { signOutAction } from '@/lib/actions'
import { findInvitationByToken } from '@/lib/organizations'
import { getSession, homePath } from '@/lib/session'

export const metadata: Metadata = { title: 'Organization invitation' }

const DEAD_LINK = {
  ACCEPTED: ['Invitation already used', 'This organization has been set up. Sign in to continue.'],
  REVOKED: ['Invitation revoked', 'This invitation is no longer valid. Ask the person who invited you for a new link.'],
  EXPIRED: ['Invitation expired', 'This link has expired. Ask the person who invited you to resend it.']
} as const

function Notice({ title, children, signedInAs }: { title: string; children: React.ReactNode; signedInAs?: string }): React.JSX.Element {
  return (
    <AuthShell eyebrow="Invitation" title={title} signedInAs={signedInAs}>
      <Card><CardContent className="flex flex-col gap-4 p-5 text-sm">{children}</CardContent></Card>
    </AuthShell>
  )
}

/**
 * Landing page for the link a superadmin emails. The invited person signs up (or in) with the invited
 * address, then fills in their own and their organization's details and becomes its admin.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }): Promise<React.JSX.Element> {
  const { token } = await params
  const [invite, session] = await Promise.all([findInvitationByToken(token), getSession()])
  const signedInAs = session?.user.email

  if (!invite) {
    return <Notice title="Invitation not found" signedInAs={signedInAs}><p>This link is not valid. Check that you copied the whole link from the email.</p></Notice>
  }
  if (invite.state !== 'PENDING') {
    const [title, body] = DEAD_LINK[invite.state]
    return (
      <Notice title={title} signedInAs={signedInAs}>
        <p>{body}</p>
        <Button asChild variant="outline"><a href={session ? homePath(session) : '/login'}>Continue</a></Button>
      </Notice>
    )
  }

  const returnTo = `/invite/${encodeURIComponent(token)}`
  const hint = `returnTo=${encodeURIComponent(returnTo)}&email=${encodeURIComponent(invite.email)}`

  if (!session) {
    return (
      <AuthShell
        eyebrow="You're invited"
        title={`Set up ${invite.organizationName}`}
        description={<>You&apos;ve been invited to create <strong className="text-foreground">{invite.organizationName}</strong> on Nexora and be its admin.</>}
      >
        <Card>
          <CardContent className="flex flex-col gap-3 p-5">
            <p className="flex items-center gap-2 rounded-md bg-muted/60 p-3 text-sm">
              <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              Continue as <strong className="truncate">{invite.email}</strong>
            </p>
            <Button asChild size="lg"><a href={`/auth/sign-up?${hint}`}><UserPlus aria-hidden="true" /> Create account &amp; continue</a></Button>
            <Button asChild size="lg" variant="outline"><a href={`/auth/sign-in?${hint}`}><LogIn aria-hidden="true" /> I already have an account</a></Button>
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  if (session.user.email !== invite.email) {
    return (
      <Notice title="Wrong account" signedInAs={signedInAs}>
        <p className="flex gap-2">
          <MailWarning className="size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
          <span>This invitation is for <strong>{invite.email}</strong>, but you&apos;re signed in as <strong>{session.user.email}</strong>. Sign out and sign back in with the invited address.</span>
        </p>
        <form action={signOutAction}><Button type="submit">Sign out</Button></form>
      </Notice>
    )
  }

  if (session.user.isSuperAdmin) {
    return (
      <Notice title="Can't accept this invitation" signedInAs={signedInAs}>
        <p>Superadmin accounts cannot administer an organization. Invite a different address.</p>
        <Button asChild variant="outline"><a href={homePath(session)}>Continue</a></Button>
      </Notice>
    )
  }

  return (
    <AuthShell
      wide
      eyebrow="Organization setup"
      title={`Welcome! Let's set up ${invite.organizationName}`}
      description="Tell us about yourself and your organization. You'll be its admin: you approve who joins and manage their roles."
      signedInAs={signedInAs}
    >
      <AcceptInvitationForm
        token={token}
        organizationName={invite.organizationName}
        profile={{ name: session.user.name, jobTitle: session.user.jobTitle, department: session.user.department, phone: session.user.phone, bio: session.user.bio }}
      />
    </AuthShell>
  )
}
