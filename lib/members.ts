import { prisma } from '@/lib/db'

/**
 * The subset of `emails` that belong to active members of an organization. Used so mentions and
 * incident emails only ever reach people inside the incident's organization.
 */
export async function activeMemberEmails(organizationId: string, emails: string[]): Promise<Set<string>> {
  const wanted = [...new Set(emails.map(e => e.toLowerCase()))]
  if (wanted.length === 0) return new Set()
  const rows = await prisma.membership.findMany({
    where: { organizationId, status: 'ACTIVE', user: { email: { in: wanted } } },
    select: { user: { select: { email: true } } }
  })
  return new Set(rows.map(r => r.user.email))
}
