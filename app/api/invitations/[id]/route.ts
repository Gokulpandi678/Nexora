import { NextResponse } from 'next/server'
import { HttpError, notFound, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { invitationState, superAdminOrThrow } from '@/lib/organizations'

/** DELETE /api/invitations/:id — revoke an invitation that has not been accepted (superadmin). */
export const DELETE = route<{ id: string }>('invitations.revoke', async (_req, { params }) => {
  const { id } = await params
  await superAdminOrThrow()
  const invite = await prisma.orgInvitation.findUnique({ where: { id } })
  if (!invite) throw notFound('Invitation')
  if (invitationState(invite) === 'ACCEPTED') throw new HttpError(400, 'This invitation was already accepted')
  await prisma.orgInvitation.update({ where: { id }, data: { revokedAt: invite.revokedAt ?? new Date() } })
  return new NextResponse(null, { status: 204 })
}, { members: false })
