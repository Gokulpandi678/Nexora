import { NextResponse } from 'next/server'
import { HttpError, notFound, route } from '@/lib/api'
import { INVITE_TTL_DAYS } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { sendOrgInvitation } from '@/lib/email'
import { createInviteToken, invitationState, superAdminOrThrow } from '@/lib/organizations'

/**
 * POST /api/invitations/:id/resend — issue a fresh link (the old one stops working) and email it
 * again. Also reopens revoked or expired invitations (superadmin).
 */
export const POST = route<{ id: string }>('invitations.resend', async (_req, { params }) => {
  const { id } = await params
  const session = await superAdminOrThrow()
  const invite = await prisma.orgInvitation.findUnique({ where: { id } })
  if (!invite) throw notFound('Invitation')
  if (invitationState(invite) === 'ACCEPTED') throw new HttpError(400, 'This invitation was already accepted')

  const { token, tokenHash } = createInviteToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000)
  await prisma.orgInvitation.update({ where: { id }, data: { tokenHash, expiresAt, revokedAt: null } })

  const email = await sendOrgInvitation({
    to: invite.email, organizationName: invite.organizationName, token, expiresAt, invitedBy: session.user.name || session.user.email
  })
  return NextResponse.json({ email, link: `/invite/${token}` })
}, { members: false })
