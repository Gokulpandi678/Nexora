import type { Tx } from '@/lib/db'

export type ActivityAction =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'LINKED'
  | 'SOLUTION_ADDED'
  | 'VERIFIED'
  | 'COMMENTED'
  | 'OUTCOME_RECORDED'
  | 'DELETED'

export async function logActivity(
  tx: Tx,
  incidentId: string,
  action: ActivityAction,
  actor: string,
  details: string
): Promise<void> {
  await tx.activityLog.create({ data: { incidentId, action, actor, details } })
}

/** Minutes between two instants, never negative. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000))
}

/** Keeps the root incident's recurringCount equal to 1 + its live SAME-issue recurrences. */
export async function refreshRecurringCount(tx: Tx, rootId: string): Promise<number> {
  const count = await tx.incident.count({ where: { linkedToId: rootId, deletedAt: null } })
  await tx.incident.update({ where: { id: rootId }, data: { recurringCount: count + 1 } })
  return count + 1
}
