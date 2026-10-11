import { orgSql, type OrgScope } from '@/lib/api'
import { prisma } from '@/lib/db'
import { refSelect, toRef } from '@/lib/serializers'
import type {
  CountRow, DashboardStats, RecurringRow, SolutionEffectiveness, SystemStat, TeamStats, TrendStats
} from '@/lib/types'
import type { IncidentStatus, Severity } from '@/lib/constants'

const round = (n: number | null | undefined): number | null => (n === null || n === undefined ? null : Math.round(Number(n)))
const pct = (part: number, whole: number): number => (whole ? Math.round((part / whole) * 1000) / 10 : 0)

/** MTTR, recurring and resolution rates, breakdowns and leaderboards — 6 queries in parallel. */
export async function getDashboardStats(scope: OrgScope): Promise<DashboardStats> {
  const [summary, byStatus, bySeverity, bySystem, topRecurring, solutions, recent] = await Promise.all([
    prisma.$queryRaw<{
      all: number; this_month: number; last_month: number; open: number; open_p1: number
      recurring: number; resolved: number; avg_mttr: number | null
    }[]>`
      SELECT
        count(*)::int AS all,
        count(*) FILTER (WHERE "createdAt" >= date_trunc('month', now()))::int AS this_month,
        count(*) FILTER (WHERE "createdAt" >= date_trunc('month', now()) - interval '1 month'
                           AND "createdAt" < date_trunc('month', now()))::int AS last_month,
        count(*) FILTER (WHERE "status" IN ('OPEN', 'INVESTIGATING'))::int AS open,
        count(*) FILTER (WHERE "status" IN ('OPEN', 'INVESTIGATING') AND "severity" = 'P1')::int AS open_p1,
        count(*) FILTER (WHERE "linkedToId" IS NOT NULL)::int AS recurring,
        count(*) FILTER (WHERE "status" IN ('RESOLVED', 'CLOSED'))::int AS resolved,
        avg("actualMTTR")::float AS avg_mttr
      FROM "Incident" WHERE "deletedAt" IS NULL${orgSql(scope)}
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT "status" AS key, count(*)::int AS count FROM "Incident"
      WHERE "deletedAt" IS NULL${orgSql(scope)} GROUP BY "status" ORDER BY count DESC
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT "severity" AS key, count(*)::int AS count FROM "Incident"
      WHERE "deletedAt" IS NULL${orgSql(scope)} GROUP BY "severity" ORDER BY "severity"
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT system AS key, count(*)::int AS count
      FROM "Incident", unnest("affectedSystems") AS system
      WHERE "deletedAt" IS NULL${orgSql(scope)} GROUP BY system ORDER BY count DESC, system LIMIT 10
    `,
    getTopRecurring(10, scope),
    prisma.$queryRaw<{ total: number; verified: number }[]>`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE s."status" = 'VERIFIED')::int AS verified
      FROM "Solution" s JOIN "Incident" i ON i."id" = s."incidentId" WHERE i."deletedAt" IS NULL${orgSql(scope, 'i')}
    `,
    prisma.incident.findMany({
      where: { deletedAt: null, ...(scope.organizationId && { organizationId: scope.organizationId }) },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: refSelect
    })
  ])

  const s = summary[0] ?? { all: 0, this_month: 0, last_month: 0, open: 0, open_p1: 0, recurring: 0, resolved: 0, avg_mttr: null }
  return {
    totals: { all: s.all, thisMonth: s.this_month, lastMonth: s.last_month, open: s.open, openP1: s.open_p1 },
    avgMTTR: round(s.avg_mttr),
    recurringRate: pct(s.recurring, s.all),
    resolutionRate: pct(s.resolved, s.all),
    verifiedSolutions: solutions[0]?.verified ?? 0,
    totalSolutions: solutions[0]?.total ?? 0,
    byStatus,
    bySeverity,
    bySystem,
    topRecurring,
    recent: recent.map(toRef)
  }
}

