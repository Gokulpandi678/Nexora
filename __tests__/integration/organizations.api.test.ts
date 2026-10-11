import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { GET as listOrganizations } from '@/app/api/organizations/route'
import { PATCH as updateOrganization } from '@/app/api/organizations/[id]/route'
import { POST as requestToJoin } from '@/app/api/memberships/route'
import { DELETE as removeMembership, PATCH as decideMembership } from '@/app/api/memberships/[id]/route'
import { POST as createInvitation } from '@/app/api/invitations/route'
import { DELETE as revokeInvitation } from '@/app/api/invitations/[id]/route'
import { POST as acceptInvitation } from '@/app/api/invitations/accept/route'
import { GET as switchOrg } from '@/app/switch-org/route'
import { POST as inviteMember } from '@/app/api/member-invites/route'
import { DELETE as deleteMemberInvite } from '@/app/api/member-invites/[id]/route'
import { POST as acceptMemberInvite } from '@/app/api/member-invites/[id]/accept/route'
import { ACTIVE_ORG_COOKIE, loadSession } from '@/lib/session'
import { addMembership, createOrg, createUser, ctx, json, noParams, req, resetDb, seedIncident } from '../setup/helpers'

/*
 * Organization lifecycle: invitations, join requests, approvals, roles, leaving, suspension and switching.
 * These routes identify people by their WorkOS session, so only the session lookup is replaced: it loads
 * the "signed-in" user's real memberships from the test database. Everything else runs for real.
 * (vi.mock calls are hoisted above the imports.)
 */

const auth = vi.hoisted(() => ({
  userId: null as string | null,
  orgId: null as string | null,
  workos: null as null | { id: string; email: string; emailVerified: boolean; firstName: string | null; lastName: string | null }
}))
const cookieJar = vi.hoisted(() => new Map<string, string>())

vi.mock('@workos-inc/authkit-nextjs', () => ({ withAuth: vi.fn(async () => ({ user: auth.workos })) }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value)
  })
}))
vi.mock('@/lib/session', async importOriginal => {
  const mod = await importOriginal<typeof import('@/lib/session')>()
  return { ...mod, getSession: vi.fn(async () => (auth.userId ? mod.loadSession(auth.userId, auth.orgId) : null)) }
})

type User = { id: string; email: string; name: string }

function signIn(user: User | null, { orgId = null, verified = true }: { orgId?: string | null; verified?: boolean } = {}): void {
  auth.userId = user?.id ?? null
  auth.orgId = orgId
  auth.workos = user ? { id: `user_${user.email}`, email: user.email, emailVerified: verified, firstName: user.name, lastName: null } : null
}

let superadmin: User
let acme: { id: string; name: string }
let admin: User
let carol: User

beforeEach(async () => {
  await resetDb()
  cookieJar.clear()
  superadmin = await createUser({ name: 'Sam Super', email: 'sam@nexora.test' }, { superAdmin: true })
  acme = await createOrg('Acme Cloud')
  admin = await createUser({ name: 'Ada Admin', email: 'ada@acme.test' })
  await addMembership(acme.id, admin.id, { role: 'ADMIN' })
  carol = await createUser({ name: 'Carol New', email: 'carol@example.test' })
  signIn(null)
})

const patch = (path: string, body: unknown): Request => req('PATCH', path, body)

