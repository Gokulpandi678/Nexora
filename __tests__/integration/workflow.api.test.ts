import { beforeEach, describe, expect, it } from 'vitest'
import type { Incident } from '@prisma/client'
import { prisma } from '@/lib/db'
import { GET as listSolutions, POST as addSolution } from '@/app/api/incidents/[id]/solutions/route'
import { GET as getSolution } from '@/app/api/solutions/[id]/route'
import { PATCH as verifySolution } from '@/app/api/solutions/[id]/verify/route'
import { GET as getEffectiveness } from '@/app/api/solutions/[id]/effectiveness/route'
import { POST as linkIncident } from '@/app/api/incidents/[id]/link/route'
import { PATCH as updateLink } from '@/app/api/links/[id]/route'
import { GET as listComments, POST as addComment } from '@/app/api/incidents/[id]/comments/route'
import { GET as listNotifications, PATCH as markRead } from '@/app/api/notifications/route'
import { GET as searchPeople } from '@/app/api/people/route'
import { GET as listActivity } from '@/app/api/incidents/[id]/activity/route'
import { GET as getMatches } from '@/app/api/incidents/[id]/matches/route'
import type {
  ActivityDTO, CommentDTO, MatchLinkDTO, NotificationDTO, Paginated, Person, SimilarIncident, SolutionDTO,
  SolutionEffectiveness
} from '@/lib/types'
import type { CreateLinkInput } from '@/lib/validators'
import {
  admin, ctx, json, noParams, req, reporter, resetDb, seedIncident, verifier, type TestUser
} from '../setup/helpers'

const solutionInput = {
  rootCause: 'Retry path leaked connections on timeout',
  approach: 'Release connections in a finally block and cap retries',
  useCaseNotes: 'Use when the pool sits at max while queries are fast',
  timeToFix: 40,
  efficiency: 'HIGH',
  qaChecks: ['fix-verified']
}

const postSolution = (incidentId: string, body: object = solutionInput, user: TestUser = reporter) =>
  addSolution(req('POST', `/api/incidents/${incidentId}/solutions`, body, user), ctx({ id: incidentId }))

async function createSolution(incidentId: string, user: TestUser = reporter, body: object = solutionInput): Promise<SolutionDTO> {
  const res = await postSolution(incidentId, body, user)
  expect(res.status).toBe(201)
  return json<SolutionDTO>(res)
}

const verify = (id: string, user: TestUser, body: object = {}) =>
  verifySolution(req('PATCH', `/api/solutions/${id}/verify`, body, user), ctx({ id }))

const link = (newId: string, body: Partial<CreateLinkInput> & { originalIncidentId: string }, user: TestUser = reporter) =>
  linkIncident(req('POST', `/api/incidents/${newId}/link`, body, user), ctx({ id: newId }))

async function linkOk(newId: string, body: Partial<CreateLinkInput> & { originalIncidentId: string }, user: TestUser = reporter) {
  const res = await link(newId, body, user)
  expect(res.status).toBe(200)
  return json<{ link: MatchLinkDTO; notified: boolean; ownerName: string }>(res)
}

const reload = (id: string): Promise<Incident> => prisma.incident.findUniqueOrThrow({ where: { id } })

const comment = (incidentId: string, body: object, user: TestUser = reporter) =>
  addComment(req('POST', `/api/incidents/${incidentId}/comments`, body, user), ctx({ id: incidentId }))

beforeEach(async () => {
  await resetDb()
})

