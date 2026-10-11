import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { POST as createIncident } from '@/app/api/incidents/create/route'
import { GET as listIncidents } from '@/app/api/incidents/route'
import { GET as searchIncidents } from '@/app/api/incidents/search/route'
import { DELETE, GET as getIncident, PATCH } from '@/app/api/incidents/[id]/route'
import type { IncidentDetailDTO, IncidentListItem, IncidentRef, Paginated, SimilarIncident } from '@/lib/types'
import {
  BASE, admin, ctx, headersFor, incidentInput, json, noParams, req, reporter, resetDb, seedIncident, verifier
} from '../setup/helpers'

type ListBody = Paginated<IncidentListItem>
interface ErrorBody { error: string; fieldErrors?: Record<string, string[]> }

const list = async (qs: string): Promise<ListBody> => {
  const res = await listIncidents(req('GET', `/api/incidents?${qs}`), noParams)
  expect(res.status).toBe(200)
  return json<ListBody>(res)
}
const titles = (body: ListBody): string[] => body.items.map(i => i.title)
const pad = (s: string): string => s.padEnd(55, '.')

beforeEach(async () => {
  await resetDb()
})

describe('POST /api/incidents/create', () => {
  it('creates the incident and returns similar past incidents', async () => {
    const original = await seedIncident({
      title: pad('Checkout API returns 504 when the database connection pool is exhausted'),
      status: 'RESOLVED'
    })

    const res = await createIncident(req('POST', '/api/incidents/create', incidentInput(), reporter), noParams)
    expect(res.status).toBe(201)
    const body = await json<{ incident: IncidentRef; similarIncidents: SimilarIncident[] }>(res)
    expect(body.incident).toMatchObject({ status: 'OPEN', severity: 'P2', createdBy: reporter.name })
    expect(body.similarIncidents.map(s => s.id)).toEqual([original.id])
    expect(body.similarIncidents[0]?.similarity).toBeGreaterThanOrEqual(50)

    const stored = await prisma.incident.findUniqueOrThrow({ where: { id: body.incident.id }, include: { activityLog: true } })
    expect(stored.email).toBe(reporter.email)
    expect(stored.activityLog.map(a => a.action)).toEqual(['CREATED'])
  })

  it('returns 400 with field errors for a short title and stores nothing', async () => {
    const res = await createIncident(req('POST', '/api/incidents/create', incidentInput({ title: 'Too short' }), reporter), noParams)
    expect(res.status).toBe(400)
    const body = await json<ErrorBody>(res)
    expect(body.fieldErrors?.title).toEqual(['Title must be at least 50 characters'])
    expect(await prisma.incident.count()).toBe(0)
  })

  it('returns 400 for a body that is not JSON', async () => {
    const bad = new Request(`${BASE}/api/incidents/create`, { method: 'POST', body: '{nope', headers: headersFor(reporter) })
    const res = await createIncident(bad, noParams)
    expect(res.status).toBe(400)
    expect((await json<ErrorBody>(res)).error).toBe('Request body must be valid JSON')
  })

  it('escalates a P1 to on-call', async () => {
    const res = await createIncident(req('POST', '/api/incidents/create', incidentInput({ severity: 'P1' }), reporter), noParams)
    const { incident } = await json<{ incident: IncidentRef }>(res)
    const logs = await prisma.notificationLog.findMany()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      recipientEmail: 'oncall@example.com', incidentId: incident.id, notificationType: 'P1_ESCALATION', delivered: false
    })
  })

  it('does not escalate other severities', async () => {
    await createIncident(req('POST', '/api/incidents/create', incidentInput({ severity: 'P2' }), reporter), noParams)
    expect(await prisma.notificationLog.count()).toBe(0)
  })
})

