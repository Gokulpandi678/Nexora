/**
 * JSON shapes returned by the API (dates are ISO strings).
 * Shared by route handlers and client hooks so both sides agree at compile time.
 */
import type {
  Criticality, Department, Efficiency, Impact, IncidentStatus, LinkOutcome, MatchType, Severity, SolutionStatus
} from '@/lib/constants'
import type { IncidentSla, SlaClockState } from '@/lib/sla'

export type { IncidentSla, SlaClock, SlaClockState } from '@/lib/sla'

export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface IncidentListItem {
  id: string
  title: string
  symptoms: string
  severity: Severity
  status: IncidentStatus
  affectedSystems: string[]
  tags: string[]
  department: Department
  createdBy: string
  createdAt: string
  resolvedAt: string | null
  actualMTTR: number | null
  recurringCount: number
  linkedToId: string | null
  solutionCount: number
  verifiedSolutionCount: number
  commentCount: number
  /** Full-text relevance, present only when searching */
  score: number | null
}

export interface SolutionDTO {
  id: string
  incidentId: string
  rootCause: string
  approach: string
  timeToFix: number
  efficiency: Efficiency
  useCaseNotes: string
  qaChecks: string[]
  solvedBy: string
  email: string
  solvedAt: string
  status: SolutionStatus
  verifiedBy: string | null
  verifiedAt: string | null
  preventionRules: string | null
  monitoring: string | null
}

export interface IncidentRef {
  id: string
  title: string
  severity: Severity
  status: IncidentStatus
  createdBy: string
  createdAt: string
}

