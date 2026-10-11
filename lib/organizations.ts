import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { OrgInvitation, Organization } from '@prisma/client'
import { HttpError } from '@/lib/api'
import { prisma, type Tx } from '@/lib/db'
import { getSession, isOrgAdmin, type AppSession } from '@/lib/session'

/* ---------- API guards (route handlers) ---------- */

export async function sessionOrThrow(): Promise<AppSession> {
  const session = await getSession()
  if (!session) throw new HttpError(401, 'Sign in first')
  return session
}

export async function superAdminOrThrow(): Promise<AppSession> {
  const session = await sessionOrThrow()
  if (!session.user.isSuperAdmin) throw new HttpError(403, 'Only platform superadmins can do this')
  return session
}

/** The signed-in org admin and the id of the organization they administer. */
export async function orgAdminOrThrow(): Promise<{ session: AppSession; organizationId: string }> {
  const session = await sessionOrThrow()
  if (!isOrgAdmin(session) || !session.membership) throw new HttpError(403, 'Only organization admins can do this')
  return { session, organizationId: session.membership.organization.id }
}

/* ---------- Invitation tokens ---------- */

/** A URL-safe random token. Only its hash is stored, so a database leak does not leak live links. */
export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInviteToken(token) }
}

export const hashInviteToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export type InvitationState = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'

export function invitationState(invite: Pick<OrgInvitation, 'acceptedAt' | 'revokedAt' | 'expiresAt'>, now = new Date()): InvitationState {
  if (invite.acceptedAt) return 'ACCEPTED'
  if (invite.revokedAt) return 'REVOKED'
  if (invite.expiresAt <= now) return 'EXPIRED'
  return 'PENDING'
}

export async function findInvitationByToken(token: string): Promise<(OrgInvitation & { state: InvitationState }) | null> {
  if (!token || token.length > 200) return null
  const invite = await prisma.orgInvitation.findUnique({ where: { tokenHash: hashInviteToken(token) } })
  return invite ? { ...invite, state: invitationState(invite) } : null
}

/* ---------- Organizations ---------- */

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'org'
  )
}

export async function uniqueSlug(tx: Tx, name: string): Promise<string> {
  const base = slugify(name)
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`
    const taken = await tx.organization.findUnique({ where: { slug }, select: { id: true } })
    if (!taken) return slug
  }
  return `${base}-${randomBytes(6).toString('hex')}`
}

export async function orgAdminEmails(organizationId: string): Promise<string[]> {
  const admins = await prisma.membership.findMany({
    where: { organizationId, status: 'ACTIVE', role: 'ADMIN' },
    select: { user: { select: { email: true } } }
  })
  return admins.map(a => a.user.email)
}

/** Throws when the change would leave the organization without an active admin. */
export async function assertKeepsAnAdmin(tx: Tx, organizationId: string, membershipId: string): Promise<void> {
  const others = await tx.membership.count({
    where: { organizationId, status: 'ACTIVE', role: 'ADMIN', id: { not: membershipId } }
  })
  if (others === 0) throw new HttpError(400, 'An organization needs at least one admin. Promote someone else first.')
}

export type OrganizationSummary = Pick<Organization, 'id' | 'name' | 'slug' | 'industry' | 'size'> & { memberCount: number }
