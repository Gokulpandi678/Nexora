/**
 * The scheduled SLA check (app/api/cron/sla): warns project owners when an incident has used most of its
 * resolve time, and escalates breaches to project owners and the organization's admins.
 *
 * Breach state is always computed from the dates (lib/sla.ts); this only records WHEN it notified, so each
 * warning or breach goes out once per incident however often the check runs.
 */
import { prisma, live } from '@/lib/db'
import { sendSlaNotification } from '@/lib/email'
import { logError } from '@/lib/logger'
import { incidentSla } from '@/lib/sla'

export interface SlaCheckResult {
  checked: number
  warned: number
  responseBreaches: number
  resolveBreaches: number
}

export async function runSlaCheck(now = new Date()): Promise<SlaCheckResult> {
  const result: SlaCheckResult = { checked: 0, warned: 0, responseBreaches: 0, resolveBreaches: 0 }

  // Open, not paused, in an active organization, and with something still to notify
  const incidents = await prisma.incident.findMany({
    where: {
      ...live,
      status: { in: ['OPEN', 'INVESTIGATING'] },
      slaPausedAt: null,
      organization: { suspendedAt: null },
      OR: [
        { slaResolveDueAt: { not: null }, slaResolveBreachedAt: null },
        { slaResponseDueAt: { not: null }, acknowledgedAt: null, slaResponseBreachedAt: null }
      ]
    },
    include: { projects: { select: { name: true, owner: { select: { email: true } } } } },
    take: 2000
  })

  const adminsByOrg = new Map<string, string[]>()
  const admins = async (organizationId: string | null): Promise<string[]> => {
    if (!organizationId) return []
    const cached = adminsByOrg.get(organizationId)
    if (cached) return cached
    const rows = await prisma.membership.findMany({
      where: { organizationId, role: 'ADMIN', status: 'ACTIVE' },
      select: { user: { select: { email: true } } }
    })
    const emails = rows.map(r => r.user.email)
    adminsByOrg.set(organizationId, emails)
    return emails
  }

  for (const incident of incidents) {
    result.checked++
    const sla = incidentSla(incident, now)
    if (!sla) continue
    // notify() skips anyone who is no longer an active member, so a departed lead gets nothing
    const owners = incident.projects.flatMap(p => (p.owner ? [p.owner.email] : []))
    const base = {
      incidentId: incident.id,
      incidentTitle: incident.title,
      severity: incident.severity,
      projects: incident.projects.map(p => p.name)
    }
    const send = async (to: string[], type: 'SLA_WARNING' | 'SLA_RESPONSE_BREACH' | 'SLA_BREACH', dueAt: string): Promise<void> => {
      // With no owner set, admins hear about it so nothing goes unnoticed
      const recipients = new Set((to.length ? to : await admins(incident.organizationId)).map(e => e.toLowerCase()))
      await Promise.all([...recipients].map(email => sendSlaNotification({ ...base, to: email, type, dueAt: new Date(dueAt) })))
    }

    try {
      const stamps: { slaWarnedAt?: Date; slaResponseBreachedAt?: Date; slaResolveBreachedAt?: Date } = {}

      if (sla.response?.state === 'breached' && !incident.acknowledgedAt && !incident.slaResponseBreachedAt) {
        stamps.slaResponseBreachedAt = now
        await send([...owners, ...(await admins(incident.organizationId))], 'SLA_RESPONSE_BREACH', sla.response.dueAt)
        result.responseBreaches++
      }
      if (sla.resolve?.state === 'breached' && !incident.slaResolveBreachedAt) {
        stamps.slaResolveBreachedAt = now
        await send([...owners, ...(await admins(incident.organizationId))], 'SLA_BREACH', sla.resolve.dueAt)
        result.resolveBreaches++
      } else if (sla.resolve?.state === 'at_risk' && !incident.slaWarnedAt) {
        stamps.slaWarnedAt = now
        await send([...owners, incident.email], 'SLA_WARNING', sla.resolve.dueAt)
        result.warned++
      }

      if (Object.keys(stamps).length) await prisma.incident.update({ where: { id: incident.id }, data: stamps })
    } catch (error) {
      // One incident failing must not stop the others from being checked
      logError(error, { step: 'runSlaCheck', incidentId: incident.id })
    }
  }
  return result
}