export interface MatchLinkDTO {
  id: string
  newIncidentId: string
  originalIncidentId: string
  matchType: MatchType
  solutionUsed: string | null
  notes: string | null
  didSolutionWork: boolean | null
  outcome: LinkOutcome | null
  createdBy: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface ActivityDTO {
  id: string
  action: string
  actor: string
  details: string
  timestamp: string
}

export interface CommentDTO {
  id: string
  incidentId: string
  parentId: string | null
  author: string
  email: string
  content: string
  mentions: string[]
  createdAt: string
  replies: CommentDTO[]
}

export interface IncidentDetailDTO {
  id: string
  title: string
  description: string
  symptoms: string
  initialFixes: string | null
  affectedSystems: string[]
  tags: string[]
  severity: Severity
  status: IncidentStatus
  createdBy: string
  email: string
  department: Department
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  closedAt: string | null
  estimatedMTTR: number | null
  actualMTTR: number | null
  recurringCount: number
  linkedTo: (IncidentRef & { solutions: SolutionDTO[] }) | null
  linkedFrom: IncidentRef[]
  solutions: SolutionDTO[]
  matchedAs: (MatchLinkDTO & { originalIncident: IncidentRef })[]
  matchedFrom: (MatchLinkDTO & { newIncident: IncidentRef })[]
  commentCount: number
  activity: ActivityDTO[]
  projects: ProjectRef[]
  impact: Impact
  startedAt: string | null
  acknowledgedAt: string | null
  mitigatedAt: string | null
  /** Both SLA clocks as of the response; null when no project policy applies */
  sla: IncidentSla | null
}

export interface SimilarIncident {
  id: string
  title: string
  symptoms: string
  severity: Severity
  status: IncidentStatus
  affectedSystems: string[]
  department: Department
  createdBy: string
  createdAt: string
  recurringCount: number
  /** 1–99, how strongly this matches */
  similarity: number
  /** Which signal found it: shared keywords, similar meaning (embeddings), or both */
  matchedBy: 'keywords' | 'meaning' | 'both'
  sharedTerms: string[]
  sharedSystems: string[]
  solutions: Pick<SolutionDTO, 'id' | 'approach' | 'status' | 'timeToFix' | 'efficiency' | 'solvedBy'>[]
}

export interface CountRow {
  key: string
  count: number
}

export interface RecurringRow {
  id: string
  title: string
  severity: Severity
  status: IncidentStatus
  count: number
  avgMTTR: number | null
  lastOccurrence: string
}

export interface DashboardStats {
  totals: {
    all: number
    thisMonth: number
    lastMonth: number
    open: number
    openP1: number
  }
  avgMTTR: number | null
  /** % of incidents that are recurrences of an earlier one */
  recurringRate: number
  /** % of incidents resolved or closed */
  resolutionRate: number
  verifiedSolutions: number
  totalSolutions: number
  byStatus: CountRow[]
  bySeverity: CountRow[]
  bySystem: CountRow[]
  topRecurring: RecurringRow[]
  recent: IncidentRef[]
}

export interface TrendPoint {
  day: string
  incidents: number
  P1: number
  P2: number
  P3: number
  P4: number
  resolved: number
  avgMTTR: number | null
}

export interface TrendStats {
  days: number
  points: TrendPoint[]
  thisWeek: number
  lastWeek: number
}

export interface SystemStat {
  system: string
  incidents: number
  open: number
  recurring: number
  avgMTTR: number | null
}

export interface TeamStat {
  department: string
  incidents: number
  open: number
  avgMTTR: number | null
  topSolver: string | null
}

export interface TeamStats {
  teams: TeamStat[]
  topSolvers: { name: string; solutions: number; verified: number }[]
  heatmap: { department: string; system: string; count: number }[]
}

export interface SolutionEffectiveness {
  solutionId: string
  timesUsed: number
  worked: number
  failed: number
  pending: number
  /** % of recorded outcomes where the fix worked, null if none recorded */
  successRate: number | null
  originalMTTR: number | null
  avgMTTRWhenUsed: number | null
  /** originalMTTR - avgMTTRWhenUsed, in minutes */
  mttrImprovement: number | null
}

export interface NotificationDTO {
  id: string
  incidentId: string
  notificationType: string
  title: string
  readAt: string | null
  sentAt: string
}

export interface Person {
  name: string
  email: string
}

/* ---------- Projects & SLAs ---------- */

export interface ProjectRef {
  id: string
  name: string
}

export interface SlaPolicyDTO {
  severity: Severity
  responseMinutes: number
  resolveMinutes: number
}

/** A project lead. `active` is false once they are no longer an active member (they then get no SLA notices). */
export interface ProjectOwner {
  id: string
  name: string
  email: string
  active: boolean
}

/** An active member of the organization, as offered in the project lead picker. */
export interface OrgMemberOption {
  id: string
  name: string
  email: string
  role: string
}

export interface ProjectDTO extends ProjectRef {
  description: string | null
  owner: ProjectOwner | null
  criticality: Criticality
  availabilityTarget: number
  downtimeCostPerMinute: number
  archived: boolean
  slaPolicies: SlaPolicyDTO[]
  /** Incidents ever tagged with this project */
  incidentCount: number
}

export interface ProjectSlaRow extends ProjectRef {
  criticality: Criticality
  ownerName: string | null
  archived: boolean
  availabilityTarget: number
  /** Incidents tagged with the project and reported in the month */
  incidents: number
  outageMinutes: number
  degradedMinutes: number
  /** Percent of the month so far without an outage */
  availability: number
  targetMet: boolean
  /** Outage minutes the target allows this month so far, and how many of them are left (negative = over) */
  errorBudgetMinutes: number
  errorBudgetLeftMinutes: number
  slaMet: number
  slaBreached: number
  /** Met / (met + breached), percent; null with nothing settled yet */
  compliance: number | null
  downtimeCost: number
  /** Average report-to-resolve time of the month's resolved incidents */
  avgResolveMinutes: number | null
}

export interface SlaRiskRow {
  id: string
  title: string
  severity: Severity
  status: IncidentStatus
  projects: string[]
  /** The clock that is closest to (or past) its due time */
  clock: 'response' | 'resolve'
  state: SlaClockState
  dueAt: string
  remainingMinutes: number
}

export interface SlaReport {
  /** 'YYYY-MM', a calendar month in UTC */
  month: string
  from: string
  to: string
  /** Minutes of the month elapsed so far (the whole month once it is over) */
  periodMinutes: number
  generatedAt: string
  totals: {
    projects: number
    projectsMeetingTarget: number
    incidents: number
    slaMet: number
    slaBreached: number
    compliance: number | null
    outageMinutes: number
    downtimeCost: number
  }
  projects: ProjectSlaRow[]
  /** Open incidents at risk of breaching, or already breached, worst first */
  atRisk: SlaRiskRow[]
}
