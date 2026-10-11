'use client'

import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/components/SessionProvider'
import InvitesCard from '@/components/organizations/InvitesCard'
import { JoinOrganizationCard, MembershipList } from '@/components/organizations/JoinOrganization'
import type { AppSession } from '@/lib/session'

export default function OrganizationsManager(): React.JSX.Element {
  const router = useRouter()
  const initial = useSession()
  const { data: session = initial, mutate } = useSWR<AppSession>('/api/me', { fallbackData: initial })

  const refresh = (): void => {
    void mutate()
    // Leaving the current organization changes what the whole app shows
    router.refresh()
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <InvitesCard
        invites={session.invites}
        onAccepted={next => { void mutate(next, { revalidate: false }); router.refresh() }}
        onChanged={refresh}
      />
      <Card>
        <CardHeader>
          <CardTitle>Memberships</CardTitle>
          <CardDescription>Switch to work in another organization. Its incidents, analytics and notifications replace the current ones.</CardDescription>
        </CardHeader>
        <CardContent>
          <MembershipList memberships={session.memberships} currentOrgId={session.membership?.organization.id} onChanged={refresh} />
        </CardContent>
      </Card>
      <JoinOrganizationCard title="Join another organization" onRequested={next => void mutate(next, { revalidate: false })} />
    </div>
  )
}