describe('invitations', () => {
  it('only superadmins can invite, and the token itself is never stored', async () => {
    signIn(admin, { orgId: acme.id })
    expect((await createInvitation(req('POST', '/api/invitations', { email: 'lead@beta.test', organizationName: 'Beta Health' }), noParams)).status).toBe(403)

    signIn(superadmin)
    const res = await createInvitation(req('POST', '/api/invitations', { email: 'lead@beta.test', organizationName: 'Beta Health' }), noParams)
    expect(res.status).toBe(201)
    const body = await json<{ link: string; email: { ok: boolean; reason?: string } }>(res)
    expect(body.email).toMatchObject({ ok: false, reason: 'disabled' }) // RESEND_API_KEY is empty in tests
    const token = body.link.split('/').pop()!
    const stored = await prisma.orgInvitation.findFirstOrThrow({ where: { email: 'lead@beta.test' } })
    expect(stored.tokenHash).not.toBe(token)
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/)

    const again = await createInvitation(req('POST', '/api/invitations', { email: 'lead@beta.test', organizationName: 'Beta Two' }), noParams)
    expect(again.status).toBe(409)
  })

  async function invite(email: string, organizationName = 'Beta Health'): Promise<{ id: string; token: string }> {
    signIn(superadmin)
    const body = await json<{ invitation: { id: string }; link: string }>(
      await createInvitation(req('POST', '/api/invitations', { email, organizationName }), noParams)
    )
    return { id: body.invitation.id, token: body.link.split('/').pop()! }
  }

  const acceptBody = (token: string, name = 'Beta Health') => ({
    token,
    profile: { name: 'Lee Lead', jobTitle: 'Head of IT', department: 'IT' },
    organization: { name, industry: 'Healthcare' }
  })

  it('can only be accepted by the verified owner of the invited address', async () => {
    const { token } = await invite('lead@beta.test')
    const lead = await createUser({ name: 'Lee Lead', email: 'lead@beta.test' }, { onboarded: false })

    signIn(carol)
    expect((await acceptInvitation(req('POST', '/api/invitations/accept', acceptBody(token)), noParams)).status).toBe(403)
    signIn(lead, { verified: false })
    expect((await acceptInvitation(req('POST', '/api/invitations/accept', acceptBody(token)), noParams)).status).toBe(403)
    expect(await prisma.organization.count({ where: { name: 'Beta Health' } })).toBe(0)
  })

  it('creates the organization with the accepter as admin, once', async () => {
    const { token } = await invite('lead@beta.test')
    const lead = await createUser({ name: 'Lee Lead', email: 'lead@beta.test' }, { onboarded: false })
    // Already a member elsewhere: people can run several organizations
    await addMembership(acme.id, lead.id)

    signIn(lead)
    const res = await acceptInvitation(req('POST', '/api/invitations/accept', acceptBody(token)), noParams)
    expect(res.status).toBe(201)
    const { organization } = await json<{ organization: { id: string } }>(res)
    const membership = await prisma.membership.findFirstOrThrow({ where: { userId: lead.id, organizationId: organization.id } })
    expect(membership).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' })
    expect(await prisma.membership.count({ where: { userId: lead.id, status: 'ACTIVE' } })).toBe(2)
    expect(cookieJar.get(ACTIVE_ORG_COOKIE)).toBe(organization.id)

    expect((await acceptInvitation(req('POST', '/api/invitations/accept', acceptBody(token)), noParams)).status).toBe(410)
  })

  it('stops working once revoked', async () => {
    const { id, token } = await invite('lead@beta.test')
    expect((await revokeInvitation(req('DELETE', `/api/invitations/${id}`), ctx({ id }))).status).toBe(204)
    const lead = await createUser({ name: 'Lee Lead', email: 'lead@beta.test' })
    signIn(lead)
    expect((await acceptInvitation(req('POST', '/api/invitations/accept', acceptBody(token)), noParams)).status).toBe(410)
  })
})

describe('joining an organization', () => {
  it('a member can ask, an admin approves, and duplicates are refused', async () => {
    signIn(carol)
    const res = await requestToJoin(req('POST', '/api/memberships', { organizationId: acme.id, message: 'New on SRE' }), noParams)
    expect(res.status).toBe(201)
    expect((await requestToJoin(req('POST', '/api/memberships', { organizationId: acme.id }), noParams)).status).toBe(409)
    const pending = await prisma.membership.findFirstOrThrow({ where: { userId: carol.id } })
    expect(pending).toMatchObject({ status: 'PENDING', role: 'REPORTER', message: 'New on SRE' })

    // Carol cannot approve herself
    expect((await decideMembership(patch(`/api/memberships/${pending.id}`, { status: 'ACTIVE' }), ctx({ id: pending.id }))).status).toBe(403)

    signIn(admin, { orgId: acme.id })
    const approved = await decideMembership(patch(`/api/memberships/${pending.id}`, { status: 'ACTIVE' }), ctx({ id: pending.id }))
    expect(approved.status).toBe(200)
    expect(await prisma.membership.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: 'ACTIVE', decidedBy: admin.email })
  })

  it('requires a finished profile', async () => {
    const fresh = await createUser({ name: 'Fresh', email: 'fresh@example.test' }, { onboarded: false })
    signIn(fresh)
    expect((await requestToJoin(req('POST', '/api/memberships', { organizationId: acme.id }), noParams)).status).toBe(400)
  })

  it('an admin of another organization cannot decide requests here', async () => {
    const beta = await createOrg('Beta Health')
    const betaAdmin = await createUser({ name: 'Bea', email: 'bea@beta.test' })
    await addMembership(beta.id, betaAdmin.id, { role: 'ADMIN' })
    const { id } = await addMembership(acme.id, carol.id, { status: 'PENDING' })

    signIn(betaAdmin, { orgId: beta.id })
    expect((await decideMembership(patch(`/api/memberships/${id}`, { status: 'ACTIVE' }), ctx({ id }))).status).toBe(404)
    expect((await removeMembership(req('DELETE', `/api/memberships/${id}`), ctx({ id }))).status).toBe(403)
  })
})

