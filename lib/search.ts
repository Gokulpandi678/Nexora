import { Prisma } from '@prisma/client'
import { orgSql, type OrgScope } from '@/lib/api'
import { prisma } from '@/lib/db'
import { embeddingConfig, toVectorLiteral } from '@/lib/embeddings'
import type { ListIncidentsQuery, SortOption } from '@/lib/validators'
import type { IncidentListItem, Paginated, SimilarIncident } from '@/lib/types'
import type { Department, IncidentStatus, Severity } from '@/lib/constants'

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'was', 'were', 'are', 'has', 'have', 'had',
  'not', 'but', 'when', 'what', 'into', 'our', 'out', 'its', 'after', 'during', 'then', 'than',
  'some', 'all', 'any', 'can', 'could', 'should', 'would', 'been', 'being', 'also', 'very', 'just'
])

/** Lowercase alphanumeric keywords, deduped, stopwords removed. Safe to splice into to_tsquery. */
export function extractTerms(text: string, max = 24, minLength = 3): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const terms: string[] = []
  for (const w of words) {
    if (w.length < minLength || STOPWORDS.has(w) || terms.includes(w)) continue
    terms.push(w)
    if (terms.length >= max) break
  }
  return terms
}

/** "db time" → "db:* & time:*" so results narrow as the user types. Null when nothing searchable. */
export function toPrefixQuery(q: string): string | null {
  const terms = extractTerms(q, 8, 2)
  return terms.length ? terms.map(t => `${t}:*`).join(' & ') : null
}

/* ---------- Paginated list / search ---------- */

const ORDER: Record<SortOption, Prisma.Sql> = {
  relevance: Prisma.sql`score DESC NULLS LAST, i."createdAt" DESC`,
  newest: Prisma.sql`i."createdAt" DESC`,
  oldest: Prisma.sql`i."createdAt" ASC`,
  mttr: Prisma.sql`i."actualMTTR" DESC NULLS LAST, i."createdAt" DESC`,
  severity: Prisma.sql`i."severity" ASC, i."createdAt" DESC`,
  recurring: Prisma.sql`i."recurringCount" DESC, i."createdAt" DESC`
}

const DAY_MS = 86_400_000

interface ListRow extends Omit<IncidentListItem, 'createdAt' | 'resolvedAt'> {
  createdAt: Date
  resolvedAt: Date | null
}

/**
 * One SQL round trip for the page plus one for the total, regardless of filters.
 * `to` is an inclusive calendar date. Only the scope's organization is listed.
 */
