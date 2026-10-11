import { inOrg, notFound, type OrgScope } from '@/lib/api'
import { prisma, live } from '@/lib/db'
import { refSelect, toDetail } from '@/lib/serializers'
import type { IncidentDetailDTO } from '@/lib/types'

const solutionOrder = [{ status: 'desc' as const }, { solvedAt: 'desc' as const }]

/** Everything the detail page needs in one round trip (Prisma batches the includes). */
export async function getIncidentWithDetails(id: string, scope: OrgScope): Promise<IncidentDetailDTO | null> {
  const incident = await prisma.incident.findFirst({
    where: { id, ...live, ...inOrg(scope) },
    include: {
      solutions: { orderBy: solutionOrder },
      linkedTo: { select: { ...refSelect, solutions: { orderBy: solutionOrder } } },
      linkedFrom: { where: live, select: refSelect, orderBy: { createdAt: 'desc' } },
      matchedAs: { include: { originalIncident: { select: refSelect } }, orderBy: { createdAt: 'desc' } },
      matchedFrom: {
        where: { newIncident: live },
        include: { newIncident: { select: refSelect } },
        orderBy: { createdAt: 'desc' }
      },
      activityLog: { orderBy: { timestamp: 'desc' }, take: 100 },
      _count: { select: { comments: true } }
    }
  })
  return incident ? toDetail(incident) : null
}

/** Root incidents that have recurred, most frequent first. */
export async function getRecurringIncidents(scope: OrgScope, limit = 10): Promise<{ id: string; title: string; recurringCount: number }[]> {
  return prisma.incident.findMany({
    where: { ...live, ...inOrg(scope), recurringCount: { gt: 1 } },
    orderBy: [{ recurringCount: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: { id: true, title: true, recurringCount: true }
  })
}

export async function assertIncidentExists(id: string, scope: OrgScope): Promise<{ id: string; title: string; email: string; createdBy: string; status: string; linkedToId: string | null }> {
  const incident = await prisma.incident.findFirst({
    where: { id, ...live, ...inOrg(scope) },
    select: { id: true, title: true, email: true, createdBy: true, status: true, linkedToId: true }
  })
  if (!incident) throw notFound()
  return incident
}
