import { describe, expect, it } from 'vitest'
import { HttpError, parseWith } from '@/lib/api'
import {
  createCommentSchema, createIncidentSchema, createLinkSchema, createSolutionSchema, listIncidentsSchema,
  paginationSchema, searchParamsToObject, trendsQuerySchema, updateIncidentSchema, updateLinkSchema
} from '@/lib/validators'
import { incidentInput } from '../setup/helpers'

function validationErrorOf(fn: () => unknown): HttpError {
  try {
    fn()
  } catch (error) {
    if (error instanceof HttpError) return error
    throw error
  }
  throw new Error('expected a validation error')
}

const fieldErrorsOf = (fn: () => unknown): Record<string, string[]> => validationErrorOf(fn).details ?? {}

describe('createIncidentSchema', () => {
  it('accepts a valid payload and normalises it', () => {
    const parsed = createIncidentSchema.parse({
      ...incidentInput(),
      email: '  Rita@Example.COM ',
      affectedSystems: ['API', 'API', 'Database'],
      tags: ['DB', 'db', ' Pool ']
    })
    expect(parsed.email).toBe('rita@example.com')
    expect(parsed.affectedSystems).toEqual(['API', 'Database'])
    expect(parsed.tags).toEqual(['db', 'pool'])
  })

  it('turns null / empty optionals into undefined', () => {
    const parsed = createIncidentSchema.parse({ ...incidentInput(), initialFixes: null, estimatedMTTR: null })
    expect(parsed.initialFixes).toBeUndefined()
    expect(parsed.estimatedMTTR).toBeUndefined()
    expect(createIncidentSchema.parse({ ...incidentInput(), initialFixes: '   ' }).initialFixes).toBeUndefined()
  })

  it('reports field errors for PRD length limits', () => {
    const errors = fieldErrorsOf(() =>
      parseWith(createIncidentSchema, { ...incidentInput(), title: 'Too short', description: 'short', symptoms: 'x' })
    )
    expect(errors.title).toEqual(['Title must be at least 50 characters'])
    expect(errors.description?.[0]).toMatch(/at least 100/)
    expect(errors.symptoms?.[0]).toMatch(/at least 50/)
  })

  it('counts length after trimming whitespace', () => {
    const padded = `   ${'a'.repeat(49)}   `
    expect(createIncidentSchema.safeParse({ ...incidentInput(), title: padded }).success).toBe(false)
  })

  it('rejects empty systems, unknown enums and bad email', () => {
    const errors = fieldErrorsOf(() =>
      parseWith(createIncidentSchema, {
        ...incidentInput(), affectedSystems: [], severity: 'P9', department: 'Nope', email: 'not-an-email'
      })
    )
    expect(errors.affectedSystems).toEqual(['Pick at least one affected system'])
    expect(errors.severity).toBeDefined()
    expect(errors.department).toBeDefined()
    expect(errors.email).toEqual(['Enter a valid email'])
  })

  it('caps tags at 10 after de-duplication', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `t${i}`)
    expect(createIncidentSchema.safeParse({ ...incidentInput(), tags }).success).toBe(false)
    expect(createIncidentSchema.safeParse({ ...incidentInput(), tags: [...tags.slice(0, 10), 'T0'] }).success).toBe(true)
  })

  it('uses "<Field> is required" as the message for a missing field', () => {
    const { title: _title, ...rest } = incidentInput()
    const error = validationErrorOf(() => parseWith(createIncidentSchema, rest))
    expect(error.status).toBe(400)
    expect(error.message).toBe('Title is required')
  })
})

describe('updateIncidentSchema', () => {
  it('requires at least one change', () => {
    expect(updateIncidentSchema.safeParse({}).success).toBe(false)
    expect(updateIncidentSchema.safeParse({ status: 'RESOLVED' }).success).toBe(true)
  })
})

