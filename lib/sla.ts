/**
 * SLA clocks and downtime, as pure functions over an incident's dates (no database, no clock of their own).
 *
 * - The SLA clock starts when the incident is reported and runs 24×7. Response is met by acknowledging,
 *   resolution by reaching RESOLVED or CLOSED. Paused time (waiting on the customer) does not count.
 * - Due dates are stored on the incident when it is reported (see dueDates); breach state is always worked
 *   out from the dates here, so dashboards are right even if the scheduled SLA check never runs.
 * - Downtime = the impact window, from `startedAt` (or the report) to `mitigatedAt` (or resolution, or now).
 *   Overlapping windows on one project are merged before they are counted.
 */
import { SLA_WARN_RATIO } from '@/lib/constants'

const MINUTE = 60_000

export interface SlaTargets {
  responseMinutes: number
  resolveMinutes: number
}

/** The strictest targets for one severity across the incident's projects; null when none has a policy for it. */
export function strictestTargets(
  policies: { severity: string; responseMinutes: number; resolveMinutes: number }[],
  severity: string
): SlaTargets | null {
  const matching = policies.filter(p => p.severity === severity)
  if (matching.length === 0) return null
  return {
    responseMinutes: Math.min(...matching.map(p => p.responseMinutes)),
    resolveMinutes: Math.min(...matching.map(p => p.resolveMinutes))
  }
}

/** Due dates measured from the report, pushed out by the time already spent paused. */
export function dueDates(
  reportedAt: Date,
  targets: SlaTargets | null,
  pausedMinutes = 0
): { slaResponseDueAt: Date | null; slaResolveDueAt: Date | null } {
  if (!targets) return { slaResponseDueAt: null, slaResolveDueAt: null }
  const base = reportedAt.getTime() + pausedMinutes * MINUTE
  return {
    slaResponseDueAt: new Date(base + targets.responseMinutes * MINUTE),
    slaResolveDueAt: new Date(base + targets.resolveMinutes * MINUTE)
  }
}

/** Whole minutes from `from` to `to` (never negative). */
export const minutesBetween = (from: Date, to: Date): number => Math.max(0, Math.round((to.getTime() - from.getTime()) / MINUTE))

export type SlaClockState = 'met' | 'breached' | 'paused' | 'at_risk' | 'on_track'

export interface SlaClock {
  dueAt: string
  state: SlaClockState
  /** Minutes left until due; negative once overdue. Frozen while paused, final once done. */
  remainingMinutes: number
  /** Share of the allowed time used so far, 0–1+ */
  usedRatio: number
}

interface ClockInput {
  dueAt: Date | null
  /** When the target was reached (acknowledged / resolved); null while still running */
  doneAt: Date | null
  reportedAt: Date
  pausedAt: Date | null
  pausedMinutes: number
}

export function slaClock({ dueAt, doneAt, reportedAt, pausedAt, pausedMinutes }: ClockInput, now: Date): SlaClock | null {
  if (!dueAt) return null
  // While paused the clock stands still at the moment it was paused
  const end = (doneAt ?? pausedAt ?? now).getTime()
  const paused = pausedMinutes * MINUTE
  const budget = Math.max(MINUTE, dueAt.getTime() - reportedAt.getTime() - paused)
  const usedRatio = Math.max(0, end - reportedAt.getTime() - paused) / budget
  const remainingMinutes = Math.floor((dueAt.getTime() - end) / MINUTE)
  const overdue = end > dueAt.getTime()

  let state: SlaClockState
  if (doneAt) state = overdue ? 'breached' : 'met'
  else if (overdue) state = 'breached'
  else if (pausedAt) state = 'paused'
  else state = usedRatio >= SLA_WARN_RATIO ? 'at_risk' : 'on_track'

  return { dueAt: dueAt.toISOString(), state, remainingMinutes, usedRatio: Math.round(usedRatio * 1000) / 1000 }
}

export interface SlaFields {
  createdAt: Date
  acknowledgedAt: Date | null
  resolvedAt: Date | null
  slaResponseDueAt: Date | null
  slaResolveDueAt: Date | null
  slaPausedAt: Date | null
  slaPausedMinutes: number
}

export interface IncidentSla {
  response: SlaClock | null
  resolve: SlaClock | null
  paused: boolean
  /** Either target missed (or, while open, already overdue) */
  breached: boolean
}

