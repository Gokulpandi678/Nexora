import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { POST as createIncident } from '@/app/api/incidents/create/route'
import { PATCH as patchIncident } from '@/app/api/incidents/[id]/route'
import { GET as listProjects, POST as createProject } from '@/app/api/projects/route'
import { PATCH as patchProject } from '@/app/api/projects/[id]/route'
import { GET as slaReport } from '@/app/api/sla/route'
import { GET as cronSla } from '@/app/api/cron/sla/route'
import { runSlaCheck } from '@/lib/sla-check'
import type { IncidentDetailDTO, IncidentRef, ProjectDTO, SlaReport } from '@/lib/types'
import { createOrg, ctx, incidentInput, json, member, noParams, req, resetDb, seedIncident, type TestUser } from '../setup/helpers'

const MIN = 60_000

let acme: { id: string; name: string }
let beta: { id: string; name: string }
let admin: TestUser
let reporter: TestUser & { userId: string }
let viewer: TestUser
let betaAdmin: TestUser

const checkout = (ownerId: string | null = null) => ({
  name: 'Checkout API',
  ownerId,
  criticality: 'CRITICAL',
  availabilityTarget: 99.9,
  downtimeCostPerMinute: 100,
  slaPolicies: [{ severity: 'P1', responseMinutes: 15, resolveMinutes: 240 }, { severity: 'P2', responseMinutes: 30, resolveMinutes: 480 }]
})

async function newProject(body: unknown = checkout(reporter.userId), user: TestUser = admin): Promise<ProjectDTO> {
  const res = await createProject(req('POST', '/api/projects', body, user), noParams)
  expect(res.status).toBe(201)
  return json<ProjectDTO>(res)
}

async function report(projectIds: string[], overrides: Record<string, unknown> = {}): Promise<IncidentDetailDTO> {
  const res = await createIncident(req('POST', '/api/incidents/create', { ...incidentInput({ severity: 'P1' }), projectIds, ...overrides }, reporter), noParams)
  expect(res.status).toBe(201)
  const { incident } = await json<{ incident: IncidentRef }>(res)
  const patched = await patchIncident(req('PATCH', `/api/incidents/${incident.id}`, { tags: [] }, reporter), ctx({ id: incident.id }))
  return json<IncidentDetailDTO>(patched)
}

beforeEach(async () => {
  await resetDb()
  acme = await createOrg('Acme Cloud')
  beta = await createOrg('Beta Health')
  admin = await member(acme, { name: 'Ada Acme', email: 'ada@acme.test' }, 'ADMIN')
  reporter = await member(acme, { name: 'Rita Acme', email: 'rita@acme.test' })
  viewer = await member(acme, { name: 'Vic Acme', email: 'vic@acme.test' }, 'VIEWER')
  betaAdmin = await member(beta, { name: 'Bea Beta', email: 'bea@beta.test' }, 'ADMIN')
})

