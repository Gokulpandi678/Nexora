import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity'
import { inOrg, notFound, parseJson, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { toLink } from '@/lib/serializers'
import { updateLinkSchema } from '@/lib/validators'

type Params = { id: string }

/**
 * PATCH /api/links/:id — record whether the reused solution worked on the recurrence.
 * Feeds GET /api/solutions/:id/effectiveness.
 */
export const PATCH = route<Params>('links.update', async (req, { params }) => {
  const { id } = await params
  const { actor, scope } = await requireOrg(req, 'REPORTER')
  const { didSolutionWork, outcome } = await parseJson(req, updateLinkSchema)

  const existing = await prisma.matchLink.findFirst({ where: { id, newIncident: inOrg(scope) } })
  if (!existing) throw notFound('Link')

  const link = await prisma.$transaction(async tx => {
    const updated = await tx.matchLink.update({
      where: { id },
      data: {
        didSolutionWork,
        outcome: outcome ?? (didSolutionWork ? 'RESOLVED' : 'DIFFERENT_APPROACH_NEEDED'),
        resolvedAt: didSolutionWork ? new Date() : null
      }
    })
    await logActivity(
      tx, existing.newIncidentId, 'OUTCOME_RECORDED', actor.name,
      didSolutionWork ? 'The suggested fix worked' : 'The suggested fix did not work'
    )
    return updated
  })
  return NextResponse.json(toLink(link))
})
