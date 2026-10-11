import { NextResponse } from 'next/server'
import { inOrg, notFound, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { embedIncident, embeddingsEnabled, loadIncidentEmbedding } from '@/lib/embeddings'
import { findSimilarIncidents, matchQueryFor } from '@/lib/search'

type Params = { id: string }

/** GET /api/incidents/:id/matches?limit=5 — similar incidents ranked by relevance, excluding ones already linked. */
export const GET = route<Params>('incidents.matches', async (req, { params }) => {
  const { id } = await params
  const { scope } = await requireOrg(req)
  const limit = Math.min(20, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 5))

  const incident = await prisma.incident.findFirst({
    where: { id, deletedAt: null, ...inOrg(scope) },
    select: {
      id: true, title: true, description: true, symptoms: true, affectedSystems: true, linkedToId: true,
      matchedAs: { select: { originalIncidentId: true } },
      matchedFrom: { select: { newIncidentId: true } }
    }
  })
  if (!incident) throw notFound()

  // Incidents reported before embeddings were switched on get embedded the first time they are matched
  const embedding = embeddingsEnabled() ? (await loadIncidentEmbedding(id)) ?? (await embedIncident(incident)) : null

  const excludeIds = [
    id,
    ...(incident.linkedToId ? [incident.linkedToId] : []),
    ...incident.matchedAs.map(m => m.originalIncidentId),
    ...incident.matchedFrom.map(m => m.newIncidentId)
  ]
  const matches = await findSimilarIncidents(matchQueryFor(incident), {
    scope,
    limit,
    excludeIds,
    systems: incident.affectedSystems,
    embedding
  })
  return NextResponse.json(matches)
})
