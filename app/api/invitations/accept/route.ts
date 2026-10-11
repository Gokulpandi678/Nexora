import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { withAuth } from '@workos-inc/authkit-nextjs'
import { HttpError, parseJson, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { findInvitationByToken, sessionOrThrow, uniqueSlug } from '@/lib/organizations'
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_OPTIONS, loadSession } from '@/lib/session'
import { acceptInvitationSchema } from '@/lib/validators'

const STATE_MESSAGE = {
  ACCEPTED: 'This invitation was already used',
  REVOKED: 'This invitation was revoked. Ask for a new one.',
  EXPIRED: 'This invitation has expired. Ask for a new one.'
} as const

/**
 * POST /api/invitations/accept — the invited person creates their organization and becomes its admin.
 * Only the verified owner of the invited email address can accept.
 */
export const POST = route('invitations.accept', async req => {
  const session = await sessionOrThrow()
  const { token, profile, organization } = await parseJson(req, acceptInvitationSchema)

  const invite = await findInvitationByToken(token)
  if (!invite) throw new HttpError(404, 'This invitation link is not valid')
  if (invite.state !== 'PENDING') throw new HttpError(410, STATE_MESSAGE[invite.state])

  const { user: workosUser } = await withAuth()
  if (!workosUser || workosUser.email.toLowerCase() !== invite.email) {
    throw new HttpError(403, `This invitation is for ${invite.email}. Sign in with that address to accept it.`)
  }
  if (!workosUser.emailVerified) throw new HttpError(403, 'Verify your email address first')
  if (session.user.isSuperAdmin) throw new HttpError(400, 'Superadmins cannot administer an organization')

  const org = await prisma.$transaction(async tx => {
    // Claim the invitation first so two concurrent submissions cannot both create an organization
    const claimed = await tx.orgInvitation.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() }
    })
    if (claimed.count !== 1) throw new HttpError(410, 'This invitation is no longer valid')

    const created = await tx.organization.create({
      data: { ...organization, slug: await uniqueSlug(tx, organization.name) }
    })
    await tx.orgInvitation.update({ where: { id: invite.id }, data: { organizationId: created.id } })
    await tx.membership.create({
      data: { userId: session.user.id, organizationId: created.id, role: 'ADMIN', status: 'ACTIVE', decidedBy: invite.email, decidedAt: new Date() }
    })
    await tx.user.update({
      where: { id: session.user.id },
      data: { ...profile, onboardedAt: new Date() }
    })
    return created
  })

  // Land in the new organization
  ;(await cookies()).set(ACTIVE_ORG_COOKIE, org.id, ACTIVE_ORG_COOKIE_OPTIONS)
  return NextResponse.json(
    { organization: { id: org.id, name: org.name, slug: org.slug }, session: await loadSession(session.user.id, org.id) },
    { status: 201 }
  )
}, { members: false })