describe('solutions', () => {
  it('records the actor as solver and resolves the incident by default', async () => {
    const incident = await seedIncident({ createdAt: new Date(Date.now() - 30 * 60_000) })
    const solution = await createSolution(incident.id, verifier)
    expect(solution).toMatchObject({
      incidentId: incident.id, solvedBy: verifier.name, email: verifier.email, status: 'UNVERIFIED', verifiedBy: null
    })
    const updated = await reload(incident.id)
    expect(updated.status).toBe('RESOLVED')
    expect(updated.resolvedAt).not.toBeNull()
    expect(updated.actualMTTR).toBeGreaterThanOrEqual(29)
    const actions = (await prisma.activityLog.findMany({ where: { incidentId: incident.id } })).map(a => a.action)
    expect(actions.sort()).toEqual(['SOLUTION_ADDED', 'STATUS_CHANGED'])
  })

  it('leaves the status alone with resolve: false', async () => {
    const incident = await seedIncident({ status: 'INVESTIGATING' })
    await createSolution(incident.id, reporter, { ...solutionInput, resolve: false })
    expect((await reload(incident.id)).status).toBe('INVESTIGATING')
  })

  it('does not move a closed incident back to resolved', async () => {
    const incident = await seedIncident({ status: 'CLOSED', actualMTTR: 10, resolvedAt: new Date() })
    await createSolution(incident.id)
    expect(await reload(incident.id)).toMatchObject({ status: 'CLOSED', actualMTTR: 10 })
  })

  it('404s for an unknown incident and 401s without identity', async () => {
    expect((await postSolution('missing')).status).toBe(404)
    const incident = await seedIncident()
    const anonymous = await addSolution(req('POST', `/api/incidents/${incident.id}/solutions`, solutionInput, null), ctx({ id: incident.id }))
    expect(anonymous.status).toBe(401)
  })

  it('lists verified solutions first and fetches one by id', async () => {
    const incident = await seedIncident()
    const first = await createSolution(incident.id)
    const second = await createSolution(incident.id)
    await verify(first.id, verifier)
    const res = await listSolutions(req('GET', `/api/incidents/${incident.id}/solutions`), ctx({ id: incident.id }))
    expect((await json<SolutionDTO[]>(res)).map(s => s.id)).toEqual([first.id, second.id])
    const single = await getSolution(req('GET', `/api/solutions/${second.id}`), ctx({ id: second.id }))
    expect((await json<SolutionDTO>(single)).id).toBe(second.id)
    expect((await getSolution(req('GET', '/api/solutions/missing'), ctx({ id: 'missing' }))).status).toBe(404)
  })
})

describe('PATCH /api/solutions/:id/verify', () => {
  it('rejects reporters with 403', async () => {
    const incident = await seedIncident()
    const solution = await createSolution(incident.id)
    expect((await verify(solution.id, reporter)).status).toBe(403)
    expect((await prisma.solution.findUniqueOrThrow({ where: { id: solution.id } })).status).toBe('UNVERIFIED')
  })

  it('verifier sign-off sets verifiedBy/At and notifies the solver once', async () => {
    const incident = await seedIncident()
    const solution = await createSolution(incident.id, reporter)

    const res = await verify(solution.id, verifier)
    expect(res.status).toBe(200)
    const body = await json<SolutionDTO>(res)
    expect(body).toMatchObject({ status: 'VERIFIED', verifiedBy: verifier.name })
    expect(body.verifiedAt).not.toBeNull()

    const logs = await prisma.notificationLog.findMany()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ recipientEmail: reporter.email, notificationType: 'SOLUTION_VERIFIED', incidentId: incident.id })

    // Verifying again does not re-notify
    await verify(solution.id, admin)
    expect(await prisma.notificationLog.count()).toBe(1)
  })

  it('UNVERIFIED clears the sign-off', async () => {
    const incident = await seedIncident()
    const solution = await createSolution(incident.id)
    await verify(solution.id, verifier)
    const body = await json<SolutionDTO>(await verify(solution.id, verifier, { status: 'UNVERIFIED' }))
    expect(body).toMatchObject({ status: 'UNVERIFIED', verifiedBy: null, verifiedAt: null })
  })

  it('does not notify a verifier about their own solution', async () => {
    const incident = await seedIncident()
    const solution = await createSolution(incident.id, verifier)
    await verify(solution.id, verifier)
    expect(await prisma.notificationLog.count()).toBe(0)
  })

  it('404s for an unknown solution', async () => {
    expect((await verify('missing', verifier)).status).toBe(404)
  })
})

