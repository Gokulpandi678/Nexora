/**
 * Seeds realistic demo data.
 *
 *   npm run db:seed                  # adds ~45 incidents with chains, solutions, comments
 *   npm run db:seed -- --reset       # wipes all tables first (local databases only)
 *   npm run db:seed -- --scale 50000 # adds N extra synthetic incidents for load testing
 *
 * Demo data for a real organization (e.g. before recording the product video):
 *
 *   npm run demo:seed -- --org <slug> --team --notify you@company.com
 *
 *   --org <slug>       creates the incidents inside that organization instead of leaving them unassigned
 *   --team             adds the demo people as members with varied roles, plus one pending join request
 *   --notify <email>   adds unread notifications (recurrence, mention, verification, P1) for that person
 *   --force            seeds an organization again even though it already has demo incidents
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
const option = (name: string): string | undefined => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const orgSlug = option('--org')
const notifyEmail = option('--notify')?.toLowerCase()
const withTeam = args.includes('--team')
const force = args.includes('--force')
/** Set from --org before seeding; null leaves incidents unassigned (the original behaviour). */
let organizationId: string | null = null

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

/** Access role and job level for each demo person when --team is given (same order as PEOPLE). */
const TEAM = [
  { role: 'VERIFIER', position: 'TEAM_LEAD' },
  { role: 'REPORTER', position: 'MANAGER' },
  { role: 'REPORTER', position: 'TEAM_MEMBER' },
  { role: 'VIEWER', position: 'TEAM_MEMBER' },
  { role: 'VERIFIER', position: 'DIRECTOR' },
  { role: 'REPORTER', position: 'TEAM_MEMBER' },
  { role: 'REPORTER', position: 'CONTRACTOR' },
  { role: 'ADMIN', position: 'CXO' }
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
      organizationId,
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
        actualMTTR: mttr,
        organizationId
      }
    })
    await prisma.incident.createMany({ data: rows })
    process.stdout.write(`\rSynthetic incidents: ${Math.min(done + batch, n)}/${n}`)
  }
  process.stdout.write('\n')
}

/** Resolves --org and refuses to seed the same organization twice unless --force. */
async function resolveOrganization(slug: string): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, name: true } })
  if (!org) {
    const known = await prisma.organization.findMany({ select: { slug: true }, orderBy: { slug: 'asc' } })
    throw new Error(`No organization with slug "${slug}". Known: ${known.map(o => o.slug).join(', ') || 'none yet'}`)
  }
  const seeded = await prisma.incident.count({ where: { organizationId: org.id, title: SCENARIOS[0]?.title } })
  if (seeded > 0 && !force) throw new Error(`${org.name} already has demo incidents. Pass --force to add another set.`)
  console.log(`Seeding into ${org.name}`)
  return org.id
}

/** Demo people as members of the organization, so Members, roles and mentions look lived-in. */
async function seedTeam(orgId: string): Promise<void> {
  for (const [i, person] of PEOPLE.entries()) {
    const team = TEAM[i] ?? TEAM[2]
    // update: {} — never change a real account that happens to share the address
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: {},
      create: {
        workosId: `demo_${person.email}`,
        email: person.email,
        name: person.name,
        department: person.department,
        onboardedAt: new Date(now - 90 * DAY)
      }
    })
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
      update: {},
      create: { userId: user.id, organizationId: orgId, role: team.role, position: team.position, status: 'ACTIVE', decidedAt: new Date(now - 80 * DAY) }
    })
  }

  // One join request waiting for the admin, to show the approval flow
  const requester = await prisma.user.upsert({
    where: { email: 'noah.kim@example.com' },
    update: {},
    create: { workosId: 'demo_noah.kim@example.com', email: 'noah.kim@example.com', name: 'Noah Kim', department: 'Support', onboardedAt: new Date(now - DAY) }
  })
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: requester.id, organizationId: orgId } },
    update: {},
    create: {
      userId: requester.id,
      organizationId: orgId,
      status: 'PENDING',
      message: 'Joining the support on-call rotation next week and would like access to past incidents.'
    }
  })
  console.log(`Added ${PEOPLE.length} members and 1 pending join request`)
}

/** Unread notifications for one person, pointing at the most recent seeded incidents. */
async function seedNotifications(email: string, orgId: string | null): Promise<void> {
  const recent = await prisma.incident.findMany({
    where: { organizationId: orgId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 4,
    select: { id: true, title: true }
  })
  const kinds = [
    { type: 'RECURRENCE', title: (t: string) => `Recurring issue: ${t}` },
    { type: 'MENTION', title: (t: string) => `Priya Raman mentioned you on ${t}` },
    { type: 'SOLUTION_VERIFIED', title: (t: string) => `Solution verified on ${t}` },
    { type: 'P1_ESCALATION', title: (t: string) => `P1 escalation: ${t}` }
  ] as const
  await prisma.notificationLog.createMany({
    data: recent.map((incident, i) => {
      const kind = kinds[i % kinds.length] ?? kinds[0]
      return {
        recipientEmail: email,
        incidentId: incident.id,
        organizationId: orgId,
        notificationType: kind.type,
        title: kind.title(incident.title),
        delivered: false,
        sentAt: new Date(now - (i + 1) * 45 * 60_000)
      }
    })
  })
  console.log(`Added ${recent.length} unread notifications for ${email}`)
}

async function main(): Promise<void> {
  if (reset) await guardReset()
  if (orgSlug) organizationId = await resolveOrganization(orgSlug)
  const count = await seedScenarios()
  console.log(`Seeded ${count} incidents across ${SCENARIOS.length} scenarios`)
  if (scale > 0) await seedScale(scale)
  if (organizationId && withTeam) await seedTeam(organizationId)
  if (notifyEmail) await seedNotifications(notifyEmail, organizationId)
  if (!organizationId) {
    console.log('Seeded incidents belong to no organization yet. Make them visible with: npm run incidents:assign -- <organization-slug>')
  }
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