/** Both SLA clocks of an incident; null when no SLA applies to it. */
export function incidentSla(i: SlaFields, now: Date): IncidentSla | null {
  if (!i.slaResponseDueAt && !i.slaResolveDueAt) return null
  const common = { reportedAt: i.createdAt, pausedAt: i.slaPausedAt, pausedMinutes: i.slaPausedMinutes }
  const response = slaClock({ ...common, dueAt: i.slaResponseDueAt, doneAt: i.acknowledgedAt }, now)
  const resolve = slaClock({ ...common, dueAt: i.slaResolveDueAt, doneAt: i.resolvedAt }, now)
  return {
    response,
    resolve,
    paused: i.slaPausedAt !== null,
    breached: response?.state === 'breached' || resolve?.state === 'breached'
  }
}

/**
 * Settled SLA outcome for reporting: 'met' once resolved in time with a timely response, 'breached' as soon
 * as either target is missed, null while still running inside its targets (or with no SLA).
 */
export function slaOutcome(sla: IncidentSla | null): 'met' | 'breached' | null {
  if (!sla) return null
  if (sla.breached) return 'breached'
  return sla.resolve?.state === 'met' ? 'met' : null
}

/** Moves due dates out by the time spent paused, for resuming the clock. */
export function resumeShift(i: Pick<SlaFields, 'slaPausedAt' | 'slaResponseDueAt' | 'slaResolveDueAt' | 'slaPausedMinutes'>, now: Date): {
  slaPausedAt: null
  slaPausedMinutes: number
  slaResponseDueAt: Date | null
  slaResolveDueAt: Date | null
} {
  const pausedFor = i.slaPausedAt ? minutesBetween(i.slaPausedAt, now) : 0
  const shift = (d: Date | null): Date | null => (d ? new Date(d.getTime() + pausedFor * MINUTE) : null)
  return {
    slaPausedAt: null,
    slaPausedMinutes: i.slaPausedMinutes + pausedFor,
    slaResponseDueAt: shift(i.slaResponseDueAt),
    slaResolveDueAt: shift(i.slaResolveDueAt)
  }
}

/* ---------- Downtime & availability ---------- */

export interface Interval {
  start: number
  end: number
}

export interface ImpactFields {
  impact: string
  startedAt: Date | null
  createdAt: Date
  mitigatedAt: Date | null
  resolvedAt: Date | null
}

/** The window customers were affected, or null when the incident had no customer impact. */
export function impactInterval(i: ImpactFields, now: Date): Interval | null {
  if (i.impact !== 'DEGRADED' && i.impact !== 'OUTAGE') return null
  const start = (i.startedAt ?? i.createdAt).getTime()
  const end = (i.mitigatedAt ?? i.resolvedAt ?? now).getTime()
  return end > start ? { start, end } : null
}

/** Minutes covered by the intervals inside [from, to), counting overlaps once. */
export function mergedMinutes(intervals: Interval[], from: number, to: number): number {
  const clipped = intervals
    .map(r => ({ start: Math.max(r.start, from), end: Math.min(r.end, to) }))
    .filter(r => r.end > r.start)
    .sort((a, b) => a.start - b.start)
  let total = 0
  let current: Interval | null = null
  for (const r of clipped) {
    if (current && r.start <= current.end) current.end = Math.max(current.end, r.end)
    else {
      if (current) total += current.end - current.start
      current = { ...r }
    }
  }
  if (current) total += current.end - current.start
  return Math.round(total / MINUTE)
}

/** Availability in percent over a period, to three decimals (100 when the period is empty). */
export function availabilityPercent(outageMinutes: number, periodMinutes: number): number {
  if (periodMinutes <= 0) return 100
  return Math.round(Math.max(0, 1 - outageMinutes / periodMinutes) * 100_000) / 1000
}

/** Outage minutes a target allows over a period: 99.9% of 30 days ≈ 43 minutes. */
export const allowedOutageMinutes = (targetPercent: number, periodMinutes: number): number =>
  Math.floor(periodMinutes * Math.max(0, 100 - targetPercent) / 100)

/** A calendar month in UTC: '2026-10' → [Oct 1, Nov 1). Invalid or missing → the current month. */
export function monthRange(month: string | null | undefined, now = new Date()): { month: string; from: Date; to: Date } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month ?? '')
  const year = match ? Number(match[1]) : now.getUTCFullYear()
  const index = match ? Number(match[2]) - 1 : now.getUTCMonth()
  const from = new Date(Date.UTC(year, index, 1))
  const to = new Date(Date.UTC(year, index + 1, 1))
  return { month: `${year}-${String(index + 1).padStart(2, '0')}`, from, to }
}
