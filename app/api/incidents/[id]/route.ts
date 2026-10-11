import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { logActivity, minutesBetween, refreshRecurringCount } from '@/lib/activity'
import { inOrg, notFound, parseJson, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sendStatusNotification } from '@/lib/email'
import { getIncidentWithDetails } from '@/lib/incidents'
import { STATUS_LABEL, type IncidentStatus } from '@/lib/constants'
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

/** PATCH /api/incidents/:id — change status, severity, department or tags. Every change is audit-logged. */
export const PATCH = route<Params>('incidents.update', async (req, { params }) => {
  const { id } = await params
  const { actor, scope } = await requireOrg(req, 'REPORTER')
  const input = await parseJson(req, updateIncidentSchema)

  const current = await prisma.incident.findFirst({ where: { id, deletedAt: null, ...inOrg(scope) } })
  if (!current) throw notFound()

  const now = new Date()
  const data: Prisma.IncidentUpdateInput = {}
  const changes: string[] = []

  if (input.status && input.status !== current.status) {
    data.status = input.status
    changes.push(`Status ${current.status} → ${input.status}`)
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