export async function getTopRecurring(limit: number, scope: OrgScope): Promise<RecurringRow[]> {
  const rows = await prisma.$queryRaw<{
    id: string; title: string; severity: string; status: string; count: number; avg_mttr: number | null; last: Date
  }[]>`
    SELECT r."id", r."title", r."severity", r."status", r."recurringCount" AS count,
      chain.avg_mttr, chain.last
    FROM "Incident" r
    CROSS JOIN LATERAL (
      SELECT avg(c."actualMTTR")::float AS avg_mttr, max(c."createdAt") AS last
      FROM "Incident" c
      WHERE (c."id" = r."id" OR c."linkedToId" = r."id") AND c."deletedAt" IS NULL
    ) chain
    WHERE r."deletedAt" IS NULL AND r."recurringCount" > 1${orgSql(scope, 'r')}
    ORDER BY r."recurringCount" DESC, chain.last DESC
    LIMIT ${limit}
  `
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    severity: r.severity as Severity,
    status: r.status as IncidentStatus,
    count: r.count,
    avgMTTR: round(r.avg_mttr),
    lastOccurrence: r.last.toISOString()
  }))
}

/** Daily series (UTC days, oldest first) with gaps filled by zeros. */
export async function getTrends(days: number, scope: OrgScope): Promise<TrendStats> {
  const [points, weeks] = await Promise.all([
    prisma.$queryRaw<{
      day: Date; incidents: number; p1: number; p2: number; p3: number; p4: number; resolved: number; avg_mttr: number | null
    }[]>`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => ${days - 1}::int),
          date_trunc('day', now() AT TIME ZONE 'UTC'),
          interval '1 day'
        ) AS day
      ),
      created AS (
        SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS incidents,
          count(*) FILTER (WHERE "severity" = 'P1')::int AS p1,
          count(*) FILTER (WHERE "severity" = 'P2')::int AS p2,
          count(*) FILTER (WHERE "severity" = 'P3')::int AS p3,
          count(*) FILTER (WHERE "severity" = 'P4')::int AS p4
        FROM "Incident"
        WHERE "deletedAt" IS NULL${orgSql(scope)} AND "createdAt" >= (SELECT min(day) FROM days)
        GROUP BY 1
      ),
      resolved AS (
        SELECT date_trunc('day', "resolvedAt") AS day, count(*)::int AS resolved, avg("actualMTTR")::float AS avg_mttr
        FROM "Incident"
        WHERE "deletedAt" IS NULL${orgSql(scope)} AND "resolvedAt" >= (SELECT min(day) FROM days)
        GROUP BY 1
      )
      SELECT d.day, coalesce(c.incidents, 0) AS incidents, coalesce(c.p1, 0) AS p1, coalesce(c.p2, 0) AS p2,
        coalesce(c.p3, 0) AS p3, coalesce(c.p4, 0) AS p4, coalesce(r.resolved, 0) AS resolved, r.avg_mttr
      FROM days d
      LEFT JOIN created c ON c.day = d.day
      LEFT JOIN resolved r ON r.day = d.day
      ORDER BY d.day
    `,
    prisma.$queryRaw<{ this_week: number; last_week: number }[]>`
      SELECT
        count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days')::int AS this_week,
        count(*) FILTER (WHERE "createdAt" >= now() - interval '14 days' AND "createdAt" < now() - interval '7 days')::int AS last_week
      FROM "Incident" WHERE "deletedAt" IS NULL${orgSql(scope)} AND "createdAt" >= now() - interval '14 days'
    `
  ])

  return {
    days,
    points: points.map(p => ({
      day: p.day.toISOString().slice(0, 10),
      incidents: p.incidents,
      P1: p.p1,
      P2: p.p2,
      P3: p.p3,
      P4: p.p4,
      resolved: p.resolved,
      avgMTTR: round(p.avg_mttr)
    })),
    thisWeek: weeks[0]?.this_week ?? 0,
    lastWeek: weeks[0]?.last_week ?? 0
  }
}

export async function getSystemStats(scope: OrgScope): Promise<SystemStat[]> {
  const rows = await prisma.$queryRaw<{ system: string; incidents: number; open: number; recurring: number; avg_mttr: number | null }[]>`
    SELECT system, count(*)::int AS incidents,
      count(*) FILTER (WHERE "status" IN ('OPEN', 'INVESTIGATING'))::int AS open,
      count(*) FILTER (WHERE "linkedToId" IS NOT NULL)::int AS recurring,
      avg("actualMTTR")::float AS avg_mttr
    FROM "Incident", unnest("affectedSystems") AS system
    WHERE "deletedAt" IS NULL${orgSql(scope)}
    GROUP BY system ORDER BY incidents DESC, system
  `
  return rows.map(r => ({ system: r.system, incidents: r.incidents, open: r.open, recurring: r.recurring, avgMTTR: round(r.avg_mttr) }))
}

