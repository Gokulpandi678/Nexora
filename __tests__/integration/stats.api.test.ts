import { beforeAll, describe, expect, it } from 'vitest'
import type { Incident } from '@prisma/client'
import { prisma } from '@/lib/db'
import { GET as dashboard } from '@/app/api/stats/dashboard/route'
import { GET as trends } from '@/app/api/stats/trends/route'
import { GET as systems } from '@/app/api/stats/systems/route'
import { GET as teams } from '@/app/api/stats/teams/route'
import { GET as exportCsv } from '@/app/api/export/csv/route'
import type { DashboardStats, SystemStat, TeamStats, TrendStats } from '@/lib/types'
import { json, noParams, req, resetDb, seedIncident } from '../setup/helpers'

const MIN = 60_000
const DAY = 86_400_000
const now = Date.now()
const ago = (days: number): Date => new Date(now - days * DAY)
const utcDay = (d: Date): string => d.toISOString().slice(0, 10)
const plus = (d: Date, minutes: number): Date => new Date(d.getTime() + minutes * MIN)

/**
 * Known dataset:
 *   R  P1 RESOLVED  SRE       Database,API  MTTR 60   root of R2, R3 (recurringCount 3)
 *   R2 P2 RESOLVED  SRE       Database      MTTR 30   → R
 *   R3 P2 OPEN      Platform  Database                → R
 *   X  P3 CLOSED    Security  Auth          MTTR 120
 *   Y  P1 INVESTIG. Platform  API
 *   Q  P4 RESOLVED  IT        Cache         MTTR 10   root of Q2 (recurringCount 2)
 *   Q2 P4 OPEN      IT        Cache                   → Q
 *   D  P1 OPEN      SRE       Database                soft-deleted, must be ignored everywhere
 */
let R: Incident, R2: Incident, R3: Incident, X: Incident, Y: Incident, Q: Incident, Q2: Incident
const all: Incident[] = []

async function solution(incident: Incident, solvedBy: string, status = 'UNVERIFIED'): Promise<void> {
  await prisma.solution.create({
    data: {
      incidentId: incident.id, solvedBy, status, rootCause: 'cause', approach: 'approach', useCaseNotes: 'notes',
      timeToFix: 10, efficiency: 'HIGH', qaChecks: []
    }
  })
}

beforeAll(async () => {
  await resetDb()
  const t = { R: ago(2), R2: ago(1), R3: new Date(now - MIN), X: ago(10), Y: ago(40), Q: ago(5), Q2: ago(3) }
  R = await seedIncident({
    title: 'R'.padEnd(55, '.'), severity: 'P1', status: 'RESOLVED', department: 'SRE', affectedSystems: ['Database', 'API'],
    createdAt: t.R, resolvedAt: plus(t.R, 60), actualMTTR: 60, recurringCount: 3
  })
  R2 = await seedIncident({
    title: 'R2'.padEnd(55, '.'), severity: 'P2', status: 'RESOLVED', department: 'SRE', affectedSystems: ['Database'],
    createdAt: t.R2, resolvedAt: plus(t.R2, 30), actualMTTR: 30, linkedToId: R.id
  })
  R3 = await seedIncident({
    title: 'R3'.padEnd(55, '.'), severity: 'P2', status: 'OPEN', department: 'Platform', affectedSystems: ['Database'],
    createdAt: t.R3, linkedToId: R.id
  })
  X = await seedIncident({
    title: '=X'.padEnd(55, '.'), severity: 'P3', status: 'CLOSED', department: 'Security', affectedSystems: ['Auth'],
    createdAt: t.X, resolvedAt: plus(t.X, 120), actualMTTR: 120
  })
  Y = await seedIncident({
    title: 'Y, with "quotes"'.padEnd(55, '.'), severity: 'P1', status: 'INVESTIGATING', department: 'Platform', affectedSystems: ['API'],
    createdAt: t.Y
  })
  Q = await seedIncident({
    title: 'Q'.padEnd(55, '.'), severity: 'P4', status: 'RESOLVED', department: 'IT', affectedSystems: ['Cache'],
    createdAt: t.Q, resolvedAt: plus(t.Q, 10), actualMTTR: 10, recurringCount: 2
  })
  Q2 = await seedIncident({
    title: 'Q2'.padEnd(55, '.'), severity: 'P4', status: 'OPEN', department: 'IT', affectedSystems: ['Cache'],
    createdAt: t.Q2, linkedToId: Q.id
  })
  const D = await seedIncident({
    title: 'D'.padEnd(55, '.'), severity: 'P1', status: 'OPEN', department: 'SRE', affectedSystems: ['Database'],
    createdAt: ago(1), deletedAt: new Date(), recurringCount: 9
  })
  all.push(R, R2, R3, X, Y, Q, Q2)

  await solution(R, 'Sam', 'VERIFIED')
  await solution(R, 'Sam')
  await solution(X, 'Tia', 'VERIFIED')
  await solution(Y, 'Uma')
  await solution(R3, 'Abe')
  await solution(D, 'Zed', 'VERIFIED')
})

