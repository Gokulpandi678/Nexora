import { beforeEach, describe, expect, it } from 'vitest'
import type { Incident } from '@prisma/client'
import { prisma } from '@/lib/db'
import { POST as createIncident } from '@/app/api/incidents/create/route'
import { GET as listIncidents } from '@/app/api/incidents/route'
import { GET as searchIncidents } from '@/app/api/incidents/search/route'
import { DELETE as deleteIncident, GET as getIncident, PATCH as patchIncident } from '@/app/api/incidents/[id]/route'
import { GET as listSolutions, POST as addSolution } from '@/app/api/incidents/[id]/solutions/route'
import { GET as listComments, POST as addComment } from '@/app/api/incidents/[id]/comments/route'
import { GET as listActivity } from '@/app/api/incidents/[id]/activity/route'
import { GET as getMatches } from '@/app/api/incidents/[id]/matches/route'
import { POST as linkIncident } from '@/app/api/incidents/[id]/link/route'
import { PATCH as updateLink } from '@/app/api/links/[id]/route'
import { GET as getSolution } from '@/app/api/solutions/[id]/route'
import { PATCH as verifySolution } from '@/app/api/solutions/[id]/verify/route'
import { GET as getEffectiveness } from '@/app/api/solutions/[id]/effectiveness/route'
import { GET as dashboardStats } from '@/app/api/stats/dashboard/route'
import { GET as systemStats } from '@/app/api/stats/systems/route'
import { GET as exportCsv } from '@/app/api/export/csv/route'
import { GET as searchPeople } from '@/app/api/people/route'
import { GET as listNotifications } from '@/app/api/notifications/route'
import type { DashboardStats, IncidentListItem, IncidentRef, Paginated, Person, SimilarIncident, SystemStat } from '@/lib/types'
import {
  createOrg, ctx, incidentInput, json, member, noParams, req, resetDb, seedIncident, type TestUser
} from '../setup/helpers'

/*
 * Tenant isolation: two organizations, each with an incident (plus a solution and a link on Beta's side).
 * Every incident route is called by Acme's members against Beta's data and must behave as if it does not
 * exist, while Acme's own data keeps working.
 */

const SHARED_TITLE = 'Checkout API returns 504 when the database connection pool is exhausted under load'

let acme: { id: string; name: string }
let beta: { id: string; name: string }
let alice: TestUser // Acme reporter
let aliceAdmin: TestUser // Acme admin
let aliceVerifier: TestUser // Acme QA verifier
let bob: TestUser // Beta reporter
let incA: Incident
let incB: Incident
let incB2: Incident
let solutionB: string
let linkB: string

beforeEach(async () => {
  await resetDb()
  acme = await createOrg('Acme Cloud')
  beta = await createOrg('Beta Health')
  alice = await member(acme, { name: 'Alice Acme', email: 'alice@acme.test' })
  aliceAdmin = await member(acme, { name: 'Ada Acme', email: 'ada@acme.test' }, 'ADMIN')
  aliceVerifier = await member(acme, { name: 'Vera Acme', email: 'vera@acme.test' }, 'VERIFIER')
  bob = await member(beta, { name: 'Bob Beta', email: 'bob@beta.test' })

  incA = await seedIncident({ organizationId: acme.id, title: `${SHARED_TITLE} (acme)`, createdBy: alice.name, email: alice.email })
  incB = await seedIncident({ organizationId: beta.id, title: `${SHARED_TITLE} (beta)`, createdBy: bob.name, email: bob.email })
  incB2 = await seedIncident({ organizationId: beta.id, title: `${SHARED_TITLE} (beta again)`, createdBy: bob.name, email: bob.email })

  const solution = await prisma.solution.create({
    data: {
      incidentId: incB.id, rootCause: 'Leaked transaction', approach: 'Close it', timeToFix: 15, efficiency: 'HIGH',
      useCaseNotes: 'When the pool is pinned', qaChecks: [], solvedBy: bob.name, email: bob.email
    }
  })
  solutionB = solution.id
  const link = await prisma.matchLink.create({ data: { newIncidentId: incB2.id, originalIncidentId: incB.id, matchType: 'SAME' } })
  linkB = link.id
})

