import type { Metadata } from 'next'
import { Ban, Building2, Send, Users } from 'lucide-react'
import AuthShell from '@/components/auth/AuthShell'
import InvitationsPanel, { InviteOrganizationForm, type InvitationRow } from '@/components/superadmin/InvitationsPanel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import OrganizationsTable, { type OrganizationRow } from '@/components/superadmin/OrganizationsTable'
import { prisma } from '@/lib/db'
import { invitationState } from '@/lib/organizations'
import { requireSuperAdmin } from '@/lib/session'

export const metadata: Metadata = { title: 'Superadmin' }
export const dynamic = 'force-dynamic'

/** Platform console: invite organizations (their first admin) and see every organization. */
export default async function SuperAdminPage(): Promise<React.JSX.Element> {
  const session = await requireSuperAdmin()

  const [orgs, invites] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          where: { OR: [{ status: 'ACTIVE' }, { status: 'PENDING' }] },
          select: { status: true, role: true, user: { select: { email: true } } }
        },
        _count: { select: { incidents: { where: { deletedAt: null } } } }
      }
    }),
    prisma.orgInvitation.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
  ])

  const rows: InvitationRow[] = invites.map(i => ({
    id: i.id,
    email: i.email,
    organizationName: i.organizationName,
    state: invitationState(i),
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.expiresAt.toISOString()
  }))
  const orgRows: OrganizationRow[] = orgs.map(o => {
    const active = o.memberships.filter(m => m.status === 'ACTIVE')
    return {
      id: o.id,
      name: o.name,
      industry: o.industry,
      size: o.size,
      website: o.website,
      description: o.description,
      admins: active.filter(m => m.role === 'ADMIN').map(m => m.user.email),
      members: active.length,
      pending: o.memberships.length - active.length,
      incidents: o._count.incidents,
      createdAt: o.createdAt.toISOString(),
      suspendedAt: o.suspendedAt?.toISOString() ?? null,
      suspendedBy: o.suspendedBy,
      suspendedReason: o.suspendedReason
    }
  })
  const openInvites = rows.filter(r => r.state === 'PENDING').length
  const members = orgs.reduce((n, o) => n + o.memberships.filter(m => m.status === 'ACTIVE').length, 0)

  const stats = [
    { label: 'Active organizations', value: orgs.filter(o => !o.suspendedAt).length, Icon: Building2 },
    { label: 'Suspended', value: orgs.filter(o => o.suspendedAt).length, Icon: Ban },
    { label: 'Members', value: members, Icon: Users },
    { label: 'Open invitations', value: openInvites, Icon: Send }
  ]

  return (
    <AuthShell
      wide
      eyebrow="Superadmin console"
      title="Organizations"
      description="Invite an organization by emailing its future admin. They set up the organization and approve their own people."
      signedInAs={session.user.email}
    >
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(({ label, value, Icon }) => (
            <div key={label} className="ui-card flex flex-col gap-1 p-4">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" aria-hidden="true" /> {label}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <InviteOrganizationForm />

        <InvitationsPanel rows={rows} />

        <Card>
          <CardHeader>
            <CardTitle>All organizations</CardTitle>
            <CardDescription>
              Created when an invited admin completes setup. Organizations are never deleted: suspend one to cut off access
              while keeping all of its data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationsTable rows={orgRows} />
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  )
}