describe('GET /api/stats/dashboard', () => {
  it('computes totals, rates and breakdowns from live incidents only', async () => {
    const res = await dashboard(req('GET', '/api/stats/dashboard'), noParams)
    const body = await json<DashboardStats>(res)

    const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)
    const lastMonthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - 1, 1)
    const thisMonth = all.filter(i => i.createdAt.getTime() >= monthStart).length
    const lastMonth = all.filter(i => i.createdAt.getTime() >= lastMonthStart && i.createdAt.getTime() < monthStart).length

    expect(body.totals).toEqual({ all: 7, thisMonth, lastMonth, open: 3, openP1: 1 })
    expect(body.avgMTTR).toBe(55) // (60 + 30 + 120 + 10) / 4
    expect(body.recurringRate).toBe(42.9) // 3 of 7
    expect(body.resolutionRate).toBe(57.1) // 4 of 7
    expect(body.totalSolutions).toBe(5)
    expect(body.verifiedSolutions).toBe(2)
    expect(body.bySeverity).toEqual([
      { key: 'P1', count: 2 }, { key: 'P2', count: 2 }, { key: 'P3', count: 1 }, { key: 'P4', count: 2 }
    ])
    expect(Object.fromEntries(body.byStatus.map(r => [r.key, r.count]))).toEqual({
      RESOLVED: 3, OPEN: 2, CLOSED: 1, INVESTIGATING: 1
    })
    expect(body.bySystem).toEqual([
      { key: 'Database', count: 3 }, { key: 'API', count: 2 }, { key: 'Cache', count: 2 }, { key: 'Auth', count: 1 }
    ])
    expect(body.recent.map(r => r.id)).toEqual([R3, R2, R, Q2, Q, X, Y].map(i => i.id))
  })

  it('ranks top recurring roots by chain size with the chain’s average MTTR', async () => {
    const body = await json<DashboardStats>(await dashboard(req('GET', '/api/stats/dashboard'), noParams))
    expect(body.topRecurring).toEqual([
      { id: R.id, title: R.title, severity: 'P1', status: 'RESOLVED', count: 3, avgMTTR: 45, lastOccurrence: R3.createdAt.toISOString() },
      { id: Q.id, title: Q.title, severity: 'P4', status: 'RESOLVED', count: 2, avgMTTR: 10, lastOccurrence: Q2.createdAt.toISOString() }
    ])
  })
})

describe('GET /api/stats/trends', () => {
  const get = async (qs: string): Promise<Response> => trends(req('GET', `/api/stats/trends${qs}`), noParams)

  it('returns one zero-filled point per UTC day, ending today', async () => {
    const body = await json<TrendStats>(await get('?days=7'))
    expect(body.days).toBe(7)
    expect(body.points).toHaveLength(7)
    expect(body.points.at(-1)?.day).toBe(utcDay(new Date()))
    expect(body.points[0]?.day).toBe(utcDay(ago(6)))

    const expected = new Map<string, { incidents: number; P1: number; P2: number; P4: number; resolved: number; avgMTTR: number | null }>()
    for (const p of body.points) expected.set(p.day, { incidents: 0, P1: 0, P2: 0, P4: 0, resolved: 0, avgMTTR: null })
    for (const i of all) {
      const created = expected.get(utcDay(i.createdAt))
      if (created) {
        created.incidents += 1
        if (i.severity === 'P1' || i.severity === 'P2' || i.severity === 'P4') created[i.severity] += 1
      }
      const resolved = i.resolvedAt ? expected.get(utcDay(i.resolvedAt)) : undefined
      if (resolved) {
        resolved.resolved += 1
        resolved.avgMTTR = i.actualMTTR // one resolution per day in this dataset
      }
    }
    for (const p of body.points) {
      expect({ day: p.day, incidents: p.incidents, P1: p.P1, P2: p.P2, P4: p.P4, resolved: p.resolved, avgMTTR: p.avgMTTR })
        .toEqual({ day: p.day, ...expected.get(p.day) })
      expect(p.P3).toBe(0)
    }
    expect(body.points.reduce((n, p) => n + p.incidents, 0)).toBe(5) // R, R2, R3, Q, Q2
    expect(body.points.find(p => p.day === utcDay(R.createdAt))?.P1).toBe(1)
    expect(body.thisWeek).toBe(5)
    expect(body.lastWeek).toBe(1) // X
  })

  it('defaults to 30 days', async () => {
    const body = await json<TrendStats>(await get(''))
    expect(body.points).toHaveLength(30)
    expect(body.points.reduce((n, p) => n + p.incidents, 0)).toBe(6) // Y is 40 days old
  })

  it('400s for days outside 7–365', async () => {
    expect((await get('?days=3')).status).toBe(400)
    expect((await get('?days=400')).status).toBe(400)
  })
})