describe('roles and leaving', () => {
  it('never leaves an organization without an admin', async () => {
    const adminMembership = await prisma.membership.findFirstOrThrow({ where: { userId: admin.id } })
    signIn(admin, { orgId: acme.id })
    expect((await decideMembership(patch(`/api/memberships/${adminMembership.id}`, { role: 'REPORTER' }), ctx({ id: adminMembership.id }))).status).toBe(400)
    expect((await removeMembership(req('DELETE', `/api/memberships/${adminMembership.id}`), ctx({ id: adminMembership.id }))).status).toBe(400)

    // With a second admin, stepping down works
    await addMembership(acme.id, carol.id, { role: 'ADMIN' })
    expect((await decideMembership(patch(`/api/memberships/${adminMembership.id}`, { role: 'REPORTER' }), ctx({ id: adminMembership.id }))).status).toBe(200)
  })

  it('members can leave on their own', async () => {
    const { id } = await addMembership(acme.id, carol.id)
    signIn(carol, { orgId: acme.id })
    expect((await removeMembership(req('DELETE', `/api/memberships/${id}`), ctx({ id }))).status).toBe(204)
    expect(await prisma.membership.count({ where: { userId: carol.id } })).toBe(0)
  })

  it('people can belong to several organizations and work in the one they pick', async () => {
    const beta = await createOrg('Beta Health')
    await addMembership(acme.id, carol.id)
    await addMembership(beta.id, carol.id, { role: 'VERIFIER' })
    const inBeta = await loadSession(carol.id, beta.id)
    expect(inBeta.membership).toMatchObject({ organization: { id: beta.id }, role: 'VERIFIER' })
    expect(inBeta.memberships).toHaveLength(2)
    expect((await loadSession(carol.id, acme.id)).membership?.organization.id).toBe(acme.id)
  })
})

describe('organization settings and suspension', () => {
  it('admins edit their own organization; others cannot; names stay unique', async () => {
    await createOrg('Beta Health')
    signIn(admin, { orgId: acme.id })
    const ok = await updateOrganization(patch(`/api/organizations/${acme.id}`, { action: 'update', details: { name: 'Acme Cloud Inc', website: 'acme.test' } }), ctx({ id: acme.id }))
    expect(ok.status).toBe(200)
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: acme.id } })).toMatchObject({ name: 'Acme Cloud Inc', website: 'https://acme.test' })

    const dup = await updateOrganization(patch(`/api/organizations/${acme.id}`, { action: 'update', details: { name: 'beta health' } }), ctx({ id: acme.id }))
    expect(dup.status).toBe(409)

    await addMembership(acme.id, carol.id)
    signIn(carol, { orgId: acme.id })
    expect((await updateOrganization(patch(`/api/organizations/${acme.id}`, { action: 'update', details: { name: 'Hijacked' } }), ctx({ id: acme.id }))).status).toBe(403)
  })

  it('only superadmins suspend; suspension hides the organization and keeps every row', async () => {
    const incident = await seedIncident({ organizationId: acme.id })
    await addMembership(acme.id, carol.id)

    signIn(admin, { orgId: acme.id })
    expect((await updateOrganization(patch(`/api/organizations/${acme.id}`, { action: 'suspend', reason: 'Contract ended' }), ctx({ id: acme.id }))).status).toBe(403)

    signIn(superadmin)
    const res = await updateOrganization(patch(`/api/organizations/${acme.id}`, { action: 'suspend', reason: 'Contract ended' }), ctx({ id: acme.id }))
    expect(res.status).toBe(200)
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: acme.id } })).toMatchObject({ suspendedBy: superadmin.email, suspendedReason: 'Contract ended' })
    expect((await updateOrganization(patch(`/api/organizations/${acme.id}`, { action: 'suspend', reason: 'Again please' }), ctx({ id: acme.id }))).status).toBe(409)

    // Members lose access, newcomers cannot find or join it, nothing is deleted
    expect((await loadSession(carol.id, acme.id)).membership).toBeNull()
    const outsider = await createUser({ name: 'Out Sider', email: 'out@example.test' })
    signIn(outsider)
    const listed = await json<{ items: { id: string }[] }>(await listOrganizations(req('GET', '/api/organizations'), noParams))
    expect(listed.items.map(o => o.id)).not.toContain(acme.id)
    expect((await requestToJoin(req('POST', '/api/memberships', { organizationId: acme.id }), noParams)).status).toBe(404)
    expect(await prisma.incident.count({ where: { id: incident.id } })).toBe(1)
    expect(await prisma.membership.count({ where: { organizationId: acme.id } })).toBe(2)

    // Reactivating restores access
    signIn(superadmin)
    expect((await updateOrganization(patch(`/api/organizations/${acme.id}`, { action: 'reactivate' }), ctx({ id: acme.id }))).status).toBe(200)
    expect((await loadSession(carol.id, acme.id)).membership?.organization.id).toBe(acme.id)
  })

  it('organizations can never be deleted', async () => {
    signIn(superadmin)
    expect((await updateOrganization(patch(`/api/organizations/${acme.id}`, { action: 'delete' }), ctx({ id: acme.id }))).status).toBe(400)
    // The database refuses too, as long as the organization has incidents
    await seedIncident({ organizationId: acme.id })
    await expect(prisma.organization.delete({ where: { id: acme.id } })).rejects.toThrow()
  })
})

