export const SYSTEM_OPTIONS = [
  'Database', 'API', 'Cache', 'Network', 'Auth', 'Storage', 'Queue', 'Frontend', 'Payments', 'Email', 'Other'
] as const
export const SEVERITIES = ['P1', 'P2', 'P3', 'P4'] as const
export const STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'] as const
export const EFFICIENCIES = ['HIGH', 'MEDIUM', 'LOW'] as const
export const SOLUTION_STATUSES = ['UNVERIFIED', 'VERIFIED', 'DEPRECATED'] as const
export const MATCH_TYPES = ['SAME', 'SIMILAR', 'DERIVED'] as const
export const LINK_OUTCOMES = ['RESOLVED', 'RETRY_NEEDED', 'DIFFERENT_APPROACH_NEEDED'] as const
export const ROLES = ['VIEWER', 'REPORTER', 'VERIFIER', 'ADMIN'] as const
export const DEPARTMENTS = [
  'Engineering', 'Platform', 'SRE', 'Data', 'Security', 'IT', 'Support', 'Product', 'Unassigned'
] as const

export type SystemName = (typeof SYSTEM_OPTIONS)[number]
export type Severity = (typeof SEVERITIES)[number]
export type IncidentStatus = (typeof STATUSES)[number]
export type Efficiency = (typeof EFFICIENCIES)[number]
export type SolutionStatus = (typeof SOLUTION_STATUSES)[number]
export type MatchType = (typeof MATCH_TYPES)[number]
export type LinkOutcome = (typeof LINK_OUTCOMES)[number]
export type Role = (typeof ROLES)[number]
export type Department = (typeof DEPARTMENTS)[number]

/** Field limits from PRD §6.1. Kept in one place so the form and the API always agree. */
export const LIMITS = {
  title: { min: 50, max: 255 },
  description: { min: 100, max: 5000 },
  symptoms: { min: 50, max: 2000 },
  initialFixes: { max: 2000 },
  comment: { min: 1, max: 5000 },
  solutionText: { min: 10, max: 5000 },
  name: { max: 120 }
} as const

export const PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

export const SEVERITY_LABEL: Record<Severity, string> = {
  P1: 'P1 · Critical',
  P2: 'P2 · High',
  P3: 'P3 · Medium',
  P4: 'P4 · Low'
}

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  OPEN: 'Open',
  INVESTIGATING: 'Investigating',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed'
}

export const EFFICIENCY_LABEL: Record<Efficiency, string> = {
  HIGH: 'Permanent fix',
  MEDIUM: 'Partial fix',
  LOW: 'Workaround'
}

export const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  SAME: 'Same issue',
  SIMILAR: 'Similar, different approach',
  DERIVED: 'Caused by'
}

export const ROLE_LABEL: Record<Role, string> = {
  VIEWER: 'Viewer',
  REPORTER: 'Reporter',
  VERIFIER: 'QA verifier',
  ADMIN: 'Admin'
}

export const QA_CHECKLIST = [
  { id: 'root-cause-confirmed', label: 'Root cause confirmed, not just symptoms suppressed' },
  { id: 'fix-verified', label: 'Fix verified in staging or test' },
  { id: 'monitoring', label: 'Monitoring added to catch a recurrence' },
  { id: 'rollback', label: 'Rollback plan documented' },
  { id: 'documented', label: 'Solution documented so someone else can repeat it' }
] as const

export const QA_CHECK_IDS = QA_CHECKLIST.map(c => c.id)

export const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value)

/* ---------- Accounts & organizations ---------- */

export const MEMBERSHIP_STATUSES = ['PENDING', 'ACTIVE', 'REJECTED'] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

export const ORG_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const
export type OrgSize = (typeof ORG_SIZES)[number]

/** Days an organization invitation link stays valid. */
export const INVITE_TTL_DAYS = 7

/**
 * Position = who someone is in the organization (separate from their access `Role`, which is what they
 * can do in Nexora). Set per organization, since one person can hold different positions in each.
 */
export const POSITIONS = ['CXO', 'DIRECTOR', 'MANAGER', 'PMO', 'TEAM_LEAD', 'TEAM_MEMBER', 'INTERN', 'CONTRACTOR'] as const
export type Position = (typeof POSITIONS)[number]

export const POSITION_LABEL: Record<Position, string> = {
  CXO: 'CxO / Executive',
  DIRECTOR: 'Director / VP',
  MANAGER: 'Manager',
  PMO: 'PMO / Project manager',
  TEAM_LEAD: 'Team lead',
  TEAM_MEMBER: 'Team member',
  INTERN: 'Intern / Trainee',
  CONTRACTOR: 'Consultant / Contractor'
}

/** Suggested access when an admin picks a position for someone new. Always editable. */
export const POSITION_DEFAULT_ROLE: Record<Position, Role> = {
  CXO: 'VIEWER',
  DIRECTOR: 'VIEWER',
  MANAGER: 'VERIFIER',
  PMO: 'VIEWER',
  TEAM_LEAD: 'VERIFIER',
  TEAM_MEMBER: 'REPORTER',
  INTERN: 'REPORTER',
  CONTRACTOR: 'REPORTER'
}

/** Short descriptions of access levels, shown next to the access picker. */
export const ROLE_HINT: Record<Role, string> = {
  VIEWER: 'Read-only: sees incidents and analytics',
  REPORTER: 'Reports incidents, adds fixes and comments',
  VERIFIER: 'Reporter, plus QA-verifies fixes',
  ADMIN: 'Everything, plus manages members and settings'
}