describe('listIncidentsSchema + searchParamsToObject', () => {
  const parse = (qs: string) => listIncidentsSchema.parse(searchParamsToObject(new URLSearchParams(qs)))
  const accepts = (qs: string): boolean => listIncidentsSchema.safeParse(searchParamsToObject(new URLSearchParams(qs))).success

  it('accepts repeated and comma-separated array params', () => {
    expect(parse('status=OPEN&status=RESOLVED').status).toEqual(['OPEN', 'RESOLVED'])
    expect(parse('status=OPEN,RESOLVED').status).toEqual(['OPEN', 'RESOLVED'])
    expect(parse('severity=P1, P2,').severity).toEqual(['P1', 'P2'])
    expect(parse('systems=API,Cache&systems=Auth').systems).toEqual(['API', 'Cache', 'Auth'])
  })

  it('applies defaults', () => {
    const q = parse('')
    expect(q).toMatchObject({ status: [], severity: [], systems: [], page: 1, pageSize: 20 })
    expect(q.q).toBeUndefined()
    expect(q.recurring).toBeUndefined()
    expect(q.sort).toBeUndefined()
  })

  it('coerces page, dates and recurring; blank q becomes undefined', () => {
    const q = parse('page=3&pageSize=5&from=2024-01-01&to=2024-01-31&recurring=false&q=%20%20')
    expect(q.page).toBe(3)
    expect(q.pageSize).toBe(5)
    expect(q.from?.toISOString()).toBe('2024-01-01T00:00:00.000Z')
    expect(q.to?.toISOString()).toBe('2024-01-31T00:00:00.000Z')
    expect(q.recurring).toBe(false)
    expect(q.q).toBeUndefined()
    expect(parse('recurring=true').recurring).toBe(true)
  })

  it('rejects unknown enum values and out-of-range pages', () => {
    expect(accepts('status=BROKEN')).toBe(false)
    expect(accepts('status=OPEN,BROKEN')).toBe(false)
    expect(accepts('pageSize=101')).toBe(false)
    expect(accepts('page=0')).toBe(false)
    expect(accepts('sort=random')).toBe(false)
    expect(accepts('recurring=yes')).toBe(false)
    expect(accepts('from=not-a-date')).toBe(false)
  })
})

describe('createSolutionSchema', () => {
  const valid = {
    rootCause: 'Leaked connections in the retry path',
    approach: 'Release connections in finally blocks',
    useCaseNotes: 'Use when the pool is pinned at max',
    timeToFix: 45,
    efficiency: 'HIGH',
    qaChecks: ['fix-verified', 'fix-verified', 'monitoring']
  }

  it('defaults resolve to true and de-duplicates QA checks', () => {
    const parsed = createSolutionSchema.parse(valid)
    expect(parsed.resolve).toBe(true)
    expect(parsed.qaChecks).toEqual(['fix-verified', 'monitoring'])
    expect(parsed.preventionRules).toBeUndefined()
  })

  it('treats null and empty optional text as undefined', () => {
    const parsed = createSolutionSchema.parse({ ...valid, preventionRules: null, monitoring: '' })
    expect(parsed.preventionRules).toBeUndefined()
    expect(parsed.monitoring).toBeUndefined()
  })

  it('rejects unknown QA checks, short text and non-numeric time', () => {
    const errors = fieldErrorsOf(() =>
      parseWith(createSolutionSchema, { ...valid, qaChecks: ['made-up'], rootCause: 'short', timeToFix: '45' })
    )
    expect(errors.qaChecks).toBeDefined()
    expect(errors.rootCause?.[0]).toMatch(/at least 10/)
    expect(errors.timeToFix).toEqual(['Time to fix must be a number'])
  })
})

describe('link schemas', () => {
  it('defaults matchType to SAME and nullish optionals to undefined', () => {
    const parsed = createLinkSchema.parse({ originalIncidentId: 'abc', solutionUsed: null, notes: null })
    expect(parsed).toEqual({ originalIncidentId: 'abc', matchType: 'SAME', solutionUsed: undefined, notes: undefined })
  })

  it('rejects an empty original id and an unknown match type', () => {
    expect(createLinkSchema.safeParse({ originalIncidentId: '  ' }).success).toBe(false)
    expect(createLinkSchema.safeParse({ originalIncidentId: 'abc', matchType: 'MAYBE' }).success).toBe(false)
  })

  it('requires didSolutionWork on update', () => {
    expect(updateLinkSchema.safeParse({}).success).toBe(false)
    expect(updateLinkSchema.parse({ didSolutionWork: false })).toEqual({ didSolutionWork: false })
    expect(updateLinkSchema.safeParse({ didSolutionWork: true, outcome: 'MAYBE' }).success).toBe(false)
  })
})

describe('createCommentSchema', () => {
  it('normalises mentions and defaults them to []', () => {
    expect(createCommentSchema.parse({ content: 'hi' }).mentions).toEqual([])
    const parsed = createCommentSchema.parse({ content: ' hi ', parentId: null, mentions: ['A@x.com', 'a@x.com'] })
    expect(parsed).toEqual({ content: 'hi', parentId: undefined, mentions: ['a@x.com'] })
  })

  it('rejects blank content and invalid mention emails', () => {
    const errors = fieldErrorsOf(() => parseWith(createCommentSchema, { content: '   ', mentions: ['nope'] }))
    expect(errors.content).toEqual(['Comment is required'])
    expect(errors.mentions).toBeDefined()
  })
})

describe('pagination and trends', () => {
  it('coerces strings, applies defaults and enforces bounds', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 20 })
    expect(paginationSchema.parse({ page: '2', pageSize: '5' })).toEqual({ page: 2, pageSize: 5 })
    expect(trendsQuerySchema.parse({})).toEqual({ days: 30 })
    expect(trendsQuerySchema.safeParse({ days: '3' }).success).toBe(false)
    expect(trendsQuerySchema.safeParse({ days: '366' }).success).toBe(false)
  })
})