export async function listIncidents(query: ListIncidentsQuery, scope: OrgScope): Promise<Paginated<IncidentListItem>> {
  const tsquery = query.q ? toPrefixQuery(query.q) : null
  const conditions: Prisma.Sql[] = [Prisma.sql`i."deletedAt" IS NULL${orgSql(scope, 'i')}`]

  if (tsquery) conditions.push(Prisma.sql`i."searchVector" @@ to_tsquery('english', ${tsquery})`)
  if (query.status.length) conditions.push(Prisma.sql`i."status" IN (${Prisma.join(query.status)})`)
  if (query.severity.length) conditions.push(Prisma.sql`i."severity" IN (${Prisma.join(query.severity)})`)
  if (query.systems.length) conditions.push(Prisma.sql`i."affectedSystems" && ${query.systems}::text[]`)
  if (query.department) conditions.push(Prisma.sql`i."department" = ${query.department}`)
  if (query.from) conditions.push(Prisma.sql`i."createdAt" >= ${query.from}`)
  if (query.to) conditions.push(Prisma.sql`i."createdAt" < ${new Date(query.to.getTime() + DAY_MS)}`)
  if (query.recurring === true) conditions.push(Prisma.sql`(i."recurringCount" > 1 OR i."linkedToId" IS NOT NULL)`)
  if (query.recurring === false) conditions.push(Prisma.sql`(i."recurringCount" = 1 AND i."linkedToId" IS NULL)`)

  const where = Prisma.join(conditions, ' AND ')
  const sort: SortOption = query.sort ?? (tsquery ? 'relevance' : 'newest')
  const score = tsquery
    ? Prisma.sql`ts_rank(i."searchVector", to_tsquery('english', ${tsquery}), 32)`
    : Prisma.sql`NULL::float`
  const offset = (query.page - 1) * query.pageSize

  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<ListRow[]>`
      SELECT i."id", i."title", left(i."symptoms", 240) AS "symptoms", i."severity", i."status",
        i."affectedSystems", i."tags", i."department", i."createdBy", i."createdAt", i."resolvedAt",
        i."actualMTTR", i."recurringCount", i."linkedToId",
        (SELECT count(*)::int FROM "Solution" s WHERE s."incidentId" = i."id") AS "solutionCount",
        (SELECT count(*)::int FROM "Solution" s WHERE s."incidentId" = i."id" AND s."status" = 'VERIFIED') AS "verifiedSolutionCount",
        (SELECT count(*)::int FROM "Comment" c WHERE c."incidentId" = i."id") AS "commentCount",
        ${score}::float AS score
      FROM "Incident" i
      WHERE ${where}
      ORDER BY ${ORDER[sort]}
      LIMIT ${query.pageSize} OFFSET ${offset}
    `,
    prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM "Incident" i WHERE ${where}`
  ])

  const total = totals[0]?.total ?? 0
  return {
    items: rows.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      score: r.score === null ? null : Number(r.score)
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize))
  }
}

/* ---------- Similar-incident matching ---------- */

interface SimilarOptions {
  /** Only incidents of this organization are candidates */
  scope: OrgScope
  limit?: number
  /** Incidents never offered as a match (the incident itself, ones already linked) */
  excludeIds?: string[]
  systems?: string[]
  /** The probe's embedding (lib/embeddings.ts). Without it matching is keyword-only. */
  embedding?: number[] | null
}

interface RankedRow {
  id: string
  score: number
  hits: number
  shared: number
}

/**
 * Matches below this are hidden. Calibrated with __tests__/integration/matching.eval.test.ts:
 * wrong suggestions typically share 2–4 incidental words plus a system; true matches share far more.
 */
export const MIN_SIMILARITY = 50

/**
 * 1–99. Keyword coverage dominates; shared affected systems only top it up, because with a
 * small fixed list of systems, unrelated incidents often share one.
 */
export function similarityPercent(hits: number, termCount: number, shared: number, systemCount: number): number {
  const coverage = Math.min(1, hits / Math.max(1, Math.min(termCount, 10)))
  const overlap = systemCount ? Math.min(1, shared / systemCount) : 0
  return Math.max(1, Math.min(99, Math.round(100 * (0.85 * coverage + 0.15 * overlap))))
}

/**
 * Cosine similarity → 1–99 on the same scale as similarityPercent. Incident write-ups share a lot of
 * domain vocabulary, so even unrelated ones score ~0.4; the scale starts there. With these bounds a
 * cosine of ~0.66 plus one shared system crosses MIN_SIMILARITY. Re-tune them with the matching eval
 * if you change embedding model.
 */
export const SEMANTIC_BOUNDS = { floor: 0.4, ceiling: 0.85 } as const

export function semanticPercent(cosine: number, shared: number, systemCount: number): number {
  const span = SEMANTIC_BOUNDS.ceiling - SEMANTIC_BOUNDS.floor
  const closeness = Math.min(1, Math.max(0, (cosine - SEMANTIC_BOUNDS.floor) / span))
  const overlap = systemCount ? Math.min(1, shared / systemCount) : 0
  return Math.max(1, Math.min(99, Math.round(100 * (0.85 * closeness + 0.15 * overlap))))
}

interface CandidateOptions {
  scope: OrgScope
  limit: number
  exclude: string[]
}

/**
 * Keyword candidates: full-text relevance against any of the query's keywords (OR semantics, so
 * partial overlaps still surface), boosted by shared affected systems. A single incidental word hit
 * is noise, so a candidate needs 2+ distinct matching keywords, or 1 keyword plus a shared affected
 * system (PRD §3.2.B).
 */
async function keywordCandidates(terms: string[], systems: string[], { scope, limit, exclude }: CandidateOptions): Promise<RankedRow[]> {
  if (terms.length === 0) return []
  const tsquery = terms.join(' | ')
  const minHits = terms.length < 3 ? 1 : 2

  // Recurrences collapse onto their root: the root carries the fixes and the recurrence count.
  // Prepared statements switch to a generic plan after 5 runs, and a generic plan cannot estimate
  // full-text selectivity (5s+ at 100k rows instead of ~300ms), so force a custom plan.
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL plan_cache_mode = force_custom_plan`
    return tx.$queryRaw<RankedRow[]>`
    WITH q AS (SELECT to_tsquery('english', ${tsquery}) AS query),
    candidates AS (
      SELECT i."id", i."linkedToId", i."createdAt", i."searchVector", i."affectedSystems",
        ts_rank(i."searchVector", q.query) AS rank
      FROM "Incident" i, q
      WHERE i."searchVector" @@ q.query
        AND i."deletedAt" IS NULL${orgSql(scope, 'i')}
        AND i."id" <> ALL(${exclude}::text[])
      ORDER BY rank DESC
      LIMIT 200
    ),
    scored AS (
      SELECT coalesce(c."linkedToId", c."id") AS root, c.rank,
        (SELECT count(*)::int FROM unnest(${terms}::text[]) AS t(term)
          WHERE c."searchVector" @@ plainto_tsquery('english', t.term)) AS hits,
        cardinality(ARRAY(SELECT unnest(c."affectedSystems") INTERSECT SELECT unnest(${systems}::text[])))::int AS shared
      FROM candidates c
    ),
    per_root AS (
      SELECT DISTINCT ON (root) root AS "id", (rank + 0.05 * hits + 0.15 * shared)::float AS score, hits, shared
      FROM scored
      WHERE hits >= ${minHits} OR (hits >= 1 AND shared > 0)
      ORDER BY root, (rank + 0.05 * hits + 0.15 * shared) DESC
    )
    SELECT r."id", r.score, r.hits, r.shared
    FROM per_root r JOIN "Incident" i ON i."id" = r."id" AND i."deletedAt" IS NULL
    WHERE r."id" <> ALL(${exclude}::text[])
    ORDER BY r.score DESC, i."createdAt" DESC
    LIMIT ${limit * 3}
  `
  })
}