describe('POST /api/incidents/:id/link', () => {
  const owner: TestUser = { name: 'Owen Owner', email: 'owen@example.com', role: 'REPORTER' }

  it('SAME links to the root of a recurrence chain and keeps recurringCount in sync', async () => {
    const root = await seedIncident({ email: owner.email, createdBy: owner.name })
    const second = await seedIncident()
    const third = await seedIncident()

    await linkOk(second.id, { originalIncidentId: root.id, matchType: 'SAME' })
    expect((await reload(second.id)).linkedToId).toBe(root.id)
    expect((await reload(root.id)).recurringCount).toBe(2)

    // Linking to a recurrence attaches to the chain's root
    await linkOk(third.id, { originalIncidentId: second.id, matchType: 'SAME' })
    expect((await reload(third.id)).linkedToId).toBe(root.id)
    expect((await reload(root.id)).recurringCount).toBe(3)
    expect((await reload(second.id)).recurringCount).toBe(1)

    const actions = await prisma.activityLog.findMany({ where: { action: 'LINKED' } })
    expect(actions).toHaveLength(4)
  })

  it('downgrading SAME → SIMILAR unlinks and refreshes the count', async () => {
    const root = await seedIncident()
    const recurrence = await seedIncident()
    await linkOk(recurrence.id, { originalIncidentId: root.id, matchType: 'SAME' })
    const { link: updated } = await linkOk(recurrence.id, { originalIncidentId: root.id, matchType: 'SIMILAR' })
    expect(updated.matchType).toBe('SIMILAR')
    expect((await reload(recurrence.id)).linkedToId).toBeNull()
    expect((await reload(root.id)).recurringCount).toBe(1)
    expect(await prisma.matchLink.count()).toBe(1)
  })

  it('SIMILAR and DERIVED do not count as recurrences', async () => {
    const original = await seedIncident()
    const a = await seedIncident()
    const b = await seedIncident()
    await linkOk(a.id, { originalIncidentId: original.id, matchType: 'SIMILAR' })
    await linkOk(b.id, { originalIncidentId: original.id, matchType: 'DERIVED' })
    expect((await reload(original.id)).recurringCount).toBe(1)
    expect((await reload(a.id)).linkedToId).toBeNull()
  })

  it('rejects linking an incident to itself', async () => {
    const incident = await seedIncident()
    const res = await link(incident.id, { originalIncidentId: incident.id })
    expect(res.status).toBe(400)
  })

  it('rejects a solution that belongs to another incident', async () => {
    const original = await seedIncident()
    const other = await seedIncident()
    const recurrence = await seedIncident()
    const foreign = await createSolution(other.id)
    const res = await link(recurrence.id, { originalIncidentId: original.id, solutionUsed: foreign.id })
    expect(res.status).toBe(400)
    expect(await prisma.matchLink.count()).toBe(0)
  })

  it('404s when either incident is missing or deleted', async () => {
    const incident = await seedIncident()
    const deleted = await seedIncident({ deletedAt: new Date() })
    expect((await link(incident.id, { originalIncidentId: 'missing' })).status).toBe(404)
    expect((await link(incident.id, { originalIncidentId: deleted.id })).status).toBe(404)
  })

  it('notifies the original owner once (RECURRENCE), even after relinking', async () => {
    const original = await seedIncident({ email: owner.email, createdBy: owner.name })
    const recurrence = await seedIncident()

    const first = await linkOk(recurrence.id, { originalIncidentId: original.id }, verifier)
    expect(first).toMatchObject({ notified: true, ownerName: owner.name })
    const second = await linkOk(recurrence.id, { originalIncidentId: original.id, notes: 'again' }, verifier)
    expect(second.notified).toBe(false)

    const logs = await prisma.notificationLog.findMany()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ recipientEmail: owner.email, notificationType: 'RECURRENCE', incidentId: recurrence.id })
  })

  it('does not notify when the owner is the one linking', async () => {
    const original = await seedIncident({ email: owner.email, createdBy: owner.name })
    const recurrence = await seedIncident()
    const result = await linkOk(recurrence.id, { originalIncidentId: original.id }, owner)
    expect(result.notified).toBe(false)
    expect(await prisma.notificationLog.count()).toBe(0)
  })

  it('does not notify when the owner reported both incidents', async () => {
    const original = await seedIncident()
    const recurrence = await seedIncident()
    const result = await linkOk(recurrence.id, { originalIncidentId: original.id }, verifier)
    expect(result.notified).toBe(false)
  })
})

