import { NextResponse } from 'next/server'
import { logActivity, minutesBetween } from '@/lib/activity'
import { inOrg, notFound, parseJson, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { toSolution } from '@/lib/serializers'
import { createSolutionSchema } from '@/lib/validators'
import { EFFICIENCY_LABEL, QA_CHECKLIST } from '@/lib/constants'

type Params = { id: string }

/** GET /api/incidents/:id/solutions — verified first, deprecated last. */
export const GET = route<Params>('solutions.list', async (req, { params }) => {
  const { id } = await params
  const { scope } = await requireOrg(req)
  const solutions = await prisma.solution.findMany({
    where: { incidentId: id, incident: { deletedAt: null, ...inOrg(scope) } },
    orderBy: [{ status: 'desc' }, { solvedAt: 'desc' }]
  })
  return NextResponse.json(solutions.map(toSolution))
})

/**
 * POST /api/incidents/:id/solutions — record how the incident was fixed.
 * QA checklist items may be left open; they stay visible on the solution until verified.
 * With `resolve: true` (default) the incident moves to RESOLVED and its MTTR is recorded.
 */
export const POST = route<Params>('solutions.create', async (req, { params }) => {
  const { id } = await params
  const { actor, scope } = await requireOrg(req, 'REPORTER')
  const { resolve, ...input } = await parseJson(req, createSolutionSchema)

  const incident = await prisma.incident.findFirst({
    where: { id, deletedAt: null, ...inOrg(scope) },
    select: { id: true, status: true, createdAt: true, resolvedAt: true }
  })
  if (!incident) throw notFound()

  const solution = await prisma.$transaction(async tx => {
    const created = await tx.solution.create({
      data: { ...input, incidentId: id, solvedBy: actor.name, email: actor.email, status: 'UNVERIFIED' }
    })
    await logActivity(
      tx, id, 'SOLUTION_ADDED', actor.name,
      `${EFFICIENCY_LABEL[input.efficiency]} added (QA ${input.qaChecks.length}/${QA_CHECKLIST.length})`
    )
    if (resolve && incident.status !== 'RESOLVED' && incident.status !== 'CLOSED') {
      const resolvedAt = new Date()
      await tx.incident.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt, actualMTTR: minutesBetween(incident.createdAt, resolvedAt) }
      })
      await logActivity(tx, id, 'STATUS_CHANGED', actor.name, `Status ${incident.status} → RESOLVED`)
    }
    return created
  })

  return NextResponse.json(toSolution(solution), { status: 201 })
})