/**
 * Meaning candidates: nearest incidents by cosine distance between embeddings, collapsed onto the
 * chain root. An exact scan within one organization; add an HNSW index if one organization grows
 * past ~50k incidents.
 */
async function semanticCandidates(embedding: number[], { scope, limit, exclude }: CandidateOptions): Promise<{ id: string; cosine: number }[]> {
  const model = embeddingConfig()?.model
  if (!model) return []
  return prisma.$queryRaw<{ id: string; cosine: number }[]>`
    WITH nearest AS (
      SELECT coalesce(i."linkedToId", i."id") AS root,
        1 - (i."embedding" <=> ${toVectorLiteral(embedding)}::vector) AS cosine
      FROM "Incident" i
      WHERE i."embedding" IS NOT NULL AND i."embeddingModel" = ${model}
        AND i."deletedAt" IS NULL${orgSql(scope, 'i')}
        AND i."id" <> ALL(${exclude}::text[])
    )
    SELECT n.root AS "id", max(n.cosine)::float AS cosine
    FROM nearest n JOIN "Incident" r ON r."id" = n.root AND r."deletedAt" IS NULL
    WHERE n.root <> ALL(${exclude}::text[])
    GROUP BY n.root
    ORDER BY cosine DESC
    LIMIT ${limit * 3}
  `
}