describe('GET /api/incidents', () => {
  it('paginates', async () => {
    for (let i = 0; i < 5; i++) await seedIncident({ createdAt: new Date(Date.UTC(2024, 0, i + 1)) })
    const page2 = await list('pageSize=2&page=2')
    expect(page2).toMatchObject({ total: 5, totalPages: 3, page: 2, pageSize: 2 })
    expect(page2.items).toHaveLength(2)
    // newest first: page 2 holds the 3rd and 4th newest
    expect(page2.items.map(i => i.createdAt.slice(0, 10))).toEqual(['2024-01-03', '2024-01-02'])
    expect((await list('pageSize=2&page=4')).items).toHaveLength(0)
  })

  it('reports totalPages 1 for an empty result', async () => {
    expect(await list('')).toMatchObject({ total: 0, totalPages: 1, items: [] })
  })

  describe('filters', () => {
    beforeEach(async () => {
      const root = await seedIncident({
        title: pad('A Open P1 database'), status: 'OPEN', severity: 'P1', affectedSystems: ['Database'],
        department: 'SRE', createdAt: new Date('2024-03-01T10:00:00Z'), recurringCount: 2
      })
      await seedIncident({
        title: pad('B Resolved P2 api cache'), status: 'RESOLVED', severity: 'P2', affectedSystems: ['API', 'Cache'],
        department: 'Platform', createdAt: new Date('2024-03-05T23:59:00Z'), actualMTTR: 30
      })
      await seedIncident({
        title: pad('C Closed P3 auth'), status: 'CLOSED', severity: 'P3', affectedSystems: ['Auth'],
        department: 'Security', createdAt: new Date('2024-03-06T00:00:00Z'), actualMTTR: 300
      })
      await seedIncident({
        title: pad('D Investigating P4 cache'), status: 'INVESTIGATING', severity: 'P4', affectedSystems: ['Cache'],
        department: 'SRE', createdAt: new Date('2024-03-10T08:00:00Z'), linkedToId: root.id
      })
    })

    it('status accepts comma-separated values', async () => {
      expect(titles(await list('status=RESOLVED,CLOSED&sort=oldest')).map(t => t[0])).toEqual(['B', 'C'])
      expect(titles(await list('status=OPEN&status=INVESTIGATING&sort=oldest')).map(t => t[0])).toEqual(['A', 'D'])
    })

    it('severity', async () => {
      expect(titles(await list('severity=P1')).map(t => t[0])).toEqual(['A'])
    })

    it('systems match on overlap', async () => {
      expect(titles(await list('systems=Cache&sort=oldest')).map(t => t[0])).toEqual(['B', 'D'])
      expect(titles(await list('systems=Auth,Database&sort=oldest')).map(t => t[0])).toEqual(['A', 'C'])
    })

    it('department', async () => {
      expect(titles(await list('department=SRE&sort=oldest')).map(t => t[0])).toEqual(['A', 'D'])
    })

    it('from/to are inclusive calendar dates', async () => {
      expect(titles(await list('from=2024-03-05&to=2024-03-05')).map(t => t[0])).toEqual(['B'])
      expect(titles(await list('from=2024-03-05&to=2024-03-06&sort=oldest')).map(t => t[0])).toEqual(['B', 'C'])
    })

    it('recurring covers roots and recurrences', async () => {
      expect(titles(await list('recurring=true&sort=oldest')).map(t => t[0])).toEqual(['A', 'D'])
      expect(titles(await list('recurring=false&sort=oldest')).map(t => t[0])).toEqual(['B', 'C'])
    })

    it('sort by mttr puts the longest first and unresolved last', async () => {
      expect(titles(await list('sort=mttr')).map(t => t[0])).toEqual(['C', 'B', 'D', 'A'])
    })

    it('sort by severity puts P1 first', async () => {
      expect(titles(await list('sort=severity')).map(t => t[0])).toEqual(['A', 'B', 'C', 'D'])
    })

    it('rejects invalid filter values with 400', async () => {
      const res = await listIncidents(req('GET', '/api/incidents?status=BROKEN'), noParams)
      expect(res.status).toBe(400)
    })
  })
})

