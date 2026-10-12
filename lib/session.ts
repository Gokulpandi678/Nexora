import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { withAuth } from '@workos-inc/authkit-nextjs'
import type { User as WorkosUser } from '@workos-inc/node'
import { prisma } from '@/lib/db'
import { DEPARTMENTS, isOneOf, POSITIONS, ROLES, type Department, type MembershipStatus } from '@/lib/constants'
import { parsePreferences, type Preferences } from '@/lib/preferences'
import { isUsable, type SessionInvite, type SessionMembership } from '@/lib/session-rules'

export { isUsable, type SessionInvite, type SessionMembership }

export interface SessionUser {
  id: string
  email: string
  name: string
  isSuperAdmin: boolean
  jobTitle: string | null
  department: Department | null
  phone: string | null
  bio: string | null
  onboarded: boolean
}

export interface AppSession {
  user: SessionUser
  /** The organization the user is working in now (ACTIVE membership, not suspended), or null if they have none. */
  membership: SessionMembership | null
  /** Every membership and join request: ACTIVE first, then PENDING, then REJECTED. */
  memberships: SessionMembership[]
  /** Invitations from organization admins waiting for this user to accept */
  invites: SessionInvite[]
  /** Saved on the account; null if the user never saved any (the browser's choices are then uploaded) */
  preferences: Preferences | null
}

/** Holds the id of the organization the user last selected (set by app/switch-org/route.ts). */
export const ACTIVE_ORG_COOKIE = 'it-active-org'
export const ACTIVE_ORG_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 31_536_000
} as const

/** Comma-separated list of emails that are platform superadmins. The env var is the source of truth. */
function superAdminEmails(): Set<string> {
  return new Set((process.env.SUPERADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean))
}

const STATUS_RANK: Record<string, number> = { ACTIVE: 0, PENDING: 1, REJECTED: 2 }

/** Creates or refreshes the app-side user for a WorkOS user. Only writes when something changed. */
export async function syncUser(workosUser: WorkosUser): Promise<string> {
  const email = workosUser.email.toLowerCase()
  const isSuperAdmin = superAdminEmails().has(email)
  const name = [workosUser.firstName, workosUser.lastName].filter(Boolean).join(' ')

  const existing = await prisma.user.findFirst({
    where: { OR: [{ workosId: workosUser.id }, { email }] },
    select: { id: true, workosId: true, email: true, isSuperAdmin: true, name: true }
  })
  if (existing) {
    if (existing.workosId !== workosUser.id || existing.email !== email || existing.isSuperAdmin !== isSuperAdmin || (!existing.name && name)) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { workosId: workosUser.id, email, isSuperAdmin, ...(!existing.name && name && { name }) }
      })
    }
    return existing.id
  }

  try {
    const created = await prisma.user.create({ data: { workosId: workosUser.id, email, name, isSuperAdmin }, select: { id: true } })
    return created.id
  } catch (error) {
    // A concurrent request created the same user first
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const user = await prisma.user.findUniqueOrThrow({ where: { workosId: workosUser.id }, select: { id: true } })
      return user.id
    }
    throw error
  }
}

async function selectedOrgId(): Promise<string | null> {
  try {
    return (await cookies()).get(ACTIVE_ORG_COOKIE)?.value ?? null
  } catch {
    return null // outside a request, e.g. scripts
  }
}

/**
 * Loads the user with all their memberships. The working organization is `preferredOrgId` (default:
 * the cookie) if the user is an active member of it, else the most recently updated active membership.
 */
export async function loadSession(userId: string, preferredOrgId?: string | null, knownEmail?: string): Promise<AppSession> {
  const userQuery = prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      memberships: {
        include: { organization: { select: { id: true, name: true, slug: true, suspendedAt: true } } },
        orderBy: { updatedAt: 'desc' }
      }
    }
  })
  const findInvites = (email: string) => prisma.memberInvite.findMany({
    where: { email, organization: { suspendedAt: null } },
    orderBy: { createdAt: 'desc' },
    include: { organization: { select: { id: true, name: true } } }
  })
  // With the email known up front, both lookups share one database round trip
  const [user, inviteRows] = knownEmail
    ? await Promise.all([userQuery, findInvites(knownEmail)])
    : await userQuery.then(async u => [u, await findInvites(u.email)] as const)
  const memberships: SessionMembership[] = [...user.memberships]
    .sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9))
    .map(m => ({
      id: m.id,
      role: isOneOf(ROLES, m.role) ? m.role : 'VIEWER',
      position: isOneOf(POSITIONS, m.position) ? m.position : null,
      status: m.status as MembershipStatus,
      suspended: m.organization.suspendedAt !== null,
      organization: { id: m.organization.id, name: m.organization.name, slug: m.organization.slug }
    }))
  const active = memberships.filter(isUsable)
  const preferred = preferredOrgId === undefined ? await selectedOrgId() : preferredOrgId

  // Invitations to organizations that are not suspended and the user is not already in
  const joined = new Set(memberships.filter(m => m.status === 'ACTIVE').map(m => m.organization.id))
  const invites: SessionInvite[] = inviteRows
    .filter(i => !joined.has(i.organizationId))
    .map(i => ({
      id: i.id,
      role: isOneOf(ROLES, i.role) ? i.role : 'REPORTER',
      position: isOneOf(POSITIONS, i.position) ? i.position : null,
      invitedBy: i.invitedBy,
      organization: i.organization
    }))

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      jobTitle: user.jobTitle,
      department: isOneOf(DEPARTMENTS, user.department) ? user.department : null,
      phone: user.phone,
      bio: user.bio,
      onboarded: user.onboardedAt !== null
    },
    membership: active.find(m => m.organization.id === preferred) ?? active[0] ?? null,
    memberships,
    invites,
    preferences: user.preferences === null ? null : parsePreferences(user.preferences)
  }
}

/** The signed-in user, or null. Deduplicated per server render. */
export const getSession = cache(async (): Promise<AppSession | null> => {
  const { user } = await withAuth()
  if (!user) return null
  // syncUser stores the email lowercased, so it can be passed on without another lookup
  return loadSession(await syncUser(user), undefined, user.email.toLowerCase())
})

export const isActiveMember = (session: AppSession): boolean => session.membership !== null
/** Admin of the organization the user is working in now. */
export const isOrgAdmin = (session: AppSession): boolean => session.membership?.role === 'ADMIN'
/** Admin of a specific organization, selected or not. */
export const isAdminOf = (session: AppSession, organizationId: string): boolean =>
  session.memberships.some(m => m.organization.id === organizationId && isUsable(m) && m.role === 'ADMIN')

/** Where a signed-in user belongs: superadmin console, the dashboard, or onboarding. */
export function homePath(session: AppSession): string {
  if (session.user.isSuperAdmin) return '/superadmin'
  if (isActiveMember(session)) return '/dashboard'
  return '/onboarding'
}

/* ---------- Page guards (server components) ---------- */

export async function requireSession(): Promise<AppSession> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

export async function requireSuperAdmin(): Promise<AppSession> {
  const session = await requireSession()
  if (!session.user.isSuperAdmin) redirect(homePath(session))
  return session
}

export async function requireMember(): Promise<AppSession> {
  const session = await requireSession()
  if (!isActiveMember(session)) redirect(homePath(session))
  return session
}

export async function requireOrgAdmin(): Promise<AppSession> {
  const session = await requireMember()
  if (!isOrgAdmin(session)) redirect('/dashboard')
  return session
}
