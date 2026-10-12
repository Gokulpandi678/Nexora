import type { Incident, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { CreateIncidentInput } from '@/lib/validators'

export const BASE = process.env.APP_URL!

export interface TestUser {
  name: string
  email: string
  department?: string
  role?: 'VIEWER' | 'REPORTER' | 'VERIFIER' | 'ADMIN'
  /** Organization the identity works in (sent as x-test-organization) */
  org?: string
}

export const reporter: TestUser = { name: 'Rita Reporter', email: 'rita@example.com', department: 'SRE', role: 'REPORTER' }
export const verifier: TestUser = { name: 'Vic Verifier', email: 'vic@example.com', department: 'Platform', role: 'VERIFIER' }
export const admin: TestUser = { name: 'Ada Admin', email: 'ada@example.com', department: 'IT', role: 'ADMIN' }

/** `undefined` → the default reporter (every API route now needs an identity); `null` → anonymous. */
export function headersFor(user: TestUser | null = reporter): Record<string, string> {
  if (!user) return { 'content-type': 'application/json' }
  return {
    'content-type': 'application/json',
    'x-user-name': encodeURIComponent(user.name),
    'x-user-email': encodeURIComponent(user.email),
    'x-user-department': user.department ?? 'SRE',
    'x-user-role': user.role ?? 'REPORTER',
    ...(user.org && { 'x-test-organization': user.org })
  }
}

export function req(method: string, path: string, body?: unknown, user: TestUser | null = reporter): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: headersFor(user),
    body: body === undefined ? undefined : JSON.stringify(body)
  })
}

export const ctx = <P extends Record<string, string>>(params: P): { params: Promise<P> } => ({ params: Promise.resolve(params) })
export const noParams = { params: Promise.resolve({}) } as { params: Promise<Record<string, never>> }

export async function json<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "NotificationLog", "ActivityLog", "SlaPolicy", "Project", "Comment", "MatchLink", "Solution", "Incident", "OrgInvitation", "MemberInvite", "Membership", "Organization", "User" RESTART IDENTITY CASCADE'
  )
}

/** Inserts an incident straight into the database (for controlled timestamps, statuses, MTTRs). */
export async function seedIncident(overrides: Partial<Prisma.IncidentUncheckedCreateInput> = {}): Promise<Incident> {
  const { tags: _tags, estimatedMTTR: _mttr, initialFixes: _fixes, projectIds: _projects, ...input } = incidentInput()
  return prisma.incident.create({ data: { ...input, status: 'OPEN', ...overrides } })
}

let counter = 0
/** A valid incident payload; override any field. Lengths satisfy the PRD minimums. */
export function incidentInput(overrides: Partial<CreateIncidentInput> = {}): CreateIncidentInput {
  counter += 1
  return {
    title: `Checkout API returns 504 when the database connection pool is exhausted #${counter}`,
    description:
      'The checkout service started timing out for most requests. The Postgres connection pool is pinned at its maximum while query latency stays low, so connections are being held rather than queries being slow.',
    symptoms: 'HTTP 504 from /api/checkout after 30s. Logs: TimeoutError connection pool exhausted (max 20).',
    affectedSystems: ['Database', 'API'],
    severity: 'P2',
    department: 'SRE',
    createdBy: reporter.name,
    email: reporter.email,
    impact: 'NONE',
    ...overrides
  }
}

/* ---------- Organizations, users and memberships ---------- */

let orgCounter = 0
export async function createOrg(name = 'Acme Cloud', overrides: Partial<Prisma.OrganizationUncheckedCreateInput> = {}): Promise<{ id: string; name: string }> {
  orgCounter += 1
  return prisma.organization.create({
    data: { name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${orgCounter}`, ...overrides },
    select: { id: true, name: true }
  })
}

/** An app user (as created on first WorkOS sign-in), onboarded unless told otherwise. */
export async function createUser(
  person: { name: string; email: string },
  { superAdmin = false, onboarded = true }: { superAdmin?: boolean; onboarded?: boolean } = {}
): Promise<{ id: string; email: string; name: string }> {
  return prisma.user.create({
    data: {
      workosId: `user_${person.email}`,
      email: person.email.toLowerCase(),
      name: person.name,
      isSuperAdmin: superAdmin,
      department: 'SRE',
      jobTitle: 'Engineer',
      onboardedAt: onboarded ? new Date() : null
    },
    select: { id: true, email: true, name: true }
  })
}

export async function addMembership(
  organizationId: string,
  userId: string,
  { role = 'REPORTER', status = 'ACTIVE' }: { role?: TestUser['role']; status?: 'ACTIVE' | 'PENDING' | 'REJECTED' } = {}
): Promise<{ id: string }> {
  return prisma.membership.create({ data: { organizationId, userId, role, status }, select: { id: true } })
}

/** Creates the user and an ACTIVE membership, and returns a header identity working in that organization. */
export async function member(org: { id: string }, person: { name: string; email: string }, role: TestUser['role'] = 'REPORTER'): Promise<TestUser & { userId: string }> {
  const user = await prisma.user.findUnique({ where: { email: person.email.toLowerCase() }, select: { id: true } }) ?? (await createUser(person))
  await addMembership(org.id, user.id, { role })
  return { ...person, role, department: 'SRE', org: org.id, userId: user.id }
}
