/**
 * Moves incidents that belong to no organization (created before organizations existed, or by the
 * seed script) into one organization, so its members can see them.
 *
 *   npm run incidents:assign -- <organization-slug>
 *
 * Find the slug on the superadmin console or in the "Organization" table. Safe to re-run: only
 * incidents without an organization are touched.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function assignOrphanIncidents(slug: string): Promise<{ organization: string; incidents: number; notifications: number }> {
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, name: true } })
  if (!org) {
    const known = await prisma.organization.findMany({ select: { slug: true, name: true }, orderBy: { name: 'asc' } })
    throw new Error(`No organization with slug "${slug}". Known: ${known.map(o => `${o.slug} (${o.name})`).join(', ') || 'none yet'}`)
  }

  return prisma.$transaction(async tx => {
    const incidents = await tx.incident.updateMany({ where: { organizationId: null }, data: { organizationId: org.id } })
    // Notifications follow their incident's organization
    const notifications = await tx.$executeRaw`
      UPDATE "NotificationLog" n SET "organizationId" = ${org.id}
      FROM "Incident" i
      WHERE n."organizationId" IS NULL AND i."id" = n."incidentId" AND i."organizationId" = ${org.id}
    `
    return { organization: org.name, incidents: incidents.count, notifications }
  })
}

async function main(): Promise<void> {
  const slug = process.argv[2]
  if (!slug) throw new Error('Usage: npm run incidents:assign -- <organization-slug>')
  const result = await assignOrphanIncidents(slug)
  console.log(`Moved ${result.incidents} incidents and ${result.notifications} notifications into ${result.organization}`)
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