/**
 * Past incidents of the same organization similar to `query`, ranked by the stronger of keyword
 * overlap and meaning (embeddings, when configured). Each result says which signal found it.
 */
export async function findSimilarIncidents(
  query: string,
  { scope, limit = 5, excludeIds = [], systems = [], embedding = null }: SimilarOptions
): Promise<SimilarIncident[]> {
  const terms = extractTerms(query)
  if (terms.length === 0 && !embedding) return []
  const options = { scope, limit, exclude: excludeIds.length ? excludeIds : [''] }

  const [keyword, semantic] = await Promise.all([
    keywordCandidates(terms, systems, options),
    embedding ? semanticCandidates(embedding, options) : Promise.resolve([])
  ])
  if (keyword.length === 0 && semantic.length === 0) return []

  const keywordById = new Map(keyword.map(r => [r.id, r]))
  const cosineById = new Map(semantic.map(r => [r.id, Number(r.cosine)]))

  const incidents = await prisma.incident.findMany({
    where: { id: { in: [...new Set([...keywordById.keys(), ...cosineById.keys()])] } },
    select: {
      id: true, title: true, description: true, symptoms: true, severity: true, status: true,
      affectedSystems: true, department: true, createdBy: true, createdAt: true, recurringCount: true,
      solutions: {
        where: { status: { not: 'DEPRECATED' } },
        orderBy: [{ status: 'desc' }, { solvedAt: 'desc' }],
        select: { id: true, approach: true, status: true, timeToFix: true, efficiency: true, solvedBy: true }
      }
    }
  })

  const results = incidents.flatMap(incident => {
    const sharedSystems = incident.affectedSystems.filter(s => systems.includes(s))
    const kw = keywordById.get(incident.id)
    const cosine = cosineById.get(incident.id)
    const byKeywords = kw ? similarityPercent(kw.hits, terms.length, kw.shared, systems.length) : 0
    const byMeaning = cosine === undefined ? 0 : semanticPercent(cosine, sharedSystems.length, systems.length)
    const similarity = Math.max(byKeywords, byMeaning)
    if (similarity < MIN_SIMILARITY) return []

    const matchedBy: SimilarIncident['matchedBy'] =
      byKeywords >= MIN_SIMILARITY && byMeaning >= MIN_SIMILARITY ? 'both' : byMeaning > byKeywords ? 'meaning' : 'keywords'
    const haystack = new Set(extractTerms(`${incident.title} ${incident.description} ${incident.symptoms}`, 500))
    const { description: _description, ...rest } = incident
    const match: SimilarIncident = {
      ...rest,
      severity: incident.severity as Severity,
      status: incident.status as IncidentStatus,
      department: incident.department as Department,
      symptoms: incident.symptoms.slice(0, 400),
      createdAt: incident.createdAt.toISOString(),
      similarity,
      matchedBy,
      sharedTerms: terms.filter(t => haystack.has(t)).slice(0, 6),
      sharedSystems,
      solutions: incident.solutions.map(s => ({
        ...s,
        status: s.status as SimilarIncident['solutions'][number]['status'],
        efficiency: s.efficiency as SimilarIncident['solutions'][number]['efficiency']
      }))
    }
    return [{ match, rank: kw?.score ?? 0 }]
  })

  // Strongest first; ties keep full-text rank, then recency
  return results
    .sort((a, b) => b.match.similarity - a.match.similarity || b.rank - a.rank || b.match.createdAt.localeCompare(a.match.createdAt))
    .slice(0, limit)
    .map(r => r.match)
}

/** Title and symptoms carry the strongest signal, so they lead the query. */
export const matchQueryFor = (incident: { title: string; symptoms: string; description: string }): string =>
  `${incident.title} ${incident.symptoms} ${incident.description}`