describe('PATCH /api/links/:id and effectiveness', () => {
  const patchLink = (id: string, body: object) => updateLink(req('PATCH', `/api/links/${id}`, body, reporter), ctx({ id }))

  it('records outcomes, defaulting the outcome from didSolutionWork', async () => {
    const original = await seedIncident()
    const recurrence = await seedIncident()
    const { link: created } = await linkOk(recurrence.id, { originalIncidentId: original.id })

    const worked = await json<MatchLinkDTO>(await patchLink(created.id, { didSolutionWork: true }))
    expect(worked).toMatchObject({ didSolutionWork: true, outcome: 'RESOLVED' })
    expect(worked.resolvedAt).not.toBeNull()

    const failed = await json<MatchLinkDTO>(await patchLink(created.id, { didSolutionWork: false }))
    expect(failed).toMatchObject({ didSolutionWork: false, outcome: 'DIFFERENT_APPROACH_NEEDED', resolvedAt: null })

    const retry = await json<MatchLinkDTO>(await patchLink(created.id, { didSolutionWork: false, outcome: 'RETRY_NEEDED' }))
    expect(retry.outcome).toBe('RETRY_NEEDED')

    const outcomes = await prisma.activityLog.count({ where: { incidentId: recurrence.id, action: 'OUTCOME_RECORDED' } })
    expect(outcomes).toBe(3)
  })

  it('404s for an unknown link', async () => {
    expect((await patchLink('missing', { didSolutionWork: true })).status).toBe(404)
  })

  it('computes effectiveness from recorded outcomes', async () => {
    const original = await seedIncident({ status: 'RESOLVED', actualMTTR: 120 })
    const solution = await createSolution(original.id)
    const a = await seedIncident({ status: 'RESOLVED', actualMTTR: 30 })
    const b = await seedIncident({ status: 'RESOLVED', actualMTTR: 60 })
    const c = await seedIncident()
    const deleted = await seedIncident({ actualMTTR: 1 })

    const links: Record<string, string> = {}
    for (const incident of [a, b, c, deleted]) {
      links[incident.id] = (await linkOk(incident.id, { originalIncidentId: original.id, solutionUsed: solution.id })).link.id
    }
    await patchLink(links[a.id] ?? '', { didSolutionWork: true })
    await patchLink(links[b.id] ?? '', { didSolutionWork: false })
    await prisma.incident.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } })

    const res = await getEffectiveness(req('GET', `/api/solutions/${solution.id}/effectiveness`), ctx({ id: solution.id }))
    expect(await json<SolutionEffectiveness>(res)).toEqual({
      solutionId: solution.id,
      timesUsed: 3,
      worked: 1,
      failed: 1,
      pending: 1,
      successRate: 50,
      originalMTTR: 120,
      avgMTTRWhenUsed: 45,
      mttrImprovement: 75
    })
  })

  it('reports nulls for an unused solution and 404 for an unknown one', async () => {
    const incident = await seedIncident()
    const solution = await createSolution(incident.id, reporter, { ...solutionInput, resolve: false })
    const body = await json<SolutionEffectiveness>(
      await getEffectiveness(req('GET', `/api/solutions/${solution.id}/effectiveness`), ctx({ id: solution.id }))
    )
    expect(body).toMatchObject({ timesUsed: 0, successRate: null, avgMTTRWhenUsed: null, mttrImprovement: null })
    expect((await getEffectiveness(req('GET', '/api/solutions/x/effectiveness'), ctx({ id: 'x' }))).status).toBe(404)
  })
})

