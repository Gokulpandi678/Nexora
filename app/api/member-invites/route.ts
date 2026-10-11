import { NextResponse } from 'next/server'
import { HttpError, parseJson, route } from '@/lib/api'
import { POSITION_LABEL, ROLE_LABEL } from '@/lib/constants'
import { prisma } from '@/lib/db'
import { sendMemberInvite, sendMembershipDecision } from '@/lib/email'
import { orgAdminOrThrow } from '@/lib/organizations'
import { memberInviteSchema } from '@/lib/validators'

/**
 * POST /api/member-invites — an org admin adds someone to their organization by email.
 *  - Already a member → 409.
 *  - Already asked to join → their request is approved straight away with this access and position.
 *  - Otherwise → an invitation they accept in Nexora (signed in with that email). They are emailed,
 *    and see it immediately if they already have an account, or right after signing up.
 * People are never added without accepting, so nobody ends up in an organization they did not choose.
 */
export const POST = route('memberInvites.create', async req => {
  const { session, organizationId } = await orgAdminOrThrow()
  const { email, role, position } = await parseJson(req, memberInviteSchema)
  const organization = session.membership!.organization

  const existing = await prisma.membership.findFirst({
    where: { organizationId, user: { email } },
    select: { id: true, status: true }
  })
  if (existing?.status === 'ACTIVE') throw new HttpError(409, `${email} is already a member of ${organization.name}`)

  if (existing?.status === 'PENDING') {
    await prisma.membership.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', role, position, decidedBy: session.user.email, decidedAt: new Date() }
    })
    await prisma.memberInvite.deleteMany({ where: { organizationId, email } })
    await sendMembershipDecision({ to: email, organizationId, organizationName: organization.name, approved: true })
    return NextResponse.json({ outcome: 'approved', email }, { status: 201 })
  }

  const invite = await prisma.memberInvite.upsert({
    where: { organizationId_email: { organizationId, email } },
    create: { organizationId, email, role, position, invitedBy: session.user.email },
    update: { role, position, invitedBy: session.user.email, createdAt: new Date() },
    select: { id: true }
  })
  const delivery = await sendMemberInvite({
    to: email,
    organizationName: organization.name,
    invitedBy: session.user.name || session.user.email,
    position: position ? POSITION_LABEL[position] : null,
    access: ROLE_LABEL[role]
  })
  return NextResponse.json({ outcome: 'invited', id: invite.id, email, emailed: delivery }, { status: 201 })
}, { members: false })
