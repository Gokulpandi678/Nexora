import { NextResponse } from 'next/server'
import { HttpError, notFound, parseJson, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sendJoinRequestNotification } from '@/lib/email'
import { orgAdminEmails, sessionOrThrow } from '@/lib/organizations'
import { loadSession } from '@/lib/session'
import { joinRequestSchema } from '@/lib/validators'

/**
 * POST /api/memberships — ask to join an organization. An org admin approves or rejects it.
 * People can belong to several organizations (e.g. their employer and freelance clients).
 */
export const POST = route('memberships.request', async req => {
  const session = await sessionOrThrow()
  const { organizationId, message } = await parseJson(req, joinRequestSchema)

  if (session.user.isSuperAdmin) throw new HttpError(400, 'Superadmins manage organizations from the console instead of joining them')
  if (!session.user.onboarded) throw new HttpError(400, 'Complete your profile first')

  const existing = session.memberships.find(m => m.organization.id === organizationId)
  if (existing?.status === 'ACTIVE') throw new HttpError(409, `You already belong to ${existing.organization.name}`)
  if (existing?.status === 'PENDING') throw new HttpError(409, `Your request to join ${existing.organization.name} is already pending`)

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, suspendedAt: true } })
  // Suspended organizations look the same as missing ones to people outside them
  if (!org || org.suspendedAt) throw notFound('Organization')

  // Re-requesting after a rejection reopens the same row
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: session.user.id, organizationId } },
    create: { userId: session.user.id, organizationId, message, status: 'PENDING', role: 'REPORTER' },
    update: { message, status: 'PENDING', role: 'REPORTER', decidedBy: null, decidedAt: null }
  })

  const admins = await orgAdminEmails(org.id)
  await Promise.all(admins.map(to => sendJoinRequestNotification({
    to,
    organizationId: org.id,
    organizationName: org.name,
    requester: session.user.name || session.user.email,
    requesterEmail: session.user.email,
    message
  })))

  return NextResponse.json(await loadSession(session.user.id), { status: 201 })
}, { members: false })
