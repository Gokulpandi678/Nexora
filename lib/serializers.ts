import type { ActivityLog, Comment, Incident, MatchLink, Solution } from '@prisma/client'
import type {
  ActivityDTO, CommentDTO, IncidentDetailDTO, IncidentRef, MatchLinkDTO, SolutionDTO
} from '@/lib/types'
import type {
  Department, Efficiency, IncidentStatus, LinkOutcome, MatchType, Severity, SolutionStatus
} from '@/lib/constants'

const iso = (d: Date | null): string | null => d?.toISOString() ?? null

type RefSource = Pick<Incident, 'id' | 'title' | 'severity' | 'status' | 'createdBy' | 'createdAt'>

export const refSelect = {
  id: true, title: true, severity: true, status: true, createdBy: true, createdAt: true
} as const

export function toRef(i: RefSource): IncidentRef {
  return {
    id: i.id,
    title: i.title,
    severity: i.severity as Severity,
    status: i.status as IncidentStatus,
    createdBy: i.createdBy,
    createdAt: i.createdAt.toISOString()
  }
}

export function toSolution(s: Solution): SolutionDTO {
  return {
    ...s,
    efficiency: s.efficiency as Efficiency,
    status: s.status as SolutionStatus,
    solvedAt: s.solvedAt.toISOString(),
    verifiedAt: iso(s.verifiedAt)
  }
}

export function toLink(l: MatchLink): MatchLinkDTO {
  return {
    ...l,
    matchType: l.matchType as MatchType,
    outcome: l.outcome as LinkOutcome | null,
    createdAt: l.createdAt.toISOString(),
    resolvedAt: iso(l.resolvedAt)
  }
}

export function toActivity(a: ActivityLog): ActivityDTO {
  return { id: a.id, action: a.action, actor: a.actor, details: a.details, timestamp: a.timestamp.toISOString() }
}

export function toComment(c: Comment & { replies?: Comment[] }): CommentDTO {
  return {
    id: c.id,
    incidentId: c.incidentId,
    parentId: c.parentId,
    author: c.author,
    email: c.email,
    content: c.content,
    mentions: c.mentions,
    createdAt: c.createdAt.toISOString(),
    replies: (c.replies ?? []).map(r => toComment(r))
  }
}

type DetailSource = Incident & {
  linkedTo: (RefSource & { solutions: Solution[] }) | null
  linkedFrom: RefSource[]
  solutions: Solution[]
  matchedAs: (MatchLink & { originalIncident: RefSource })[]
  matchedFrom: (MatchLink & { newIncident: RefSource })[]
  activityLog: ActivityLog[]
  _count: { comments: number }
}

export function toDetail(i: DetailSource): IncidentDetailDTO {
  return {
    id: i.id,
    title: i.title,
    description: i.description,
    symptoms: i.symptoms,
    initialFixes: i.initialFixes,
    affectedSystems: i.affectedSystems,
    tags: i.tags,
    severity: i.severity as Severity,
    status: i.status as IncidentStatus,
    createdBy: i.createdBy,
    email: i.email,
    department: i.department as Department,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    resolvedAt: iso(i.resolvedAt),
    closedAt: iso(i.closedAt),
    estimatedMTTR: i.estimatedMTTR,
    actualMTTR: i.actualMTTR,
    recurringCount: i.recurringCount,
    linkedTo: i.linkedTo ? { ...toRef(i.linkedTo), solutions: i.linkedTo.solutions.map(toSolution) } : null,
    linkedFrom: i.linkedFrom.map(toRef),
    solutions: i.solutions.map(toSolution),
    matchedAs: i.matchedAs.map(m => ({ ...toLink(m), originalIncident: toRef(m.originalIncident) })),
    matchedFrom: i.matchedFrom.map(m => ({ ...toLink(m), newIncident: toRef(m.newIncident) })),
    commentCount: i._count.comments,
    activity: i.activityLog.map(toActivity)
  }
}
