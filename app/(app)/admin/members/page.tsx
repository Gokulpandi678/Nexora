import type { Metadata } from 'next'
import { PageHeader } from '@/components/states'
import MembersManager, { type InviteRow, type MemberRow } from '@/components/admin/MembersManager'
import { DEPARTMENTS, isOneOf, POSITIONS, ROLES } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { requireOrgAdmin } from '@/lib/session'

export const metadata: Metadata = { title: 'Members' }
export const dynamic = 'force-dynamic'

/** Organization admins add people, approve join requests, and set each member's position and access. */
export default async function MembersPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }): Promise<React.JSX.Element> {
  const session = await requireOrgAdmin()
  const { welcome } = await searchParams
  const org = session.membership!.organization

  const [memberships, inviteRows] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: org.id, status: { in: ['ACTIVE', 'PENDING'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: { user: { select: { id: true, name: true, email: true, jobTitle: true, department: true, phone: true, bio: true } } }
    }),
    prisma.memberInvite.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: 'desc' } })
  ])
  const invites: InviteRow[] = inviteRows.map(i => ({
    id: i.id,
    email: i.email,
    role: isOneOf(ROLES, i.role) ? i.role : 'REPORTER',
    position: isOneOf(POSITIONS, i.position) ? i.position : null,
    invitedBy: i.invitedBy,
    createdAt: i.createdAt.toISOString()
  }))

  const rows: MemberRow[] = memberships.map(m => ({
    id: m.id,
    status: m.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
    role: isOneOf(ROLES, m.role) ? m.role : 'VIEWER',
    position: isOneOf(POSITIONS, m.position) ? m.position : null,
    message: m.message,
    requestedAt: m.createdAt.toISOString(),
    isYou: m.user.id === session.user.id,
    user: {
      name: m.user.name || m.user.email,
      email: m.user.email,
      jobTitle: m.user.jobTitle,
      department: isOneOf(DEPARTMENTS, m.user.department) ? m.user.department : null,
      phone: m.user.phone,
      bio: m.user.bio
    }
  }))

  return (
    <>
      <PageHeader
        eyebrow={org.name}
        title="Members"
        description="Add people by email, approve requests, and set each member's position and access."
      />
      {welcome && (
        <p role="status" className="mb-6 rounded-lg bg-success-soft p-4 text-sm text-success-foreground">
          <strong>{org.name} is ready.</strong> Add your team by email below, or share the app link: people who sign up and pick {org.name}
          show up here for you to approve.
        </p>
      )}
      <MembersManager rows={rows} invites={invites} organizationName={org.name} />
    </>
  )
}