describe('comments', () => {
  it('threads replies one level deep: a reply to a reply joins the top-level thread', async () => {
    const incident = await seedIncident()
    const top = await json<CommentDTO>(await comment(incident.id, { content: 'Top level' }))
    expect(top.parentId).toBeNull()
    const reply = await json<CommentDTO>(await comment(incident.id, { content: 'Reply', parentId: top.id }, verifier))
    expect(reply.parentId).toBe(top.id)
    const nested = await json<CommentDTO>(await comment(incident.id, { content: 'Reply to reply', parentId: reply.id }))
    expect(nested.parentId).toBe(top.id)

    const res = await listComments(req('GET', `/api/incidents/${incident.id}/comments`), ctx({ id: incident.id }))
    const body = await json<Paginated<CommentDTO>>(res)
    expect(body.total).toBe(1)
    expect(body.items[0]?.replies.map(r => r.content)).toEqual(['Reply', 'Reply to reply'])
    expect(await prisma.activityLog.count({ where: { incidentId: incident.id, action: 'COMMENTED' } })).toBe(3)
  })

  it('rejects a parent from another incident and unknown incidents', async () => {
    const a = await seedIncident()
    const b = await seedIncident()
    const onB = await json<CommentDTO>(await comment(b.id, { content: 'On B' }))
    expect((await comment(a.id, { content: 'x', parentId: onB.id })).status).toBe(400)
    expect((await comment('missing', { content: 'x' })).status).toBe(404)
  })

  it('notifies mentioned people (MENTION) but never the author', async () => {
    const incident = await seedIncident()
    const res = await comment(incident.id, { content: 'Thoughts @vic?', mentions: [verifier.email, reporter.email, admin.email] })
    expect(res.status).toBe(201)
    const logs = await prisma.notificationLog.findMany({ orderBy: { recipientEmail: 'asc' } })
    expect(logs.map(l => [l.recipientEmail, l.notificationType])).toEqual([
      [admin.email, 'MENTION'],
      [verifier.email, 'MENTION']
    ])
  })

  it('mentions are not deduplicated across comments', async () => {
    const incident = await seedIncident()
    await comment(incident.id, { content: 'one', mentions: [verifier.email] })
    await comment(incident.id, { content: 'two', mentions: [verifier.email] })
    expect(await prisma.notificationLog.count({ where: { recipientEmail: verifier.email } })).toBe(2)
  })

  it('paginates top-level comments oldest first', async () => {
    const incident = await seedIncident()
    for (const content of ['first', 'second', 'third']) await comment(incident.id, { content })
    const res = await listComments(req('GET', `/api/incidents/${incident.id}/comments?pageSize=2&page=2`), ctx({ id: incident.id }))
    const body = await json<Paginated<CommentDTO>>(res)
    expect(body).toMatchObject({ total: 3, totalPages: 2, page: 2 })
    expect(body.items.map(c => c.content)).toEqual(['third'])
  })

  it('401s without identity', async () => {
    const incident = await seedIncident()
    const res = await addComment(req('POST', `/api/incidents/${incident.id}/comments`, { content: 'hi' }, null), ctx({ id: incident.id }))
    expect(res.status).toBe(401)
  })
})

