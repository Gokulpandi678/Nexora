'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorNotice } from '@/components/states'
import {
  emptyProfile, OrganizationFields, organizationPayload, ProfileFields, profilePayload, useFormErrors,
  type OrganizationValue, type ProfileValue
} from '@/components/auth/fields'
import { postJson } from '@/hooks/api'
import { acceptInvitationSchema } from '@/lib/validators'

export default function AcceptInvitationForm({ token, organizationName, profile: initialProfile }: {
  token: string
  organizationName: string
  profile: Parameters<typeof emptyProfile>[0]
}): React.JSX.Element {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileValue>(() => emptyProfile(initialProfile))
  const [organization, setOrganization] = useState<OrganizationValue>({
    name: organizationName, industry: '', size: '', website: '', description: ''
  })
  const [busy, setBusy] = useState(false)

  const payload = { token, profile: profilePayload(profile), organization: organizationPayload(organization) }
  const form = useFormErrors(acceptInvitationSchema, payload)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!form.submit()) return
    setBusy(true)
    try {
      await postJson('/api/invitations/accept', payload)
      router.replace('/admin/members?welcome=1')
      router.refresh()
    } catch (error) {
      form.setApiError(error)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserRound className="size-4 text-primary" aria-hidden="true" /> About you</CardTitle>
          <CardDescription>Your teammates see this when you report or resolve incidents.</CardDescription>
        </CardHeader>
        <CardContent><ProfileFields value={profile} onChange={setProfile} errors={form.errors} prefix="profile." /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="size-4 text-primary" aria-hidden="true" /> Your organization</CardTitle>
          <CardDescription>People signing up will pick this organization and ask you to let them in.</CardDescription>
        </CardHeader>
        <CardContent><OrganizationFields value={organization} onChange={setOrganization} errors={form.errors} prefix="organization." /></CardContent>
      </Card>

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end lg:col-span-2">
        {form.serverError && <ErrorNotice message={form.serverError} className="sm:mr-auto" />}
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Create organization
        </Button>
      </div>
    </form>
  )
}