describe('GET /api/stats/systems', () => {
  it('aggregates per affected system', async () => {
    const body = await json<SystemStat[]>(await systems(req('GET', '/api/stats/systems'), noParams))
    expect(body).toEqual([
      { system: 'Database', incidents: 3, open: 1, recurring: 2, avgMTTR: 45 },
      { system: 'API', incidents: 2, open: 1, recurring: 0, avgMTTR: 60 },
      { system: 'Cache', incidents: 2, open: 1, recurring: 1, avgMTTR: 10 },
      { system: 'Auth', incidents: 1, open: 0, recurring: 0, avgMTTR: 120 }
    ])
  })
})

describe('GET /api/stats/teams', () => {
  it('reports per-department volume, MTTR and top solver', async () => {
    const body = await json<TeamStats>(await teams(req('GET', '/api/stats/teams'), noParams))
    const byDept = Object.fromEntries(body.teams.map(({ department, ...rest }) => [department, rest]))
    expect(byDept).toEqual({
      IT: { incidents: 2, open: 1, avgMTTR: 10, topSolver: null },
      // Abe and Uma tie on one solution each; the alphabetical first wins
      Platform: { incidents: 2, open: 2, avgMTTR: null, topSolver: 'Abe' },
      SRE: { incidents: 2, open: 0, avgMTTR: 45, topSolver: 'Sam' },
      Security: { incidents: 1, open: 0, avgMTTR: 120, topSolver: 'Tia' }
    })
    expect(body.teams[body.teams.length - 1]?.department).toBe('Security')
  })

  it('ranks solvers by verified, then total, then name', async () => {
    const body = await json<TeamStats>(await teams(req('GET', '/api/stats/teams'), noParams))
    expect(body.topSolvers).toEqual([
      { name: 'Sam', solutions: 2, verified: 1 },
      { name: 'Tia', solutions: 1, verified: 1 },
      { name: 'Abe', solutions: 1, verified: 0 },
      { name: 'Uma', solutions: 1, verified: 0 }
    ])
  })

  it('builds the department × system heatmap', async () => {
    const body = await json<TeamStats>(await teams(req('GET', '/api/stats/teams'), noParams))
    const cells = body.heatmap.map(c => `${c.department}/${c.system}=${c.count}`).sort()
    expect(cells).toEqual([
      'IT/Cache=2', 'Platform/API=1', 'Platform/Database=1', 'SRE/API=1', 'SRE/Database=2', 'Security/Auth=1'
    ])
  })
})

describe('GET /api/export/csv', () => {
  const get = (qs: string) => exportCsv(req('GET', `/api/export/csv${qs}`), noParams)
  const rowsOf = async (res: Response): Promise<string[]> => (await res.text()).replace(/^﻿/, '').split('\r\n')

  it('returns a CSV attachment with a header row', async () => {
    const res = await get('')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="incidents-\d{4}-\d{2}-\d{2}\.csv"$/)
    const rows = await rowsOf(res)
    expect(rows[0]).toBe(
      'id,title,severity,status,department,affectedSystems,createdBy,createdAt,resolvedAt,mttrMinutes,recurringCount,solutions,verifiedSolutions'
    )
    expect(rows).toHaveLength(8)
  })

  it('applies list filters', async () => {
    const rows = await rowsOf(await get('?severity=P1&sort=oldest'))
    expect(rows.slice(1).map(r => r.split(',')[0])).toEqual([Y.id, R.id])
    const rCols = rows[2]?.split(',') ?? []
    expect(rCols.slice(2, 6)).toEqual(['P1', 'RESOLVED', 'SRE', 'Database; API'])
    expect(rCols.slice(-4)).toEqual(['60', '3', '2', '1'])
  })

  it('quotes and defuses dangerous cells', async () => {
    const [, xRow] = await rowsOf(await get('?department=Security'))
    expect(xRow?.split(',')[1]).toBe(`'${X.title}`)
    const [, yRow] = await rowsOf(await get('?department=Platform&severity=P1'))
    expect(yRow).toContain(`"${Y.title.replace(/"/g, '""')}"`)
  })

  it('400s for invalid filters', async () => {
    expect((await get('?severity=P7')).status).toBe(400)
  })
})
