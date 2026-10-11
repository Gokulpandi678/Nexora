import { NextResponse } from 'next/server'
import { logActivity, refreshRecurringCount } from '@/lib/activity'
import { badRequest, inOrg, notFound, parseJson, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sendMatchNotification } from '@/lib/email'
import { toLink } from '@/lib/serializers'
import { createLinkSchema } from '@/lib/validators'
import { MATCH_TYPE_LABEL } from '@/lib/constants'

type Params = { id: string }

/**
 * POST /api/incidents/:id/link — link this (newer) incident to an earlier one.
 *  SAME    → becomes a recurrence of the original's root; root.recurringCount is updated
 *  SIMILAR → cross-reference only ("similar, different approach")
 *  DERIVED → this incident was caused by the original
 * The original's owner is emailed unless they reported this incident themselves.
 */
export const POST = route<Params>('incidents.link', async (req, { params }) => {
  const { id: newIncidentId } = await params
  const { actor, scope } = await requireOrg(req, 'REPORTER')
  const { originalIncidentId, matchType, solutionUsed, notes } = await parseJson(req, createLinkSchema)

  if (newIncidentId === originalIncidentId) throw badRequest('An incident cannot be linked to itself')

  const [newIncident, original] = await Promise.all([
    prisma.incident.findFirst({ where: { id: newIncidentId, deletedAt: null, ...inOrg(scope) } }),
    prisma.incident.findFirst({ where: { id: originalIncidentId, deletedAt: null, ...inOrg(scope) } })
  ])
  if (!newIncident || !original) throw notFound()

  if (solutionUsed) {
    const solution = await prisma.solution.findFirst({ where: { id: solutionUsed, incidentId: originalIncidentId } })
    if (!solution) throw badRequest('That solution does not belong to the original incident')
  }

  // Group recurrences under the first occurrence so one chain has one root
  const rootId = original.linkedToId ?? original.id
  const wouldCycle = rootId === newIncidentId

  const link = await prisma.$transaction(async tx => {
    const saved = await tx.matchLink.upsert({
      where: { newIncidentId_originalIncidentId: { newIncidentId, originalIncidentId } },
      create: { newIncidentId, originalIncidentId, matchType, solutionUsed, notes, createdBy: actor.name },
      update: { matchType, solutionUsed, notes }
    })

    const previousRoot = newIncident.linkedToId
    if (matchType === 'SAME' && !wouldCycle) {
      await tx.incident.update({ where: { id: newIncidentId }, data: { linkedToId: rootId } })
      await refreshRecurringCount(tx, rootId)
      if (previousRoot && previousRoot !== rootId) await refreshRecurringCount(tx, previousRoot)
    } else if (previousRoot === rootId) {
      // Downgraded from SAME: no longer counts as a recurrence
      await tx.incident.update({ where: { id: newIncidentId }, data: { linkedToId: null } })
      await refreshRecurringCount(tx, rootId)
    }

    const label = MATCH_TYPE_LABEL[matchType]
    await logActivity(tx, newIncidentId, 'LINKED', actor.name, `Linked to "${original.title}" (${label})`)
    await logActivity(tx, originalIncidentId, 'LINKED', actor.name, `"${newIncident.title}" linked here (${label})`)
    return saved
  })

  const notified =
    original.email !== newIncident.email && original.email !== actor.email
      ? await sendMatchNotification({
          ownerEmail: original.email,
          originalTitle: original.title,
          newIncidentId,
          newIncidentTitle: newIncident.title,
          reportedBy: actor.name,
          notes
        })
      : false

  return NextResponse.json({ link: toLink(link), notified, ownerName: original.createdBy })
})