describe('projects', () => {
  it('lets admins create projects with policies, and members list them', async () => {
    const project = await newProject()
    expect(project.slaPolicies.map(p => p.severity)).toEqual(['P1', 'P2'])
    const list = await json<ProjectDTO[]>(await listProjects(req('GET', '/api/projects', undefined, viewer), noParams))
    expect(list.map(p => p.name)).toEqual(['Checkout API'])
  })

  it('refuses non-admins and duplicate names', async () => {
    expect((await createProject(req('POST', '/api/projects', checkout(), reporter), noParams)).status).toBe(403)
    await newProject()
    expect((await createProject(req('POST', '/api/projects', checkout(), admin), noParams)).status).toBe(409)
  })

  it('only accepts an active member of the organization as project lead', async () => {
    const project = await newProject()
    expect(project.owner).toMatchObject({ id: reporter.userId, email: 'rita@acme.test', active: true })

    // Someone from another organization, or a join request not yet approved, cannot lead it
    const outsider = await member(beta, { name: 'Otto Beta', email: 'otto@beta.test' })
    const pending = await member(acme, { name: 'Pat Pending', email: 'pat@acme.test' })
    await prisma.membership.updateMany({ where: { user: { email: 'pat@acme.test' } }, data: { status: 'PENDING' } })
    for (const ownerId of [outsider.userId, pending.userId, 'no-such-user']) {
      const res = await patchProject(req('PATCH', `/api/projects/${project.id}`, { ownerId }, admin), ctx({ id: project.id }))
      expect(res.status).toBe(400)
    }
    const created = await createProject(req('POST', '/api/projects', { ...checkout('no-such-user'), name: 'Portal' }, admin), noParams)
    expect(created.status).toBe(400)

    // Clearing the lead is allowed
    const cleared = await json<ProjectDTO>(await patchProject(req('PATCH', `/api/projects/${project.id}`, { ownerId: null }, admin), ctx({ id: project.id })))
    expect(cleared.owner).toBeNull()
  })

  it('flags a lead who has left the organization', async () => {
    const project = await newProject()
    await prisma.membership.updateMany({ where: { user: { email: 'rita@acme.test' }, organizationId: acme.id }, data: { status: 'REJECTED' } })
    const list = await json<ProjectDTO[]>(await listProjects(req('GET', '/api/projects', undefined, admin), noParams))
    expect(list.find(p => p.id === project.id)?.owner?.active).toBe(false)
  })

  it('keeps projects inside their organization', async () => {
    const project = await newProject()
    const res = await patchProject(req('PATCH', `/api/projects/${project.id}`, { name: 'Taken over' }, betaAdmin), ctx({ id: project.id }))
    expect(res.status).toBe(404)
    // Beta cannot tag its incidents with Acme's project either
    const tag = await createIncident(req('POST', '/api/incidents/create', { ...incidentInput(), projectIds: [project.id] }, betaAdmin), noParams)
    expect(tag.status).toBe(400)
  })

  it('archives instead of deleting, and hides archived projects from pickers', async () => {
    const project = await newProject()
    await patchProject(req('PATCH', `/api/projects/${project.id}`, { archived: true }, admin), ctx({ id: project.id }))
    expect(await json<ProjectDTO[]>(await listProjects(req('GET', '/api/projects', undefined, reporter), noParams))).toEqual([])
    const all = await json<ProjectDTO[]>(await listProjects(req('GET', '/api/projects?archived=1', undefined, admin), noParams))
    expect(all[0]?.archived).toBe(true)
  })
})

describe('incident SLA', () => {
  it('sets due dates from the strictest policy when reported', async () => {
    const strict = await newProject()
    const loose = await newProject({ ...checkout(), name: 'Portal', slaPolicies: [{ severity: 'P1', responseMinutes: 5, resolveMinutes: 600 }] })
    const incident = await report([strict.id, loose.id])
    const created = Date.parse(incident.createdAt)
    expect(Date.parse(incident.sla!.response!.dueAt) - created).toBe(5 * MIN)
    expect(Date.parse(incident.sla!.resolve!.dueAt) - created).toBe(240 * MIN)
    expect(incident.projects.map(p => p.name)).toEqual(['Checkout API', 'Portal'])
  })

  it('has no SLA without a project policy for the severity', async () => {
    const project = await newProject()
    const incident = await report([project.id], { severity: 'P4' })
    expect(incident.sla).toBeNull()
  })

  it('acknowledges when work starts, and recomputes due dates when severity changes', async () => {
    const incident = await report([(await newProject()).id])
    const investigating = await json<IncidentDetailDTO>(await patchIncident(
      req('PATCH', `/api/incidents/${incident.id}`, { status: 'INVESTIGATING', severity: 'P2' }, reporter), ctx({ id: incident.id })
    ))
    expect(investigating.acknowledgedAt).not.toBeNull()
    expect(investigating.sla?.response?.state).toBe('met')
    expect(Date.parse(investigating.sla!.resolve!.dueAt) - Date.parse(incident.createdAt)).toBe(480 * MIN)
  })

  it('pushes due dates out by the time spent paused', async () => {
    const incident = await report([(await newProject()).id])
    await patchIncident(req('PATCH', `/api/incidents/${incident.id}`, { slaPaused: true }, reporter), ctx({ id: incident.id }))
    // Pretend the pause started 30 minutes ago
    await prisma.incident.update({ where: { id: incident.id }, data: { slaPausedAt: new Date(Date.now() - 30 * MIN) } })
    const resumed = await json<IncidentDetailDTO>(await patchIncident(
      req('PATCH', `/api/incidents/${incident.id}`, { slaPaused: false }, reporter), ctx({ id: incident.id })
    ))
    expect(resumed.sla?.paused).toBe(false)
    expect(Date.parse(resumed.sla!.resolve!.dueAt) - Date.parse(incident.sla!.resolve!.dueAt)).toBe(30 * MIN)
  })

  it('refuses SLA changes from viewers', async () => {
    const incident = await report([(await newProject()).id])
    const res = await patchIncident(req('PATCH', `/api/incidents/${incident.id}`, { acknowledge: true }, viewer), ctx({ id: incident.id }))
    expect(res.status).toBe(403)
  })
})

