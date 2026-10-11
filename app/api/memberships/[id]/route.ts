import { NextResponse } from 'next/server'
import { HttpError, notFound, parseJson, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sendMembershipDecision } from '@/lib/email'
import { assertKeepsAnAdmin, orgAdminOrThrow, sessionOrThrow } from '@/lib/organizations'
import { isAdminOf } from '@/lib/session'
import { membershipUpdateSchema } from '@/lib/validators'

type Params = { id: string }

const withNames = { user: { select: { email: true } }, organization: { select: { id: true, name: true } } } as const

/** PATCH /api/memberships/:id — org admin approves/rejects a request, or changes a member's access role or position. */
export const PATCH = route<Params>('memberships.update', async (req, { params }) => {
  const { id } = await params
  const { session, organizationId } = await orgAdminOrThrow()
  const input = await parseJson(req, membershipUpdateSchema)

  const { membership, decided } = await prisma.$transaction(async tx => {
    const current = await tx.membership.findFirst({ where: { id, organizationId } })
    if (!current) throw notFound('Membership')
    if (input.status === 'REJECTED' && current.status !== 'PENDING') {
      throw new HttpError(400, 'Only pending requests can be rejected. Remove the member instead.')
    }
    if (current.role === 'ADMIN' && current.status === 'ACTIVE' && input.role && input.role !== 'ADMIN') {
      await assertKeepsAnAdmin(tx, organizationId, current.id)
    }

    const decided = input.status !== undefined && input.status !== current.status
    const membership = await tx.membership.update({
      where: { id },
      data: {
        ...(input.role && { role: input.role }),
        ...(input.position !== undefined && { position: input.position }),
        ...(decided && { status: input.status, decidedBy: session.user.email, decidedAt: new Date() })
      },
      include: withNames
    })
    return { membership, decided }
  })

  if (decided) {
    await sendMembershipDecision({
      to: membership.user.email,
      organizationId: membership.organization.id,
      organizationName: membership.organization.name,
      approved: membership.status === 'ACTIVE'
    })
  }
  return NextResponse.json({ id: membership.id, status: membership.status, role: membership.role, position: membership.position })
}, { members: false })

/**
 * DELETE /api/memberships/:id — a user cancels their own request or leaves an organization, or an
 * org admin removes a member. An organization always keeps at least one admin.
 */
export const DELETE = route<Params>('memberships.delete', async (_req, { params }) => {
  const { id } = await params
  const session = await sessionOrThrow()

  await prisma.$transaction(async tx => {
    const membership = await tx.membership.findUnique({ where: { id } })
    if (!membership) throw notFound('Membership')

    const own = membership.userId === session.user.id
    if (!own && !isAdminOf(session, membership.organizationId)) {
      throw new HttpError(403, 'Only organization admins can remove members')
    }
    if (membership.role === 'ADMIN' && membership.status === 'ACTIVE') {
      await assertKeepsAnAdmin(tx, membership.organizationId, membership.id)
    }
    await tx.membership.delete({ where: { id } })
  })

  return new NextResponse(null, { status: 204 })
}, { members: false })