describe('search', () => {
  beforeEach(async () => {
    await seedIncident({
      title: pad('Redis cache evictions slow product pages'),
      description: 'Product detail pages take several seconds after the morning deploy. '.repeat(3),
      symptoms: 'Evicted keys climbing fast, maxmemory reached, hit ratio collapsed.'
    })
    await seedIncident({ title: pad('Checkout fails with connection pool exhausted') })
    await seedIncident({ title: pad('Printer jam on the third floor'), description: 'Facilities issue with the duplex unit '.repeat(4), symptoms: 'Paper jam error E-204 on every duplex print job.' })
  })

  it('matches word prefixes and returns a relevance score', async () => {
    const res = await searchIncidents(req('GET', '/api/incidents/search?q=evict'), noParams)
    const body = await json<ListBody>(res)
    expect(body.total).toBe(1)
    expect(body.items[0]?.title).toMatch(/^Redis cache evictions/)
    expect(body.items[0]?.score).toBeGreaterThan(0)
  })

  it('ANDs terms, ignores punctuation and works on the list endpoint too', async () => {
    const body = await list(`q=${encodeURIComponent("conn' & pool")}`)
    expect(body.items.map(i => i.title.slice(0, 8))).toEqual(['Checkout'])
    expect(body.items[0]?.score).not.toBeNull()
  })

  it('returns no score without a query', async () => {
    const body = await list('')
    expect(body.items.every(i => i.score === null)).toBe(true)
  })

  it('a query with nothing searchable returns everything', async () => {
    expect((await list('q=%26%26')).total).toBe(3)
  })
})

describe('GET /api/incidents/:id', () => {
  it('returns details', async () => {
    const incident = await seedIncident()
    const res = await getIncident(req('GET', `/api/incidents/${incident.id}`), ctx({ id: incident.id }))
    expect(res.status).toBe(200)
    const body = await json<IncidentDetailDTO>(res)
    expect(body).toMatchObject({ id: incident.id, solutions: [], linkedTo: null, commentCount: 0 })
  })

  it('404s for an unknown id', async () => {
    const res = await getIncident(req('GET', '/api/incidents/nope'), ctx({ id: 'nope' }))
    expect(res.status).toBe(404)
    expect(await json<ErrorBody>(res)).toEqual({ error: 'Incident not found' })
  })

  it('404s for a soft-deleted incident', async () => {
    const incident = await seedIncident({ deletedAt: new Date() })
    const res = await getIncident(req('GET', `/api/incidents/${incident.id}`), ctx({ id: incident.id }))
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/incidents/:id', () => {
  const patch = (id: string, body: unknown, user = verifier) => PATCH(req('PATCH', `/api/incidents/${id}`, body, user), ctx({ id }))

  it('resolving sets resolvedAt and actualMTTR; reopening clears them', async () => {
    const incident = await seedIncident({ createdAt: new Date(Date.now() - 90 * 60_000) })

    const resolved = await json<IncidentDetailDTO>(await patch(incident.id, { status: 'RESOLVED' }))
    expect(resolved.status).toBe('RESOLVED')
    expect(resolved.resolvedAt).not.toBeNull()
    expect(resolved.actualMTTR).toBeGreaterThanOrEqual(89)
    expect(resolved.actualMTTR).toBeLessThanOrEqual(91)
    expect(resolved.closedAt).toBeNull()

    const reopened = await json<IncidentDetailDTO>(await patch(incident.id, { status: 'OPEN' }))
    expect(reopened).toMatchObject({ status: 'OPEN', resolvedAt: null, actualMTTR: null, closedAt: null })

    const activity = await prisma.activityLog.findMany({ where: { incidentId: incident.id }, orderBy: { timestamp: 'asc' } })
    expect(activity.map(a => [a.action, a.details, a.actor])).toEqual([
      ['STATUS_CHANGED', 'Status OPEN → RESOLVED', verifier.name],
      ['STATUS_CHANGED', 'Status RESOLVED → OPEN', verifier.name]
    ])
  })

  it('closing after resolving keeps the original MTTR', async () => {
    const incident = await seedIncident({
      status: 'RESOLVED', createdAt: new Date(Date.now() - 600 * 60_000),
      resolvedAt: new Date(Date.now() - 540 * 60_000), actualMTTR: 60
    })
    const closed = await json<IncidentDetailDTO>(await patch(incident.id, { status: 'CLOSED' }))
    expect(closed.actualMTTR).toBe(60)
    expect(closed.closedAt).not.toBeNull()
  })

  it('notifies the reporter when someone else changes the status', async () => {
    const incident = await seedIncident()
    await patch(incident.id, { status: 'INVESTIGATING' }, verifier)
    const logs = await prisma.notificationLog.findMany()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ recipientEmail: reporter.email, notificationType: 'STATUS_CHANGED', incidentId: incident.id })
    expect(logs[0]?.title).toMatch(/is now investigating$/)
  })

  it('does not notify the reporter about their own change', async () => {
    const incident = await seedIncident()
    await patch(incident.id, { status: 'RESOLVED' }, reporter)
    expect(await prisma.notificationLog.count()).toBe(0)
  })

  it('logs severity, department and tag changes as UPDATED', async () => {
    const incident = await seedIncident({ severity: 'P3', department: 'SRE' })
    const body = await json<IncidentDetailDTO>(await patch(incident.id, { severity: 'P1', department: 'Data', tags: ['DB', 'db'] }))
    expect(body).toMatchObject({ severity: 'P1', department: 'Data', tags: ['db'] })
    const details = (await prisma.activityLog.findMany({ where: { incidentId: incident.id, action: 'UPDATED' } })).map(a => a.details)
    expect(details.sort()).toEqual(['Department SRE → Data', 'Severity P3 → P1', 'Tags set to db'])
  })

  it('writes nothing when no field actually changes', async () => {
    const incident = await seedIncident({ status: 'OPEN' })
    expect((await patch(incident.id, { status: 'OPEN' })).status).toBe(200)
    expect(await prisma.activityLog.count()).toBe(0)
  })

  it('401s without identity', async () => {
    const incident = await seedIncident()
    const res = await PATCH(req('PATCH', `/api/incidents/${incident.id}`, { status: 'RESOLVED' }, null), ctx({ id: incident.id }))
    expect(res.status).toBe(401)
    expect((await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } })).status).toBe('OPEN')
  })

  it('400s for an empty update and 404s for an unknown incident', async () => {
    const incident = await seedIncident()
    expect((await patch(incident.id, {})).status).toBe(400)
    expect((await patch('missing', { status: 'RESOLVED' })).status).toBe(404)
  })
})

