import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity'
import { parseJson, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { escalateP1 } from '@/lib/email'
import { embedIncident } from '@/lib/embeddings'
import { logError } from '@/lib/logger'
import { resolveProjects, slaDueFor } from '@/lib/projects'
import { findSimilarIncidents, matchQueryFor } from '@/lib/search'
import { toRef } from '@/lib/serializers'
import { createIncidentSchema } from '@/lib/validators'

/** POST /api/incidents/create — report an incident and get back the most similar past incidents. */
export const POST = route('incidents.create', async req => {
  const { actor, scope } = await requireOrg(req, 'REPORTER')
  const { projectIds = [], ...parsed } = await parseJson(req, createIncidentSchema)
  // The signed-in user is always the reporter, whatever the body says
  const data = { ...parsed, createdBy: actor.name, email: actor.email }

  const incident = await prisma.$transaction(async tx => {
    const projects = await resolveProjects(projectIds, scope, tx)
    const reportedAt = new Date()
    const created = await tx.incident.create({
      data: {
        ...data,
        tags: data.tags ?? [],
        status: 'OPEN',
        organizationId: scope.organizationId,
        createdAt: reportedAt,
        // Impact cannot start after the report
        startedAt: data.startedAt && data.startedAt < reportedAt ? data.startedAt : null,
        projects: { connect: projects.map(p => ({ id: p.id })) },
        ...slaDueFor(projects, data.severity, reportedAt)
      }
    })
    const on = projects.length ? `, ${projects.map(p => p.name).join(', ')}` : ''
    await logActivity(tx, created.id, 'CREATED', data.createdBy, `Incident reported (${data.severity}, ${data.department}${on})`)
    return created
  })

  const [similarIncidents] = await Promise.all([
    // Matching must never lose the user's report, so failures degrade to "no matches".
    // The embedding is stored on the incident so later reports can match against it.
    embedIncident(incident)
      .then(embedding => findSimilarIncidents(matchQueryFor(data), {
        scope, limit: 5, excludeIds: [incident.id], systems: data.affectedSystems, embedding
      }))
      .catch(error => {
        logError(error, { step: 'findSimilarIncidents', incidentId: incident.id })
        return []
      }),
    data.severity === 'P1'
      ? escalateP1({ incidentId: incident.id, title: incident.title, reportedBy: data.createdBy, systems: data.affectedSystems })
      : Promise.resolve(false)
  ])

  return NextResponse.json({ incident: toRef(incident), similarIncidents }, { status: 201 })
})
