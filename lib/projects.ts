import type { Prisma, Project, SlaPolicy } from '@prisma/client'
import { badRequest, HttpError, type OrgScope } from '@/lib/api'
import { CRITICALITIES, SEVERITIES, isOneOf } from '@/lib/constants'
import { prisma, type Tx } from '@/lib/db'
import { dueDates, strictestTargets } from '@/lib/sla'
import type { OrgMemberOption, ProjectDTO } from '@/lib/types'

/** What a project needs loaded to become a ProjectDTO (the owner with their membership in this organization). */
export const projectInclude = {
  slaPolicies: true,
  _count: { select: { incidents: true } },
  owner: { select: { id: true, name: true, email: true, memberships: { select: { organizationId: true, status: true } } } }
} as const

type ProjectOwnerRow = {
  id: string
  name: string
  email: string
  memberships: { organizationId: string; status: string }[]
} | null

const orderedPolicies = (policies: SlaPolicy[]): SlaPolicy[] =>
  [...policies].sort((a, b) => SEVERITIES.indexOf(a.severity as never) - SEVERITIES.indexOf(b.severity as never))

export function toProjectDTO(p: Project & { slaPolicies: SlaPolicy[]; _count: { incidents: number }; owner: ProjectOwnerRow }): ProjectDTO {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    owner: p.owner
      ? {
          id: p.owner.id,
          name: p.owner.name || p.owner.email,
          email: p.owner.email,
          active: p.owner.memberships.some(m => m.organizationId === p.organizationId && m.status === 'ACTIVE')
        }
      : null,
    criticality: isOneOf(CRITICALITIES, p.criticality) ? p.criticality : 'MEDIUM',
    availabilityTarget: p.availabilityTarget,
    downtimeCostPerMinute: p.downtimeCostPerMinute,
    archived: p.archivedAt !== null,
    slaPolicies: orderedPolicies(p.slaPolicies).flatMap(s =>
      isOneOf(SEVERITIES, s.severity) ? [{ severity: s.severity, responseMinutes: s.responseMinutes, resolveMinutes: s.resolveMinutes }] : []
    ),
    incidentCount: p._count.incidents
  }
}

const projectScope = (scope: OrgScope): Prisma.ProjectWhereInput =>
  scope.organizationId ? { organizationId: scope.organizationId } : {}

/** The organization's projects, most critical first; archived ones only when asked. */
export async function listProjects(scope: OrgScope, { includeArchived = false } = {}): Promise<ProjectDTO[]> {
  const rows = await prisma.project.findMany({
    where: { ...projectScope(scope), ...(includeArchived ? {} : { archivedAt: null }) },
    include: projectInclude,
    orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }]
  })
  return rows
    .map(toProjectDTO)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || CRITICALITIES.indexOf(a.criticality) - CRITICALITIES.indexOf(b.criticality))
}

/**
 * Checks that every id is an active project of this organization and returns them with their policies.
 * Unknown or archived ids are a 400, so an incident is never tagged with another organization's project.
 */
export async function resolveProjects(ids: string[], scope: OrgScope, db: Tx = prisma): Promise<(Project & { slaPolicies: SlaPolicy[] })[]> {
  if (ids.length === 0) return []
  const found = await db.project.findMany({
    where: { id: { in: ids }, archivedAt: null, ...projectScope(scope) },
    include: { slaPolicies: true }
  })
  if (found.length !== ids.length) throw badRequest('One of the selected projects does not exist or is archived')
  return found
}

/** SLA due dates for an incident on these projects at this severity (the strictest policy wins). */
export function slaDueFor(
  projects: { slaPolicies: SlaPolicy[] }[],
  severity: string,
  reportedAt: Date,
  pausedMinutes = 0
): { slaResponseDueAt: Date | null; slaResolveDueAt: Date | null } {
  return dueDates(reportedAt, strictestTargets(projects.flatMap(p => p.slaPolicies), severity), pausedMinutes)
}

/** A project lead must be an active member of the project's organization; anything else is a 400. */
export async function assertActiveMember(userId: string, organizationId: string): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { status: true }
  })
  if (membership?.status !== 'ACTIVE') throw new HttpError(400, 'The project lead must be an active member of your organization')
}

/** Active members of an organization, for the project lead picker. */
export async function activeMemberOptions(organizationId: string): Promise<OrgMemberOption[]> {
  const rows = await prisma.membership.findMany({
    where: { organizationId, status: 'ACTIVE' },
    select: { role: true, user: { select: { id: true, name: true, email: true } } }
  })
  return rows
    .map(m => ({ id: m.user.id, name: m.user.name || m.user.email, email: m.user.email, role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