describe('switching organizations', () => {
  const switchTo = (org: string, next: string): Promise<Response> =>
    switchOrg(new Request(`http://localhost:3000/switch-org?org=${org}&next=${next}`))

  it('switches into active organizations only', async () => {
    const beta = await createOrg('Beta Health', { suspendedAt: new Date() })
    await addMembership(acme.id, carol.id)
    await addMembership(beta.id, carol.id)
    signIn(carol)

    const ok = await switchTo(acme.id, '/incidents')
    expect(ok.headers.get('location')).toBe('http://localhost:3000/incidents')
    expect(ok.headers.get('set-cookie')).toContain(`${ACTIVE_ORG_COOKIE}=${acme.id}`)

    const suspended = await switchTo(beta.id, '/dashboard')
    expect(suspended.headers.get('set-cookie')).toBeNull()
  })

  it('never redirects off-site', async () => {
    await addMembership(acme.id, carol.id)
    signIn(carol)
    for (const next of ['%2F%09%2Fevil.com', '%2F%2Fevil.com', 'https%3A%2F%2Fevil.com', '%2F%5Cevil.com']) {
      const res = await switchTo(acme.id, next)
      expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard')
    }
  })
})

describe('admins adding members by email', () => {
  const invite = (body: object): Promise<Response> => inviteMember(req('POST', '/api/member-invites', body), noParams)
  const accept = (id: string): Promise<Response> => acceptMemberInvite(req('POST', `/api/member-invites/${id}/accept`, {}), ctx({ id }))

  it('only admins can add people', async () => {
    await addMembership(acme.id, carol.id)
    signIn(carol, { orgId: acme.id })
    expect((await invite({ email: 'dev@example.test' })).status).toBe(403)
  })

  it('invites someone who has no account yet; they accept after signing up, with the chosen position and access', async () => {
    signIn(admin, { orgId: acme.id })
    const res = await invite({ email: 'New.Dev@Example.test', role: 'VERIFIER', position: 'TEAM_LEAD' })
    expect(res.status).toBe(201)
    expect(await json(res)).toMatchObject({ outcome: 'invited', email: 'new.dev@example.test' })

    const dev = await createUser({ name: 'New Dev', email: 'new.dev@example.test' })
    const session = await loadSession(dev.id, null)
    expect(session.invites).toEqual([expect.objectContaining({ role: 'VERIFIER', position: 'TEAM_LEAD', organization: { id: acme.id, name: 'Acme Cloud' } })])

    signIn(dev)
    const accepted = await accept(session.invites[0]!.id)
    expect(accepted.status).toBe(200)
    expect(await prisma.membership.findFirstOrThrow({ where: { userId: dev.id, organizationId: acme.id } }))
      .toMatchObject({ status: 'ACTIVE', role: 'VERIFIER', position: 'TEAM_LEAD', decidedBy: admin.email })
    expect(await prisma.memberInvite.count()).toBe(0)
    expect(cookieJar.get(ACTIVE_ORG_COOKIE)).toBe(acme.id)
    expect((await loadSession(dev.id, null)).invites).toEqual([])
  })

  it('approves straight away someone who had already asked to join', async () => {
    await addMembership(acme.id, carol.id, { status: 'PENDING' })
    signIn(admin, { orgId: acme.id })
    const res = await invite({ email: carol.email, role: 'VIEWER', position: 'CXO' })
    expect(await json(res)).toMatchObject({ outcome: 'approved' })
    expect(await prisma.membership.findFirstOrThrow({ where: { userId: carol.id } })).toMatchObject({ status: 'ACTIVE', role: 'VIEWER', position: 'CXO' })
    expect(await prisma.memberInvite.count()).toBe(0)
  })

  it('refuses to invite an existing member', async () => {
    await addMembership(acme.id, carol.id)
    signIn(admin, { orgId: acme.id })
    expect((await invite({ email: carol.email })).status).toBe(409)
  })

  it('can only be accepted by the verified, onboarded owner of the address', async () => {
    signIn(admin, { orgId: acme.id })
    const { id } = await json<{ id: string }>(await invite({ email: carol.email }))

    const other = await createUser({ name: 'Other', email: 'other@example.test' })
    signIn(other)
    expect((await accept(id)).status).toBe(404)
    signIn(carol, { verified: false })
    expect((await accept(id)).status).toBe(403)
    await prisma.user.update({ where: { id: carol.id }, data: { onboardedAt: null } })
    signIn(carol)
    expect((await accept(id)).status).toBe(400)
    expect(await prisma.membership.count({ where: { userId: carol.id } })).toBe(0)
  })

  it('can be declined by the invitee or revoked by an admin, but not removed by anyone else', async () => {
    signIn(admin, { orgId: acme.id })
    const first = await json<{ id: string }>(await invite({ email: carol.email }))
    const second = await json<{ id: string }>(await invite({ email: 'someone@example.test' }))

    const other = await createUser({ name: 'Other', email: 'other@example.test' })
    signIn(other)
    expect((await deleteMemberInvite(req('DELETE', `/api/member-invites/${first.id}`), ctx({ id: first.id }))).status).toBe(403)

    signIn(carol)
    expect((await deleteMemberInvite(req('DELETE', `/api/member-invites/${first.id}`), ctx({ id: first.id }))).status).toBe(204)
    signIn(admin, { orgId: acme.id })
    expect((await deleteMemberInvite(req('DELETE', `/api/member-invites/${second.id}`), ctx({ id: second.id }))).status).toBe(204)
    expect(await prisma.memberInvite.count()).toBe(0)
  })

  it('hides invitations to suspended organizations', async () => {
    signIn(admin, { orgId: acme.id })
    const { id } = await json<{ id: string }>(await invite({ email: carol.email }))
    await prisma.organization.update({ where: { id: acme.id }, data: { suspendedAt: new Date() } })
    expect((await loadSession(carol.id, null)).invites).toEqual([])
    signIn(carol)
    expect((await accept(id)).status).toBe(404)
  })
})

describe('positions', () => {
  it('admins set a position on approval and change or clear it later, separately from access', async () => {
    const { id } = await addMembership(acme.id, carol.id, { status: 'PENDING' })
    signIn(admin, { orgId: acme.id })
    await decideMembership(patch(`/api/memberships/${id}`, { status: 'ACTIVE', role: 'VERIFIER', position: 'TEAM_LEAD' }), ctx({ id }))
    expect(await prisma.membership.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'ACTIVE', role: 'VERIFIER', position: 'TEAM_LEAD' })

    await decideMembership(patch(`/api/memberships/${id}`, { position: 'MANAGER' }), ctx({ id }))
    expect(await prisma.membership.findUniqueOrThrow({ where: { id } })).toMatchObject({ role: 'VERIFIER', position: 'MANAGER' })

    await decideMembership(patch(`/api/memberships/${id}`, { position: null }), ctx({ id }))
    expect((await prisma.membership.findUniqueOrThrow({ where: { id } })).position).toBeNull()

    expect((await decideMembership(patch(`/api/memberships/${id}`, { position: 'EMPEROR' }), ctx({ id }))).status).toBe(400)
  })
})
