import { NextResponse } from 'next/server'
import { HttpError, parseJson, route } from '@/lib/api'
import { INVITE_TTL_DAYS } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { sendOrgInvitation } from '@/lib/email'
import { createInviteToken, invitationState, superAdminOrThrow } from '@/lib/organizations'
import { createInvitationSchema } from '@/lib/validators'

/** GET /api/invitations — every organization invitation, newest first (superadmin). */
export const GET = route('invitations.list', async () => {
  await superAdminOrThrow()
  const invites = await prisma.orgInvitation.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { invitedBy: { select: { email: true } }, organization: { select: { id: true, name: true } } }
  })
  const items = invites.map(({ tokenHash: _hash, ...invite }) => ({ ...invite, state: invitationState(invite) }))
  return NextResponse.json({ items })
}, { members: false })

/** POST /api/invitations — invite someone to create an organization and become its admin (superadmin). */
export const POST = route('invitations.create', async req => {
  const session = await superAdminOrThrow()
  const { email, organizationName } = await parseJson(req, createInvitationSchema)

  // People may run several organizations, so an existing membership is not a reason to refuse
  const [pending, sameName] = await Promise.all([
    prisma.orgInvitation.findFirst({ where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.organization.findFirst({ where: { name: { equals: organizationName, mode: 'insensitive' } }, select: { id: true } })
  ])
  if (pending) throw new HttpError(409, `${email} already has a pending organization invitation. Resend or revoke it first.`)
  if (sameName) throw new HttpError(409, `An organization named "${organizationName}" already exists`)

  const { token, tokenHash } = createInviteToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000)
  const invite = await prisma.orgInvitation.create({
    data: { email, organizationName, tokenHash, expiresAt, invitedById: session.user.id },
    select: { id: true, email: true, organizationName: true, expiresAt: true }
  })

  const delivery = await sendOrgInvitation({
    to: email, organizationName, token, expiresAt, invitedBy: session.user.name || session.user.email
  })
  // If the email could not be sent the superadmin can still copy the link and share it themselves
  return NextResponse.json({ invitation: invite, email: delivery, link: `/invite/${token}` }, { status: 201 })
}, { members: false })