describe('lists, search and stats', () => {
  it('lists only the caller’s organization', async () => {
    const a = await json<Paginated<IncidentListItem>>(await listIncidents(req('GET', '/api/incidents', undefined, alice), noParams))
    expect(a.items.map(i => i.id)).toEqual([incA.id])
    const b = await json<Paginated<IncidentListItem>>(await listIncidents(req('GET', '/api/incidents', undefined, bob), noParams))
    expect(b.items.map(i => i.id).sort()).toEqual([incB.id, incB2.id].sort())
  })

  it('searches only the caller’s organization', async () => {
    const res = await searchIncidents(req('GET', '/api/incidents/search?q=checkout', undefined, alice), noParams)
    const body = await json<Paginated<IncidentListItem>>(res)
    expect(body.items.map(i => i.id)).toEqual([incA.id])
  })

  it('counts only the caller’s organization in stats', async () => {
    const dash = await json<DashboardStats>(await dashboardStats(req('GET', '/api/stats/dashboard', undefined, alice), noParams))
    expect(dash.totals.all).toBe(1)
    expect(dash.recent.map(r => r.id)).toEqual([incA.id])
    const systems = await json<SystemStat[]>(await systemStats(req('GET', '/api/stats/systems', undefined, bob), noParams))
    expect(systems.find(s => s.system === 'Database')?.incidents).toBe(2)
  })

  it('exports only the caller’s organization', async () => {
    const csv = await (await exportCsv(req('GET', '/api/export/csv', undefined, alice), noParams)).text()
    expect(csv).toContain(incA.id)
    expect(csv).not.toContain(incB.id)
    expect(csv.trim().split('\r\n')).toHaveLength(2) // header + Acme's one incident
  })
})

describe('another organization’s incident behaves as if it does not exist', () => {
  it('cannot be read', async () => {
    expect((await getIncident(req('GET', `/api/incidents/${incB.id}`, undefined, alice), ctx({ id: incB.id }))).status).toBe(404)
    expect((await getIncident(req('GET', `/api/incidents/${incA.id}`, undefined, alice), ctx({ id: incA.id }))).status).toBe(200)
  })

  it('cannot be updated or deleted', async () => {
    const patch = await patchIncident(req('PATCH', `/api/incidents/${incB.id}`, { status: 'RESOLVED' }, alice), ctx({ id: incB.id }))
    expect(patch.status).toBe(404)
    const del = await deleteIncident(req('DELETE', `/api/incidents/${incB.id}`, undefined, aliceAdmin), ctx({ id: incB.id }))
    expect(del.status).toBe(404)
    const after = await prisma.incident.findUniqueOrThrow({ where: { id: incB.id } })
    expect(after).toMatchObject({ status: 'OPEN', deletedAt: null })
  })

  it('hides its solutions, comments and activity, and refuses new ones', async () => {
    expect(await json(await listSolutions(req('GET', `/api/incidents/${incB.id}/solutions`, undefined, alice), ctx({ id: incB.id })))).toEqual([])
    const sol = await addSolution(req('POST', `/api/incidents/${incB.id}/solutions`, {
      rootCause: 'x'.repeat(20), approach: 'y'.repeat(20), useCaseNotes: 'z'.repeat(20), timeToFix: 5, efficiency: 'LOW', qaChecks: []
    }, alice), ctx({ id: incB.id }))
    expect(sol.status).toBe(404)

    const comments = await json<Paginated<unknown>>(await listComments(req('GET', `/api/incidents/${incB.id}/comments`, undefined, alice), ctx({ id: incB.id })))
    expect(comments.total).toBe(0)
    expect((await addComment(req('POST', `/api/incidents/${incB.id}/comments`, { content: 'hello' }, alice), ctx({ id: incB.id }))).status).toBe(404)

    expect((await listActivity(req('GET', `/api/incidents/${incB.id}/activity`, undefined, alice), ctx({ id: incB.id }))).status).toBe(404)
  })

  it('cannot be matched, linked or used as a link target', async () => {
    expect((await getMatches(req('GET', `/api/incidents/${incB.id}/matches`, undefined, alice), ctx({ id: incB.id }))).status).toBe(404)
    const link = await linkIncident(
      req('POST', `/api/incidents/${incA.id}/link`, { originalIncidentId: incB.id, matchType: 'SAME' }, alice),
      ctx({ id: incA.id })
    )
    expect(link.status).toBe(404)
    expect(await prisma.matchLink.count({ where: { newIncidentId: incA.id } })).toBe(0)
  })

  it('hides its solutions and links by id', async () => {
    expect((await getSolution(req('GET', `/api/solutions/${solutionB}`, undefined, alice), ctx({ id: solutionB }))).status).toBe(404)
    expect((await getEffectiveness(req('GET', `/api/solutions/${solutionB}/effectiveness`, undefined, alice), ctx({ id: solutionB }))).status).toBe(404)
    const verify = await verifySolution(req('PATCH', `/api/solutions/${solutionB}/verify`, { status: 'VERIFIED' }, aliceVerifier), ctx({ id: solutionB }))
    expect(verify.status).toBe(404)
    expect((await prisma.solution.findUniqueOrThrow({ where: { id: solutionB } })).status).toBe('UNVERIFIED')

    const linkRes = await updateLink(req('PATCH', `/api/links/${linkB}`, { didSolutionWork: true }, alice), ctx({ id: linkB }))
    expect(linkRes.status).toBe(404)
  })
})