export async function getTeamStats(scope: OrgScope): Promise<TeamStats> {
  const [teams, solvers, heatmap] = await Promise.all([
    prisma.$queryRaw<{ department: string; incidents: number; open: number; avg_mttr: number | null; top_solver: string | null }[]>`
      WITH solver_counts AS (
        SELECT i."department", s."solvedBy", count(*) AS n,
          row_number() OVER (PARTITION BY i."department" ORDER BY count(*) DESC, s."solvedBy") AS rn
        FROM "Solution" s JOIN "Incident" i ON i."id" = s."incidentId"
        WHERE i."deletedAt" IS NULL${orgSql(scope, 'i')}
        GROUP BY i."department", s."solvedBy"
      )
      SELECT i."department", count(*)::int AS incidents,
        count(*) FILTER (WHERE i."status" IN ('OPEN', 'INVESTIGATING'))::int AS open,
        avg(i."actualMTTR")::float AS avg_mttr,
        (SELECT sc."solvedBy" FROM solver_counts sc WHERE sc."department" = i."department" AND sc.rn = 1) AS top_solver
      FROM "Incident" i
      WHERE i."deletedAt" IS NULL${orgSql(scope, 'i')}
      GROUP BY i."department"
      ORDER BY incidents DESC
    `,
    prisma.$queryRaw<{ name: string; solutions: number; verified: number }[]>`
      SELECT s."solvedBy" AS name, count(*)::int AS solutions,
        count(*) FILTER (WHERE s."status" = 'VERIFIED')::int AS verified
      FROM "Solution" s JOIN "Incident" i ON i."id" = s."incidentId"
      WHERE i."deletedAt" IS NULL${orgSql(scope, 'i')}
      GROUP BY s."solvedBy" ORDER BY verified DESC, solutions DESC, name LIMIT 10
    `,
    prisma.$queryRaw<{ department: string; system: string; count: number }[]>`
      SELECT "department", system, count(*)::int AS count
      FROM "Incident", unnest("affectedSystems") AS system
      WHERE "deletedAt" IS NULL${orgSql(scope)}
      GROUP BY "department", system
    `
  ])
  return {
    teams: teams.map(t => ({
      department: t.department, incidents: t.incidents, open: t.open, avgMTTR: round(t.avg_mttr), topSolver: t.top_solver
    })),
    topSolvers: solvers,
    heatmap
  }
}

export async function getSolutionEffectiveness(solutionId: string, scope: OrgScope): Promise<SolutionEffectiveness | null> {
  const solution = await prisma.solution.findFirst({
    where: { id: solutionId, incident: { deletedAt: null, ...(scope.organizationId && { organizationId: scope.organizationId }) } },
    select: { id: true, incident: { select: { actualMTTR: true } } }
  })
  if (!solution) return null

  const rows = await prisma.$queryRaw<{ used: number; worked: number; failed: number; avg_mttr: number | null }[]>`
    SELECT count(*)::int AS used,
      count(*) FILTER (WHERE m."didSolutionWork" = true)::int AS worked,
      count(*) FILTER (WHERE m."didSolutionWork" = false)::int AS failed,
      avg(i."actualMTTR")::float AS avg_mttr
    FROM "MatchLink" m JOIN "Incident" i ON i."id" = m."newIncidentId"
    WHERE m."solutionUsed" = ${solutionId} AND i."deletedAt" IS NULL${orgSql(scope, 'i')}
  `
  const r = rows[0] ?? { used: 0, worked: 0, failed: 0, avg_mttr: null }
  const recorded = r.worked + r.failed
  const originalMTTR = solution.incident.actualMTTR
  const avgMTTRWhenUsed = round(r.avg_mttr)
  return {
    solutionId,
    timesUsed: r.used,
    worked: r.worked,
    failed: r.failed,
    pending: r.used - recorded,
    successRate: recorded ? pct(r.worked, recorded) : null,
    originalMTTR,
    avgMTTRWhenUsed,
    mttrImprovement: originalMTTR !== null && avgMTTRWhenUsed !== null ? originalMTTR - avgMTTRWhenUsed : null
  }
}
