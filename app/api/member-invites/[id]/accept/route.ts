import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { withAuth } from '@workos-inc/authkit-nextjs'
import { HttpError, notFound, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sessionOrThrow } from '@/lib/organizations'
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_OPTIONS, loadSession } from '@/lib/session'

/**
 * POST /api/member-invites/:id/accept — the invited person joins the organization with the access and
 * position the admin chose. Only the verified owner of the invited email address can accept.
 */
export const POST = route<{ id: string }>('memberInvites.accept', async (_req, { params }) => {
  const { id } = await params
  const session = await sessionOrThrow()

  const invite = await prisma.memberInvite.findUnique({
    where: { id },
    include: { organization: { select: { id: true, name: true, suspendedAt: true } } }
  })
  // Someone else's invitation, or a suspended organization, looks the same as a missing one
  if (!invite || invite.email !== session.user.email || invite.organization.suspendedAt) throw notFound('Invitation')

  const { user: workosUser } = await withAuth()
  if (!workosUser?.emailVerified) throw new HttpError(403, 'Verify your email address first')
  if (session.user.isSuperAdmin) throw new HttpError(400, 'Superadmins manage organizations from the console instead of joining them')
  if (!session.user.onboarded) throw new HttpError(400, 'Complete your profile first')

  await prisma.$transaction(async tx => {
    await tx.membership.upsert({
      where: { userId_organizationId: { userId: session.user.id, organizationId: invite.organizationId } },
      create: {
        userId: session.user.id, organizationId: invite.organizationId, role: invite.role, position: invite.position,
        status: 'ACTIVE', decidedBy: invite.invitedBy, decidedAt: new Date()
      },
      update: { role: invite.role, position: invite.position, status: 'ACTIVE', decidedBy: invite.invitedBy, decidedAt: new Date() }
    })
    await tx.memberInvite.delete({ where: { id } })
  })

  // Land in the organization just joined
  ;(await cookies()).set(ACTIVE_ORG_COOKIE, invite.organizationId, ACTIVE_ORG_COOKIE_OPTIONS)
  return NextResponse.json(await loadSession(session.user.id, invite.organizationId))
}, { members: false })
