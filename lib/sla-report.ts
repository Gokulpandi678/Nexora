import { inOrg, type OrgScope } from '@/lib/api'
import { CRITICALITIES, isOneOf, SEVERITIES, STATUSES } from '@/lib/constants'
import { prisma, live } from '@/lib/db'
import {
  allowedOutageMinutes, availabilityPercent, impactInterval, incidentSla, mergedMinutes, minutesBetween, monthRange,
  slaOutcome, type Interval
} from '@/lib/sla'
import type { ProjectSlaRow, SlaReport, SlaRiskRow } from '@/lib/types'

const incidentFields = {
  id: true, title: true, severity: true, status: true, impact: true, createdAt: true, startedAt: true,
  acknowledgedAt: true, mitigatedAt: true, resolvedAt: true, slaResponseDueAt: true, slaResolveDueAt: true,
  slaPausedAt: true, slaPausedMinutes: true
} as const

const percent = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)

/**
 * SLA and availability for one calendar month (UTC). Downtime counts every outage that overlaps the month,
 * even one reported earlier; SLA compliance counts incidents reported in the month whose outcome is settled.
 */
export async function getSlaReport(scope: OrgScope, month?: string | null, now = new Date()): Promise<SlaReport> {
  const range = monthRange(month, now)
  const from = range.from.getTime()
  // A month in progress is measured up to now, so availability is not flattered by minutes still to come
  const to = Math.min(range.to.getTime(), now.getTime())
  const periodMinutes = Math.max(0, Math.round((to - from) / 60_000))

  const projects = await prisma.project.findMany({
    where: scope.organizationId ? { organizationId: scope.organizationId } : {},
    orderBy: { name: 'asc' },
    include: {
      owner: { select: { name: true, email: true } },
      incidents: {
        where: {
          ...live,
          createdAt: { lt: range.to },
          // Still open, or closed inside the month: anything older cannot touch it
          OR: [{ resolvedAt: null }, { resolvedAt: { gte: range.from } }]
        },
        select: incidentFields
      }
    }
  })

  const settled = new Map<string, 'met' | 'breached'>()
  const rows: ProjectSlaRow[] = []
  for (const p of projects) {
    const outages: Interval[] = []
    const degraded: Interval[] = []
    let incidents = 0
    let slaMet = 0
    let slaBreached = 0
    const resolveTimes: number[] = []

    for (const i of p.incidents) {
      const window = impactInterval(i, now)
      if (window) (i.impact === 'OUTAGE' ? outages : degraded).push(window)

      const reportedInMonth = i.createdAt >= range.from && i.createdAt < range.to
      if (!reportedInMonth) continue
      incidents++
      if (i.resolvedAt) resolveTimes.push(minutesBetween(i.createdAt, i.resolvedAt))
      const outcome = slaOutcome(incidentSla(i, now))
      if (outcome === 'met') slaMet++
      if (outcome === 'breached') slaBreached++
      if (outcome) settled.set(i.id, outcome)
    }

    // An archived project with nothing in the month is history, not a row
    if (p.archivedAt && incidents === 0 && outages.length === 0 && degraded.length === 0) continue

    const outageMinutes = mergedMinutes(outages, from, to)
    const allowed = allowedOutageMinutes(p.availabilityTarget, periodMinutes)
    const availability = availabilityPercent(outageMinutes, periodMinutes)
    rows.push({
      id: p.id,
      name: p.name,
      criticality: isOneOf(CRITICALITIES, p.criticality) ? p.criticality : 'MEDIUM',
      ownerName: p.owner ? p.owner.name || p.owner.email : null,
      archived: p.archivedAt !== null,
      availabilityTarget: p.availabilityTarget,
      incidents,
      outageMinutes,
      degradedMinutes: mergedMinutes(degraded, from, to),
      availability,
      targetMet: availability >= p.availabilityTarget,
      errorBudgetMinutes: allowed,
      errorBudgetLeftMinutes: allowed - outageMinutes,
      slaMet,
      slaBreached,
      compliance: percent(slaMet, slaMet + slaBreached),
      downtimeCost: outageMinutes * p.downtimeCostPerMinute,
      avgResolveMinutes: resolveTimes.length ? Math.round(resolveTimes.reduce((a, b) => a + b, 0) / resolveTimes.length) : null
    })
  }

  // Worst first: targets missed, then least available, then most breaches
  rows.sort((a, b) => Number(a.targetMet) - Number(b.targetMet) || a.availability - b.availability || b.slaBreached - a.slaBreached)

  // An incident on two projects counts once in the totals
  const outcomes = [...settled.values()]
  const met = outcomes.filter(o => o === 'met').length
  const breached = outcomes.length - met
  const active = rows.filter(r => !r.archived)

  return {
    month: range.month,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    periodMinutes,
    generatedAt: now.toISOString(),
    totals: {
      projects: active.length,
      projectsMeetingTarget: active.filter(r => r.targetMet).length,
      incidents: new Set(projects.flatMap(p => p.incidents.filter(i => i.createdAt >= range.from && i.createdAt < range.to).map(i => i.id))).size,
      slaMet: met,
      slaBreached: breached,
      compliance: percent(met, met + breached),
      outageMinutes: rows.reduce((sum, r) => sum + r.outageMinutes, 0),
      downtimeCost: rows.reduce((sum, r) => sum + r.downtimeCost, 0)
    },
    projects: rows,
    atRisk: await getAtRisk(scope, now)
  }
}

/** Open incidents whose SLA is at risk or already breached, nearest the deadline (or furthest past it) first. */
export async function getAtRisk(scope: OrgScope, now = new Date(), limit = 20): Promise<SlaRiskRow[]> {
  const open = await prisma.incident.findMany({
    where: { ...live, ...inOrg(scope), status: { in: ['OPEN', 'INVESTIGATING'] }, OR: [{ slaResolveDueAt: { not: null } }, { slaResponseDueAt: { not: null } }] },
    select: { ...incidentFields, projects: { select: { name: true }, orderBy: { name: 'asc' } } },
    orderBy: { slaResolveDueAt: 'asc' },
    take: 500
  })

  const rows: SlaRiskRow[] = []
  for (const i of open) {
    const sla = incidentSla(i, now)
    if (!sla) continue
    // The response clock matters only until someone acknowledges
    const clocks = [
      ...(sla.response && sla.response.state !== 'met' ? [{ clock: 'response' as const, c: sla.response }] : []),
      ...(sla.resolve ? [{ clock: 'resolve' as const, c: sla.resolve }] : [])
    ].filter(x => x.c.state === 'at_risk' || x.c.state === 'breached')
    const worst = clocks.sort((a, b) => a.c.remainingMinutes - b.c.remainingMinutes)[0]
    if (!worst) continue
    rows.push({
      id: i.id,
      title: i.title,
      severity: isOneOf(SEVERITIES, i.severity) ? i.severity : 'P3',
      status: isOneOf(STATUSES, i.status) ? i.status : 'OPEN',
      projects: i.projects.map(p => p.name),
      clock: worst.clock,
      state: worst.c.state,
      dueAt: worst.c.dueAt,
      remainingMinutes: worst.c.remainingMinutes
    })
  }
  return rows.sort((a, b) => a.remainingMinutes - b.remainingMinutes).slice(0, limit)
}
