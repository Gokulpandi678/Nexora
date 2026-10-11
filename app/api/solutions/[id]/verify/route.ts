import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity'
import { inOrg, notFound, parseJson, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sendVerifiedNotification } from '@/lib/email'
import { toSolution } from '@/lib/serializers'
import { verifySolutionSchema } from '@/lib/validators'

type Params = { id: string }

/**
 * PATCH /api/solutions/:id/verify — QA sign-off (verifier or admin role).
 * Body: { status: "VERIFIED" | "UNVERIFIED" | "DEPRECATED" }, default VERIFIED.
 */
export const PATCH = route<Params>('solutions.verify', async (req, { params }) => {
  const { id } = await params
  const { actor, scope } = await requireOrg(req, 'VERIFIER')
  const { status } = await parseJson(req, verifySolutionSchema)

  const existing = await prisma.solution.findFirst({
    where: { id, incident: { deletedAt: null, ...inOrg(scope) } },
    include: { incident: { select: { title: true } } }
  })
  if (!existing) throw notFound('Solution')

  const verified = status === 'VERIFIED'
  const solution = await prisma.$transaction(async tx => {
    const updated = await tx.solution.update({
      where: { id },
      data: { status, verifiedBy: verified ? actor.name : null, verifiedAt: verified ? new Date() : null }
    })
    await logActivity(tx, existing.incidentId, 'VERIFIED', actor.name, `Solution by ${existing.solvedBy} marked ${status.toLowerCase()}`)
    return updated
  })

  if (verified && existing.status !== 'VERIFIED' && existing.email && existing.email !== actor.email) {
    await sendVerifiedNotification({
      to: existing.email,
      incidentId: existing.incidentId,
      incidentTitle: existing.incident.title,
      verifier: actor.name
    })
  }

  return NextResponse.json(toSolution(solution))
})