describe('matching and creation', () => {
  it('never suggests another organization’s incidents, even with identical wording', async () => {
    const res = await createIncident(req('POST', '/api/incidents/create', incidentInput({ title: `${SHARED_TITLE} (new)` }), alice), noParams)
    expect(res.status).toBe(201)
    const body = await json<{ incident: IncidentRef; similarIncidents: SimilarIncident[] }>(res)
    const ids = body.similarIncidents.map(m => m.id)
    expect(ids).toContain(incA.id)
    expect(ids).not.toContain(incB.id)
    expect(ids).not.toContain(incB2.id)
  })

  it('files new incidents under the reporter’s organization and as the reporter', async () => {
    const res = await createIncident(
      req('POST', '/api/incidents/create', incidentInput({ createdBy: 'Somebody Else', email: 'else@evil.test' }), alice),
      noParams
    )
    const { incident } = await json<{ incident: IncidentRef }>(res)
    const saved = await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } })
    expect(saved).toMatchObject({ organizationId: acme.id, createdBy: alice.name, email: alice.email })
  })
})

describe('people and notifications', () => {
  it('suggests only members of the caller’s organization for @mentions', async () => {
    const people = await json<Person[]>(await searchPeople(req('GET', '/api/people?q=', undefined, alice), noParams))
    const emails = people.map(p => p.email).sort()
    expect(emails).toEqual(['ada@acme.test', 'alice@acme.test', 'vera@acme.test'])
  })

  it('shows only the current organization’s notifications', async () => {
    await prisma.notificationLog.createMany({
      data: [
        { recipientEmail: alice.email, incidentId: incA.id, notificationType: 'MENTION', title: 'acme', organizationId: acme.id },
        { recipientEmail: alice.email, incidentId: incB.id, notificationType: 'MENTION', title: 'beta', organizationId: beta.id }
      ]
    })
    const body = await json<{ items: { title: string }[]; unread: number }>(
      await listNotifications(req('GET', '/api/notifications', undefined, alice), noParams)
    )
    expect(body.items.map(n => n.title)).toEqual(['acme'])
    expect(body.unread).toBe(1)
  })
})