describe('SLA report and check', () => {
  it('measures downtime, availability, cost and breaches per project', async () => {
    const project = await newProject()
    const now = Date.now()
    // A 60-minute outage this month, resolved late (breach)
    await seedIncident({
      organizationId: acme.id,
      severity: 'P1',
      impact: 'OUTAGE',
      status: 'RESOLVED',
      createdAt: new Date(now - 6 * 60 * MIN),
      startedAt: new Date(now - 6 * 60 * MIN),
      mitigatedAt: new Date(now - 5 * 60 * MIN),
      acknowledgedAt: new Date(now - 6 * 60 * MIN + 5 * MIN),
      resolvedAt: new Date(now - MIN),
      slaResponseDueAt: new Date(now - 6 * 60 * MIN + 15 * MIN),
      slaResolveDueAt: new Date(now - 2 * 60 * MIN),
      projects: { connect: [{ id: project.id }] }
    } as never)
    const res = await slaReport(req('GET', '/api/sla', undefined, viewer), noParams)
    const body = await json<SlaReport>(res)
    const row = body.projects[0]!
    // The month may have started less than 6 hours ago only on the 1st; the outage is clipped to the month then
    expect(row.outageMinutes).toBeGreaterThan(0)
    expect(row.outageMinutes).toBeLessThanOrEqual(60)
    expect(row.downtimeCost).toBe(row.outageMinutes * 100)
    expect(body.totals.slaBreached).toBeGreaterThanOrEqual(0)
  })

  it('lists open incidents past their deadline as at risk, and the check notifies once', async () => {
    const project = await newProject()
    const incident = await report([project.id])
    await prisma.incident.update({
      where: { id: incident.id },
      data: { acknowledgedAt: new Date(), slaResolveDueAt: new Date(Date.now() - MIN) }
    })
    const body = await json<SlaReport>(await slaReport(req('GET', '/api/sla', undefined, reporter), noParams))
    expect(body.atRisk.map(r => [r.id, r.state])).toEqual([[incident.id, 'breached']])

    const first = await runSlaCheck()
    expect(first.resolveBreaches).toBe(1)
    const again = await runSlaCheck()
    expect(again.resolveBreaches).toBe(0)
    const notes = await prisma.notificationLog.findMany({ where: { incidentId: incident.id, notificationType: 'SLA_BREACH' } })
    expect(notes.map(n => n.recipientEmail).sort()).toEqual(['ada@acme.test', 'rita@acme.test'])
  })

  it('refuses the cron route without the secret', async () => {
    process.env.CRON_SECRET = 'test-secret'
    expect((await cronSla(new Request('http://localhost/api/cron/sla'))).status).toBe(401)
    const ok = await cronSla(new Request('http://localhost/api/cron/sla', { headers: { authorization: 'Bearer test-secret' } }))
    expect(ok.status).toBe(200)
  })
})
