import { z } from 'zod'
import {
  DEPARTMENTS, EFFICIENCIES, LIMITS, LINK_OUTCOMES, MATCH_TYPES, MAX_PAGE_SIZE, PAGE_SIZE, QA_CHECK_IDS,
  ORG_SIZES, POSITIONS, ROLES, SEVERITIES, SOLUTION_STATUSES, STATUSES, SYSTEM_OPTIONS
} from '@/lib/constants'

const text = (label: string, min: number, max: number) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(min, min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`)

const id = z.string().trim().min(1).max(64)
const email = z.string().trim().toLowerCase().email('Enter a valid email').max(320)
const name = (label: string) => text(label, 1, LIMITS.name.max)
const uniqueList = <T extends z.ZodTypeAny>(item: T) => z.array(item).transform(list => [...new Set(list)])

/* ---------- Incidents ---------- */

export const createIncidentSchema = z.object({
  title: text('Title', LIMITS.title.min, LIMITS.title.max),
  description: text('Description', LIMITS.description.min, LIMITS.description.max),
  symptoms: text('Symptoms', LIMITS.symptoms.min, LIMITS.symptoms.max),
  initialFixes: z.string().trim().max(LIMITS.initialFixes.max).nullish().transform(v => v || undefined),
  affectedSystems: uniqueList(z.enum(SYSTEM_OPTIONS)).refine(l => l.length > 0, 'Pick at least one affected system'),
  severity: z.enum(SEVERITIES),
  department: z.enum(DEPARTMENTS),
  estimatedMTTR: z.number().int().min(0).max(525_600).nullish().transform(v => v ?? undefined),
  tags: uniqueList(z.string().trim().toLowerCase().min(1).max(40)).pipe(z.array(z.string()).max(10)).optional(),
  createdBy: name('Reporter name'),
  email
})
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>

export const updateIncidentSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    severity: z.enum(SEVERITIES).optional(),
    department: z.enum(DEPARTMENTS).optional(),
    tags: uniqueList(z.string().trim().toLowerCase().min(1).max(40)).pipe(z.array(z.string()).max(10)).optional()
  })
  .refine(v => Object.values(v).some(x => x !== undefined), 'Nothing to update')
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>

/** Query-string arrays accept both `?status=OPEN&status=RESOLVED` and `?status=OPEN,RESOLVED`. */
const csv = <T extends [string, ...string[]]>(values: T) =>
  z
    .array(z.string())
    .transform(list => list.flatMap(v => v.split(',')).map(v => v.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)))

export const SORT_OPTIONS = ['relevance', 'newest', 'oldest', 'mttr', 'severity', 'recurring'] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

export const listIncidentsSchema = z.object({
  q: z.string().trim().max(200).optional().transform(v => v || undefined),
  status: csv([...STATUSES]).default([]),
  severity: csv([...SEVERITIES]).default([]),
  systems: csv([...SYSTEM_OPTIONS]).default([]),
  department: z.enum(DEPARTMENTS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  recurring: z.enum(['true', 'false']).optional().transform(v => (v === undefined ? undefined : v === 'true')),
  sort: z.enum(SORT_OPTIONS).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(PAGE_SIZE)
})
export type ListIncidentsQuery = z.infer<typeof listIncidentsSchema>

/** Turns URLSearchParams into the plain object shape the list schema expects. */
export function searchParamsToObject(params: URLSearchParams): Record<string, string | string[]> {
  const arrays = new Set(['status', 'severity', 'systems'])
  const out: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    out[key] = arrays.has(key) ? params.getAll(key) : (params.get(key) ?? '')
  }
  return out
}

/* ---------- Solutions ---------- */

export const createSolutionSchema = z.object({
  rootCause: text('Root cause', LIMITS.solutionText.min, LIMITS.solutionText.max),
  approach: text('Approach', LIMITS.solutionText.min, LIMITS.solutionText.max),
  useCaseNotes: text('When to use it', LIMITS.solutionText.min, LIMITS.solutionText.max),
  timeToFix: z.number({ invalid_type_error: 'Time to fix must be a number' }).int().min(0).max(525_600),
  efficiency: z.enum(EFFICIENCIES),
  qaChecks: uniqueList(z.enum(QA_CHECK_IDS as [string, ...string[]])),
  preventionRules: z.string().trim().max(5000).nullish().transform(v => v || undefined),
  monitoring: z.string().trim().max(5000).nullish().transform(v => v || undefined),
  /** Also move the incident to RESOLVED */
  resolve: z.boolean().default(true)
})
export type CreateSolutionInput = z.infer<typeof createSolutionSchema>

export const verifySolutionSchema = z.object({
  status: z.enum(SOLUTION_STATUSES).default('VERIFIED')
})

/* ---------- Links ---------- */

export const createLinkSchema = z.object({
  originalIncidentId: id,
  matchType: z.enum(MATCH_TYPES).default('SAME'),
  solutionUsed: id.nullish().transform(v => v ?? undefined),
  notes: z.string().trim().max(2000).nullish().transform(v => v || undefined)
})
export type CreateLinkInput = z.infer<typeof createLinkSchema>

export const updateLinkSchema = z.object({
  didSolutionWork: z.boolean(),
  outcome: z.enum(LINK_OUTCOMES).optional()
})

/* ---------- Comments ---------- */

export const createCommentSchema = z.object({
  content: text('Comment', LIMITS.comment.min, LIMITS.comment.max),
  parentId: id.nullish().transform(v => v ?? undefined),
  mentions: uniqueList(email).pipe(z.array(z.string()).max(10)).default([])
})
export type CreateCommentInput = z.infer<typeof createCommentSchema>

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(PAGE_SIZE)
})

/* ---------- Identity ---------- */

export const actorSchema = z.object({
  name: name('Name'),
  email,
  department: z.enum(DEPARTMENTS).catch('Unassigned'),
  role: z.enum(ROLES).catch('REPORTER')
})

export const trendsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30)
})

/* ---------- Accounts & organizations ---------- */

const optionalText = (max: number) =>
  z.string().trim().max(max, `Must be at most ${max} characters`).nullish().transform(v => v || null)

export const profileSchema = z.object({
  name: name('Name'),
  jobTitle: text('Job title', 1, 120),
  department: z.enum(DEPARTMENTS, { errorMap: () => ({ message: 'Choose a department' }) }),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+\d\s().-]*$/, 'Enter a valid phone number')
    .nullish()
    .transform(v => v || null),
  bio: optionalText(1000)
})
export type ProfileInput = z.infer<typeof profileSchema>

export const organizationDetailsSchema = z.object({
  name: text('Organization name', 2, 120),
  industry: optionalText(80),
  size: z.enum(ORG_SIZES).nullish().transform(v => v ?? null),
  website: z
    .string()
    .trim()
    .max(255)
    .nullish()
    .transform(v => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null))
    .pipe(z.string().url('Enter a valid website').nullable()),
  description: optionalText(2000)
})
export type OrganizationDetailsInput = z.infer<typeof organizationDetailsSchema>

/** PATCH /api/organizations/:id — edit details (org admin or superadmin), or suspend / reactivate (superadmin). */
export const organizationActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update'), details: organizationDetailsSchema }),
  z.object({ action: z.literal('suspend'), reason: text('Reason', 5, 500) }),
  z.object({ action: z.literal('reactivate') })
])
export type OrganizationAction = z.infer<typeof organizationActionSchema>

export const createInvitationSchema = z.object({
  email,
  organizationName: text('Organization name', 2, 120)
})

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(20).max(200),
  profile: profileSchema,
  organization: organizationDetailsSchema
})

export const joinRequestSchema = z.object({
  organizationId: id,
  message: optionalText(500)
})

export const membershipUpdateSchema = z
  .object({
    status: z.enum(['ACTIVE', 'REJECTED']).optional(),
    role: z.enum(ROLES).optional(),
    /** null clears it */
    position: z.enum(POSITIONS).nullable().optional()
  })
  .refine(v => v.status !== undefined || v.role !== undefined || v.position !== undefined, 'Nothing to update')

/** An org admin invites someone (by email) to join their organization with this access and position. */
export const memberInviteSchema = z.object({
  email,
  role: z.enum(ROLES).default('REPORTER'),
  position: z.enum(POSITIONS).nullish().transform(v => v ?? null)
})
