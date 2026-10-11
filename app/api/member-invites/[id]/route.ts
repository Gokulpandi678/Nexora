import { NextResponse } from 'next/server'
import { HttpError, notFound, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sessionOrThrow } from '@/lib/organizations'
import { isAdminOf } from '@/lib/session'

/** DELETE /api/member-invites/:id — the organization's admin revokes it, or the invited person declines it. */
export const DELETE = route<{ id: string }>('memberInvites.delete', async (_req, { params }) => {
  const { id } = await params
  const session = await sessionOrThrow()
  const invite = await prisma.memberInvite.findUnique({ where: { id }, select: { organizationId: true, email: true } })
  if (!invite) throw notFound('Invitation')
  const invitee = invite.email === session.user.email
  if (!invitee && !isAdminOf(session, invite.organizationId)) throw new HttpError(403, 'Only the organization’s admins or the invited person can remove this invitation')
  await prisma.memberInvite.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}, { members: false })
