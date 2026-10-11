/**
 * Seeds realistic demo data.
 *
 *   npm run db:seed                  # adds ~45 incidents with chains, solutions, comments
 *   npm run db:seed -- --reset       # wipes all tables first (local databases only)
 *   npm run db:seed -- --scale 50000 # adds N extra synthetic incidents for load testing
 *
 * --reset refuses to run against a non-local database unless SEED_ALLOW_REMOTE=1.
 */
import { PrismaClient, type Prisma } from '@prisma/client'
import { SCENARIOS, type Scenario } from './scenarios'

const prisma = new PrismaClient()
const args = process.argv.slice(2)
const reset = args.includes('--reset')
const scaleIndex = args.indexOf('--scale')
const scale = scaleIndex >= 0 ? Number(args[scaleIndex + 1] ?? 0) : 0

const DAY = 86_400_000
const now = Date.now()

/** Deterministic PRNG so every seed run produces the same data. */
let seed = 42
function rand(): number {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31
  return seed / 2 ** 31
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T
const between = (min: number, max: number): number => Math.round(min + rand() * (max - min))

const PEOPLE = [
  { name: 'Priya Raman', email: 'priya.raman@example.com', department: 'SRE' },
  { name: 'Marcus Webb', email: 'marcus.webb@example.com', department: 'Platform' },
  { name: 'Aiko Tanaka', email: 'aiko.tanaka@example.com', department: 'Engineering' },
  { name: 'Diego Alvarez', email: 'diego.alvarez@example.com', department: 'Data' },
  { name: 'Fatima Okafor', email: 'fatima.okafor@example.com', department: 'Security' },
  { name: 'Liam O’Connor', email: 'liam.oconnor@example.com', department: 'Support' },
  { name: 'Sofia Rossi', email: 'sofia.rossi@example.com', department: 'IT' },
  { name: 'Jonas Becker', email: 'jonas.becker@example.com', department: 'Engineering' }
] as const

const COMMENTS = [
  'Seeing the same pattern on staging right now — grabbing logs.',
  'Rolled back as a precaution; error rate is dropping.',
  'Can we add an alert for this so we catch it before customers do?',
  'Root cause confirmed, writing up the solution now.',
  'This looks identical to last month. Linking it.',
  'Customer impact: roughly 3% of sessions during the window.'
]

async function guardReset(): Promise<void> {
  const url = process.env.DATABASE_URL ?? ''
  const local = /@(localhost|127\.0\.0\.1|db|postgres)(:\d+)?\//.test(url)
  if (!local && process.env.SEED_ALLOW_REMOTE !== '1') {
    throw new Error('Refusing to --reset a non-local database. Set SEED_ALLOW_REMOTE=1 if you really mean it.')
  }
  await prisma.$transaction([
    prisma.notificationLog.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.matchLink.deleteMany(),
    prisma.solution.deleteMany(),
    prisma.incident.deleteMany()
  ])
  console.log('Cleared existing data')
}

async function createIncident(scenario: Scenario, createdAt: Date, opts: { resolve: boolean; titleSuffix?: string }) {
  const reporter = pick(PEOPLE)
  const mttr = opts.resolve ? between(Math.round(scenario.timeToFix * 0.5), scenario.timeToFix * 2) : null
  const resolvedAt = mttr !== null ? new Date(createdAt.getTime() + mttr * 60_000) : null
  const closed = resolvedAt && rand() < 0.3
  return prisma.incident.create({
    data: {
      title: scenario.title + (opts.titleSuffix ?? ''),
      description: scenario.description,
      symptoms: scenario.symptoms,
      affectedSystems: scenario.systems,
      severity: scenario.severity,
      status: closed ? 'CLOSED' : resolvedAt ? 'RESOLVED' : pick(['OPEN', 'INVESTIGATING'] as const),
      createdBy: reporter.name,
      email: reporter.email,
      department: reporter.department,
      createdAt,
      updatedAt: resolvedAt ?? createdAt,
      resolvedAt,
      closedAt: closed && resolvedAt ? new Date(resolvedAt.getTime() + DAY) : null,
      actualMTTR: mttr,
      activityLog: {
        create: [
          { action: 'CREATED', actor: reporter.name, details: `Incident reported (${scenario.severity}, ${reporter.department})`, timestamp: createdAt },
          ...(resolvedAt ? [{ action: 'STATUS_CHANGED', actor: reporter.name, details: 'Status OPEN → RESOLVED', timestamp: resolvedAt }] : [])
        ]
      }
    }
  })
}

async function seedScenarios(): Promise<number> {
  let count = 0
  for (const scenario of SCENARIOS) {
    const originalAt = new Date(now - between(40, 85) * DAY)
    const original = await createIncident(scenario, originalAt, { resolve: true })
    count++

    const solver = pick(PEOPLE)
    const verified = rand() < 0.6
    const verifier = PEOPLE[0]
    const solution = await prisma.solution.create({
      data: {
        incidentId: original.id,
        rootCause: scenario.rootCause,
        approach: scenario.approach,
        useCaseNotes: scenario.useCaseNotes,
        timeToFix: scenario.timeToFix,
        efficiency: scenario.efficiency,
        qaChecks: verified ? ['root-cause-confirmed', 'fix-verified', 'monitoring', 'rollback', 'documented'] : ['root-cause-confirmed', 'fix-verified'],
        solvedBy: solver.name,
        email: solver.email,
        solvedAt: original.resolvedAt ?? originalAt,
        status: verified ? 'VERIFIED' : 'UNVERIFIED',
        verifiedBy: verified ? verifier.name : null,
        verifiedAt: verified ? new Date((original.resolvedAt ?? originalAt).getTime() + DAY) : null,
        monitoring: verified ? 'Alert added on the leading indicator described in the root cause.' : null
      }
    })

    const commenters = [pick(PEOPLE), pick(PEOPLE)]
    for (const [i, person] of commenters.entries()) {
      await prisma.comment.create({
        data: {
          incidentId: original.id,
          author: person.name,
          email: person.email,
          content: pick(COMMENTS),
          createdAt: new Date(originalAt.getTime() + (i + 1) * 20 * 60_000)
        }
      })
    }

    // Recurrences linked as the SAME issue, spread over the last ~35 days
    for (let r = 0; r < scenario.recurrences; r++) {
      const at = new Date(now - between(1, 35) * DAY - between(0, 600) * 60_000)
      const recurrence = await createIncident(scenario, at, { resolve: rand() < 0.75, titleSuffix: r === 0 ? '' : ` (again)` })
      const worked = recurrence.resolvedAt ? rand() < 0.8 : null
      await prisma.incident.update({ where: { id: recurrence.id }, data: { linkedToId: original.id } })
      await prisma.matchLink.create({
        data: {
          newIncidentId: recurrence.id,
          originalIncidentId: original.id,
          matchType: 'SAME',
          solutionUsed: solution.id,
          didSolutionWork: worked,
          outcome: worked === null ? null : worked ? 'RESOLVED' : 'DIFFERENT_APPROACH_NEEDED',
          createdBy: recurrence.createdBy,
          createdAt: at,
          resolvedAt: worked ? recurrence.resolvedAt : null
        }
      })
      await prisma.activityLog.create({
        data: { incidentId: recurrence.id, action: 'LINKED', actor: recurrence.createdBy, details: `Linked to "${original.title}" (Same issue)`, timestamp: at }
      })
      count++
    }
    await prisma.incident.update({ where: { id: original.id }, data: { recurringCount: scenario.recurrences + 1 } })
  }
  return count
}

async function seedScale(n: number): Promise<void> {
  const batch = 1000
  for (let done = 0; done < n; done += batch) {
    const rows: Prisma.IncidentCreateManyInput[] = Array.from({ length: Math.min(batch, n - done) }, (_, i) => {
      const s = pick(SCENARIOS)
      const p = pick(PEOPLE)
      const createdAt = new Date(now - between(0, 365) * DAY - between(0, 1440) * 60_000)
      const mttr = rand() < 0.8 ? between(5, 600) : null
      return {
        title: `${s.title} [synthetic ${done + i}]`,
        description: s.description,
        symptoms: s.symptoms,
        affectedSystems: s.systems,
        severity: pick(['P1', 'P2', 'P3', 'P3', 'P4'] as const),
        status: mttr === null ? 'OPEN' : 'RESOLVED',
        createdBy: p.name,
        email: p.email,
        department: p.department,
        createdAt,
        resolvedAt: mttr === null ? null : new Date(createdAt.getTime() + mttr * 60_000),
        actualMTTR: mttr
      }
    })
    await prisma.incident.createMany({ data: rows })
    process.stdout.write(`\rSynthetic incidents: ${Math.min(done + batch, n)}/${n}`)
  }
  process.stdout.write('\n')
}

async function main(): Promise<void> {
  if (reset) await guardReset()
  const count = await seedScenarios()
  console.log(`Seeded ${count} incidents across ${SCENARIOS.length} scenarios`)
  if (scale > 0) await seedScale(scale)
  console.log('Seeded incidents belong to no organization yet. Make them visible with: npm run incidents:assign -- <organization-slug>')
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