describe('notifications', () => {
  async function seedNotifications(): Promise<{ mine: string[]; theirs: string }> {
    const incident = await seedIncident()
    const make = (recipientEmail: string, title: string) =>
      prisma.notificationLog.create({ data: { recipientEmail, incidentId: incident.id, notificationType: 'MENTION', title } })
    const a = await make(reporter.email, 'a')
    const b = await make(reporter.email, 'b')
    const other = await make(verifier.email, 'other')
    return { mine: [a.id, b.id], theirs: other.id }
  }

  it('GET lists only the actor’s notifications with an unread count', async () => {
    await seedNotifications()
    const body = await json<{ items: NotificationDTO[]; unread: number }>(
      await listNotifications(req('GET', '/api/notifications', undefined, reporter), noParams)
    )
    expect(body.unread).toBe(2)
    expect(body.items.map(n => n.title).sort()).toEqual(['a', 'b'])
  })

  it('works for viewers but not anonymous users', async () => {
    const viewer: TestUser = { name: 'Vee', email: 'vee@example.com', role: 'VIEWER' }
    expect((await listNotifications(req('GET', '/api/notifications', undefined, viewer), noParams)).status).toBe(200)
    expect((await listNotifications(req('GET', '/api/notifications', undefined, null), noParams)).status).toBe(401)
  })

  it('PATCH marks only the actor’s own notifications as read', async () => {
    const { mine, theirs } = await seedNotifications()
    const res = await markRead(req('PATCH', '/api/notifications', { ids: [mine[0], theirs] }, reporter), noParams)
    expect(await json<{ updated: number }>(res)).toEqual({ updated: 1 })
    expect((await prisma.notificationLog.findUniqueOrThrow({ where: { id: theirs } })).readAt).toBeNull()

    const all = await markRead(req('PATCH', '/api/notifications', {}, reporter), noParams)
    expect(await json<{ updated: number }>(all)).toEqual({ updated: 1 })
    expect(await prisma.notificationLog.count({ where: { readAt: null } })).toBe(1)
  })
})

describe('GET /api/people', () => {
  it('finds distinct people from incidents, solutions and comments', async () => {
    const incident = await seedIncident()
    await createSolution(incident.id, verifier)
    await comment(incident.id, { content: 'hello' }, admin)
    await seedIncident()

    const search = async (q: string): Promise<Person[]> =>
      json<Person[]>(await searchPeople(req('GET', `/api/people?q=${encodeURIComponent(q)}`), noParams))

    expect(await search('rit')).toEqual([{ name: reporter.name, email: reporter.email }])
    expect((await search('VIC@')).map(p => p.email)).toEqual([verifier.email])
    expect((await search('')).map(p => p.email)).toEqual([admin.email, reporter.email, verifier.email])
    expect(await search('%')).toEqual([])
  })
})

describe('GET /api/incidents/:id/activity', () => {
  it('returns the audit trail newest first, paginated', async () => {
    const incident = await seedIncident()
    for (const content of ['one', 'two', 'three']) await comment(incident.id, { content })
    await createSolution(incident.id)
    const res = await listActivity(req('GET', `/api/incidents/${incident.id}/activity?pageSize=2`), ctx({ id: incident.id }))
    const body = await json<Paginated<ActivityDTO>>(res)
    expect(body).toMatchObject({ total: 5, totalPages: 3, page: 1 })
    expect(body.items).toHaveLength(2)
    const times = body.items.map(a => a.timestamp)
    expect([...times].sort().reverse()).toEqual(times)
  })
})

describe('GET /api/incidents/:id/matches', () => {
  it('suggests similar incidents but excludes ones already linked', async () => {
    const a = await seedIncident({ title: 'Checkout API returns 504 when the database connection pool is exhausted (A)' })
    const b = await seedIncident({ title: 'Checkout API returns 504 when the database connection pool is exhausted (B)' })
    const current = await seedIncident()

    const ids = async (): Promise<string[]> => {
      const res = await getMatches(req('GET', `/api/incidents/${current.id}/matches`), ctx({ id: current.id }))
      return (await json<SimilarIncident[]>(res)).map(m => m.id).sort()
    }
    expect(await ids()).toEqual([a.id, b.id].sort())

    await linkOk(current.id, { originalIncidentId: a.id, matchType: 'SIMILAR' })
    expect(await ids()).toEqual([b.id])
  })

  it('404s for an unknown incident', async () => {
    expect((await getMatches(req('GET', '/api/incidents/x/matches'), ctx({ id: 'x' }))).status).toBe(404)
  })
})
