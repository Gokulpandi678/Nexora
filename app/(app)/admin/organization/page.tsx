import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/states'
import OrganizationDetailsForm from '@/components/organizations/OrganizationDetailsForm'
import { prisma } from '@/lib/db'
import { requireOrgAdmin } from '@/lib/session'

export const metadata: Metadata = { title: 'Organization settings' }
export const dynamic = 'force-dynamic'

/** Organization admins edit their organization's name and profile. Suspension is up to Nexora superadmins. */
export default async function OrganizationSettingsPage(): Promise<React.JSX.Element> {
  const session = await requireOrgAdmin()
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: session.membership!.organization.id },
    select: { id: true, name: true, industry: true, size: true, website: true, description: true }
  })

  return (
    <>
      <PageHeader eyebrow={org.name} title="Organization settings" description="How your organization appears to people looking for it and to your members." />
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>The name and description are shown to people choosing which organization to join.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationDetailsForm org={org} />
        </CardContent>
      </Card>
    </>
  )
}
