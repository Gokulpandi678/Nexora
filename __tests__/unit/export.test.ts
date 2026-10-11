import { describe, expect, it } from 'vitest'
import { describeFilters, incidentsCsv, incidentsPdf, summarize } from '@/lib/export'
import type { IncidentListItem } from '@/lib/types'
import { listIncidentsSchema, searchParamsToObject } from '@/lib/validators'

function item(overrides: Partial<IncidentListItem> = {}): IncidentListItem {
  return {
    id: 'inc_1',
    title: 'Checkout API returns 504 when the database connection pool is exhausted',
    symptoms: 'HTTP 504',
    severity: 'P1',
    status: 'RESOLVED',
    affectedSystems: ['Database', 'API'],
    tags: [],
    department: 'SRE',
    createdBy: 'Rita Reporter',
    createdAt: '2026-10-01T10:00:00.000Z',
    resolvedAt: '2026-10-01T11:30:00.000Z',
    actualMTTR: 90,
    recurringCount: 3,
    linkedToId: null,
    solutionCount: 2,
    verifiedSolutionCount: 1,
    commentCount: 0,
    score: null,
    ...overrides
  }
}

describe('incidentsCsv', () => {
  it('starts with a BOM and header, joins systems, and defuses formula injection', () => {
    const csv = incidentsCsv([item({ title: '=HYPERLINK("x")' })])
    expect(csv.startsWith('﻿id,title,severity')).toBe(true)
    expect(csv).toContain('Database; API')
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})

describe('summarize', () => {
  it('counts open, resolved, P1, recurring and averages MTTR over resolved rows', () => {
    const rows = summarize([
      item(),
      item({ id: '2', status: 'OPEN', severity: 'P3', actualMTTR: null, recurringCount: 1 }),
      item({ id: '3', status: 'CLOSED', severity: 'P2', actualMTTR: 30, recurringCount: 1, linkedToId: 'inc_1' })
    ])
    expect(Object.fromEntries(rows.map(r => [r.label, r.value]))).toEqual({
      Incidents: '3', Open: '1', 'Resolved / closed': '2', 'P1 critical': '1', Recurring: '2', 'Avg time to fix': '1h'
    })
  })
})

describe('describeFilters', () => {
  it('summarises active filters in plain words', () => {
    const query = listIncidentsSchema.parse(searchParamsToObject(new URLSearchParams('q=redis&status=OPEN&severity=P1,P2&recurring=true')))
    expect(describeFilters(query)).toBe('Search: "redis" · Status: Open · Severity: P1, P2 · Recurring only')
    expect(describeFilters(listIncidentsSchema.parse({}))).toBe('All incidents')
  })
})

describe('incidentsPdf', () => {
  const meta = { organizationName: 'Acme', generatedBy: 'Rita', generatedAt: new Date('2026-10-10T09:00:00Z'), filters: 'All incidents', total: 1 }

  it('renders a PDF document', async () => {
    const pdf = await incidentsPdf([item()], meta)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(1000)
  })

  it('paginates long reports instead of overflowing', async () => {
    const many = Array.from({ length: 120 }, (_, n) => item({ id: `inc_${n}` }))
    const pdf = await incidentsPdf(many, { ...meta, total: 120 })
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0
    expect(pages).toBeGreaterThan(2)
  })

  it('handles an empty result', async () => {
    const pdf = await incidentsPdf([], { ...meta, total: 0 })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