describe('DELETE /api/incidents/:id', () => {
  const del = (id: string, user = admin) => DELETE(req('DELETE', `/api/incidents/${id}`, undefined, user), ctx({ id }))

  it('requires the admin role', async () => {
    const incident = await seedIncident()
    expect((await del(incident.id, reporter)).status).toBe(403)
    expect((await del(incident.id, verifier)).status).toBe(403)
    expect((await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } })).deletedAt).toBeNull()
  })

  it('soft deletes: hidden from the API but kept in the database with an audit entry', async () => {
    const incident = await seedIncident()
    const res = await del(incident.id)
    expect(res.status).toBe(204)

    const row = await prisma.incident.findUniqueOrThrow({ where: { id: incident.id }, include: { activityLog: true } })
    expect(row.deletedAt).not.toBeNull()
    expect(row.activityLog.map(a => a.action)).toContain('DELETED')
    expect((await list('')).total).toBe(0)
    expect((await getIncident(req('GET', `/api/incidents/${incident.id}`), ctx({ id: incident.id }))).status).toBe(404)
    expect((await del(incident.id)).status).toBe(404)
  })

  it('updates the root recurringCount when a recurrence is deleted', async () => {
    const root = await seedIncident({ recurringCount: 2 })
    const recurrence = await seedIncident({ linkedToId: root.id })
    await del(recurrence.id)
    expect((await prisma.incident.findUniqueOrThrow({ where: { id: root.id } })).recurringCount).toBe(1)
  })
})
