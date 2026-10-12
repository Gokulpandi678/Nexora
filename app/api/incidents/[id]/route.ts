import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { logActivity, minutesBetween, refreshRecurringCount } from '@/lib/activity'
import { inOrg, notFound, parseJson, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sendStatusNotification } from '@/lib/email'
import { getIncidentWithDetails } from '@/lib/incidents'
import { resolveProjects, slaDueFor } from '@/lib/projects'
import { resumeShift } from '@/lib/sla'
import { IMPACT_LABEL, STATUS_LABEL, type Impact, type IncidentStatus } from '@/lib/constants'
import { updateIncidentSchema } from '@/lib/validators'

type Params = { id: string }

/** GET /api/incidents/:id — incident with solutions, links, recurrences and recent activity. */
export const GET = route<Params>('incidents.get', async (req, { params }) => {
  const { id } = await params
  const { scope } = await requireOrg(req)
  const incident = await getIncidentWithDetails(id, scope)
  if (!incident) throw notFound()
  return NextResponse.json(incident)
})

const isDone = (s: string): boolean => s === 'RESOLVED' || s === 'CLOSED'

const when = (d: Date): string => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`
const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every(x => b.includes(x))

/**
 * PATCH /api/incidents/:id — change status, severity, department, tags, projects and impact; acknowledge,
 * mark mitigated, pause or resume the SLA clock. Every change is audit-logged.
 */
export const PATCH = route<Params>('incidents.update', async (req, { params }) => {
  const { id } = await params
  const { actor, scope } = await requireOrg(req, 'REPORTER')
  const input = await parseJson(req, updateIncidentSchema)

  const current = await prisma.incident.findFirst({
    where: { id, deletedAt: null, ...inOrg(scope) },
    include: { projects: { include: { slaPolicies: true } } }
  })
  if (!current) throw notFound()

  const now = new Date()
  const data: Prisma.IncidentUpdateInput = {}
  const changes: string[] = []
  // SLA fields are worked on as a set and written once at the end
  let sla = {
    slaPausedAt: current.slaPausedAt,
    slaPausedMinutes: current.slaPausedMinutes,
    slaResponseDueAt: current.slaResponseDueAt,
    slaResolveDueAt: current.slaResolveDueAt
  }
  let slaChanged = false
  const finalStatus = input.status ?? current.status

  if (input.status && input.status !== current.status) {
    data.status = input.status
    changes.push(`Status ${current.status} → ${input.status}`)
    // Picking an incident up counts as the first response
    if (input.status !== 'OPEN' && !current.acknowledgedAt) data.acknowledgedAt = now
    // A resolved incident is no longer waiting on anyone
    if (isDone(input.status) && sla.slaPausedAt) {
      sla = resumeShift(sla, now)
      slaChanged = true
    }
    if (isDone(input.status)) {
      // MTTR counts from report to first resolution; closing later does not extend it
      const resolvedAt = current.resolvedAt ?? now
      data.resolvedAt = resolvedAt
      data.actualMTTR = minutesBetween(current.createdAt, resolvedAt)
      data.closedAt = input.status === 'CLOSED' ? now : null
    } else {
      data.resolvedAt = null
      data.closedAt = null
      data.actualMTTR = null
    }
  }
  if (input.severity && input.severity !== current.severity) {
    data.severity = input.severity
    changes.push(`Severity ${current.severity} → ${input.severity}`)
  }
  if (input.department && input.department !== current.department) {
    data.department = input.department
    changes.push(`Department ${current.department} → ${input.department}`)
  }
  if (input.tags && input.tags.join(',') !== current.tags.join(',')) {
    data.tags = input.tags
    changes.push(`Tags set to ${input.tags.length ? input.tags.join(', ') : '(none)'}`)
  }

  // Projects and severity decide the SLA targets: when either changes, the due dates are worked out again
  let projects = current.projects
  const projectsChanged = input.projectIds !== undefined && !sameSet(input.projectIds, current.projects.map(p => p.id))
  if (projectsChanged && input.projectIds) {
    projects = await resolveProjects(input.projectIds, scope)
    data.projects = { set: projects.map(p => ({ id: p.id })) }
    changes.push(`Projects set to ${projects.length ? projects.map(p => p.name).join(', ') : '(none)'}`)
  }
  if (projectsChanged || data.severity) {
    sla = { ...sla, ...slaDueFor(projects, input.severity ?? current.severity, current.createdAt, sla.slaPausedMinutes) }
    slaChanged = true
    // Notifications were about the old targets; the SLA check re-evaluates against the new ones
    Object.assign(data, { slaWarnedAt: null, slaResponseBreachedAt: null, slaResolveBreachedAt: null })
  }

  if (input.impact && input.impact !== current.impact) {
    data.impact = input.impact
    changes.push(`Impact: ${IMPACT_LABEL[input.impact as Impact]}`)
  }
  if (input.startedAt !== undefined && input.startedAt?.getTime() !== current.startedAt?.getTime()) {
    data.startedAt = input.startedAt
    changes.push(input.startedAt ? `Impact started ${when(input.startedAt)}` : 'Impact start cleared (counts from the report)')
  }
  if (input.acknowledge && !current.acknowledgedAt && !data.acknowledgedAt) {
    data.acknowledgedAt = now
    changes.push('Acknowledged')
  }
  if (input.mitigated === true && !current.mitigatedAt) {
    data.mitigatedAt = now
    changes.push('Service restored (mitigated)')
  } else if (input.mitigated === false && current.mitigatedAt) {
    data.mitigatedAt = null
    changes.push('Impact ongoing again (mitigation cleared)')
  }

  if (input.slaPaused === true && !sla.slaPausedAt && !isDone(finalStatus) && (sla.slaResolveDueAt || sla.slaResponseDueAt)) {
    sla = { ...sla, slaPausedAt: now }
    slaChanged = true
    changes.push('SLA clock paused: waiting on the customer')
  } else if (input.slaPaused === false && sla.slaPausedAt) {
    const pausedFor = Math.round((now.getTime() - sla.slaPausedAt.getTime()) / 60_000)
    sla = resumeShift(sla, now)
    slaChanged = true
    changes.push(`SLA clock resumed after ${pausedFor} min`)
  }
  if (slaChanged) Object.assign(data, sla)

  if (changes.length === 0) return NextResponse.json(await getIncidentWithDetails(id, scope))

  await prisma.$transaction(async tx => {
    await tx.incident.update({ where: { id }, data })
    for (const change of changes) {
      await logActivity(tx, id, change.startsWith('Status') ? 'STATUS_CHANGED' : 'UPDATED', actor.name, change)
    }
  })

  if (input.status && input.status !== current.status && current.email !== actor.email) {
    await sendStatusNotification({
      to: current.email,
      incidentId: id,
      incidentTitle: current.title,
      status: STATUS_LABEL[input.status as IncidentStatus],
      actor: actor.name
    })
  }

  return NextResponse.json(await getIncidentWithDetails(id, scope))
})

/** DELETE /api/incidents/:id — soft delete (admin only). The row and its history are kept for audit. */
export const DELETE = route<Params>('incidents.delete', async (req, { params }) => {
  const { id } = await params
  const { actor, scope } = await requireOrg(req, 'ADMIN')
  const current = await prisma.incident.findFirst({ where: { id, deletedAt: null, ...inOrg(scope) }, select: { linkedToId: true } })
  if (!current) throw notFound()

  await prisma.$transaction(async tx => {
    await tx.incident.update({ where: { id }, data: { deletedAt: new Date() } })
    await logActivity(tx, id, 'DELETED', actor.name, 'Incident deleted')
    if (current.linkedToId) await refreshRecurringCount(tx, current.linkedToId)
  })
  return new NextResponse(null, { status: 204 })
})
