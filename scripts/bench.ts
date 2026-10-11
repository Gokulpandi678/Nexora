/**
 * Query-level latency benchmark for the hot API paths (no HTTP overhead).
 *
 *   DATABASE_URL=… npx tsx scripts/bench.ts [iterations]
 *
 * Seed a large dataset first: `npm run db:seed -- --scale 100000`. Queries run scoped to the
 * sample incident's organization, as they do in the app.
 */
import type { OrgScope } from '@/lib/api'
import { prisma } from '@/lib/db'
import { getIncidentWithDetails } from '@/lib/incidents'
import { findSimilarIncidents, listIncidents, matchQueryFor } from '@/lib/search'
import { getDashboardStats, getSystemStats, getTeamStats, getTrends } from '@/lib/stats'
import { listIncidentsSchema } from '@/lib/validators'

const iterations = Number(process.argv[2] ?? 20)

async function time(name: string, fn: () => Promise<unknown>): Promise<void> {
  await fn() // warm-up
  const samples: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn()
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  const at = (p: number): string => (samples[Math.min(samples.length - 1, Math.floor(p * samples.length))] ?? 0).toFixed(1)
  console.log(`${name.padEnd(34)} p50 ${at(0.5).padStart(7)}ms   p95 ${at(0.95).padStart(7)}ms`)
}

async function main(): Promise<void> {
  const total = await prisma.incident.count()
  const sample = await prisma.incident.findFirst({ where: { recurringCount: { gt: 1 } } })
  if (!sample) throw new Error('Seed the database first')
  console.log(`${total.toLocaleString()} incidents, ${iterations} iterations each\n`)
  const scope: OrgScope = { organizationId: sample.organizationId }

  const q = (params: Record<string, unknown>) => listIncidentsSchema.parse(params)
  await time('list page 1 (newest)', () => listIncidents(q({}), scope))
  await time('list page 200', () => listIncidents(q({ page: 200 }), scope))
  await time('list filtered (status+sev+system)', () => listIncidents(q({ status: ['OPEN'], severity: ['P1', 'P2'], systems: ['Database'] }), scope))
  await time('search "connection pool"', () => listIncidents(q({ q: 'connection pool' }), scope))
  await time('search "redis evict" + filters', () => listIncidents(q({ q: 'redis evict', status: ['RESOLVED'], sort: 'mttr' }), scope))
  await time('similar incidents (create flow)', () => findSimilarIncidents(matchQueryFor(sample), { scope, systems: sample.affectedSystems, excludeIds: [sample.id] }))
  await time('incident detail', () => getIncidentWithDetails(sample.id, scope))
  await time('stats: dashboard', () => getDashboardStats(scope))
  await time('stats: trends 30d', () => getTrends(30, scope))
  await time('stats: systems', () => getSystemStats(scope))
  await time('stats: teams', () => getTeamStats(scope))
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
