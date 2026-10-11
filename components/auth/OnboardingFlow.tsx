'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Check, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorNotice } from '@/components/states'
import { emptyProfile, ProfileFields, profilePayload, useFormErrors, type ProfileValue } from '@/components/auth/fields'
import InvitesCard from '@/components/organizations/InvitesCard'
import { JoinOrganizationCard, MembershipList } from '@/components/organizations/JoinOrganization'
import { postJson } from '@/hooks/api'
import type { AppSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import { profileSchema } from '@/lib/validators'

const STEPS = ['Your details', 'Choose organization', 'Admin approval'] as const

function Stepper({ current }: { current: number }): React.JSX.Element {
  return (
    <ol className="mb-4 grid grid-cols-3 gap-2" aria-label="Onboarding progress">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} aria-current={active ? 'step' : undefined} className="flex flex-col gap-2">
            <span className={cn('h-1.5 rounded-full', done || active ? 'bg-primary' : 'bg-muted')} />
            <span className={cn('flex items-center gap-1.5 text-xs font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
              {done && <Check className="size-3.5 text-primary" aria-hidden="true" />}
              <span className="sr-only">Step {i + 1}: </span>{label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** First-time users: profile → ask to join one or more organizations → wait for an admin to approve. */
export default function OnboardingFlow({ session: initial }: { session: AppSession }): React.JSX.Element {
  const router = useRouter()
  const { data: session = initial, mutate } = useSWR<AppSession>('/api/me', {
    fallbackData: initial,
    // Polls while a request is pending so approval moves the user straight into the app
    refreshInterval: s => (s?.memberships.some(m => m.status === 'PENDING') ? 20_000 : 0)
  })
  const [editingProfile, setEditingProfile] = useState(!initial.user.onboarded)

  useEffect(() => {
    if (session.membership) {
      router.replace('/dashboard')
      router.refresh()
    }
  }, [session.membership, router])

  const pending = session.memberships.filter(m => m.status === 'PENDING')
  const step = editingProfile || !session.user.onboarded ? 0 : pending.length ? 2 : 1

  if (step === 0) {
    return (
      <>
        <Stepper current={0} />
        <ProfileStep session={session} onSaved={next => { void mutate(next, { revalidate: false }); setEditingProfile(false) }} />
      </>
    )
  }

  return (
    <>
      <Stepper current={step} />
      <div className="flex flex-col gap-4">
        <InvitesCard
          invites={session.invites}
          onAccepted={next => void mutate(next, { revalidate: false })}
          onChanged={() => void mutate()}
        />
        {pending.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="size-4 text-warning-foreground" aria-hidden="true" /> Waiting for approval</CardTitle>
              <CardDescription>
                We&apos;ve asked the admins to approve you and will email you when they do. This page updates on its own.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MembershipList memberships={session.memberships.filter(m => m.status !== 'ACTIVE')} onChanged={() => void mutate()} />
            </CardContent>
          </Card>
        )}
        {session.memberships.some(m => m.suspended) && (
          <p role="status" className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            {session.memberships.filter(m => m.suspended).map(m => m.organization.name).join(', ')}{' '}
            {session.memberships.filter(m => m.suspended).length === 1 ? 'is' : 'are'} suspended right now, so you can&apos;t open{' '}
            {session.memberships.filter(m => m.suspended).length === 1 ? 'it' : 'them'}. Your membership is kept and comes back if it is reactivated.
          </p>
        )}
        {pending.length === 0 && session.memberships.some(m => m.status === 'REJECTED') && (
          <MembershipList memberships={session.memberships} onChanged={() => void mutate()} />
        )}
        <JoinOrganizationCard
          title={pending.length || session.invites.length ? 'Join another organization' : 'Which organization do you work for?'}
          onRequested={next => void mutate(next, { revalidate: false })}
        />
        <Button variant="ghost" className="self-start" onClick={() => setEditingProfile(true)}>Edit my details</Button>
      </div>
    </>
  )
}

function ProfileStep({ session, onSaved }: { session: AppSession; onSaved: (session: AppSession) => void }): React.JSX.Element {
  const [profile, setProfile] = useState<ProfileValue>(() => emptyProfile(session.user))
  const [busy, setBusy] = useState(false)
  const payload = profilePayload(profile)
  const form = useFormErrors(profileSchema, payload)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!form.submit()) return
    setBusy(true)
    try {
      onSaved(await postJson<AppSession>('/api/me', payload, 'PATCH'))
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
          <CardTitle>Tell us about yourself</CardTitle>
          <CardDescription>Organization admins see this when reviewing your request.</CardDescription>
        </CardHeader>
        <CardContent><ProfileFields value={profile} onChange={setProfile} errors={form.errors} columns={3} /></CardContent>
        <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          {form.serverError && <ErrorNotice message={form.serverError} className="sm:mr-auto" />}
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" aria-hidden="true" />} Continue</Button>
        </CardFooter>
      </form>
    </Card>
  )
}
