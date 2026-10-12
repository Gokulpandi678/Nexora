import { describe, expect, it } from 'vitest'
import {
  allowedOutageMinutes, availabilityPercent, dueDates, impactInterval, incidentSla, mergedMinutes, monthRange,
  resumeShift, slaClock, slaOutcome, strictestTargets, type SlaFields
} from '@/lib/sla'

const at = (iso: string): Date => new Date(`2026-10-01T${iso}:00Z`)
const MIN = 60_000

const fields = (over: Partial<SlaFields> = {}): SlaFields => ({
  createdAt: at('10:00'),
  acknowledgedAt: null,
  resolvedAt: null,
  slaResponseDueAt: at('10:15'),
  slaResolveDueAt: at('14:00'),
  slaPausedAt: null,
  slaPausedMinutes: 0,
  ...over
})

describe('strictestTargets', () => {
  const policies = [
    { severity: 'P1', responseMinutes: 15, resolveMinutes: 240 },
    { severity: 'P1', responseMinutes: 30, resolveMinutes: 120 },
    { severity: 'P2', responseMinutes: 60, resolveMinutes: 480 }
  ]

  it('takes the tightest response and resolve separately across projects', () => {
    expect(strictestTargets(policies, 'P1')).toEqual({ responseMinutes: 15, resolveMinutes: 120 })
  })

  it('is null when no project has a policy for the severity', () => {
    expect(strictestTargets(policies, 'P4')).toBeNull()
  })
})

describe('dueDates', () => {
  it('counts from the report, plus paused time', () => {
    const due = dueDates(at('10:00'), { responseMinutes: 15, resolveMinutes: 240 }, 30)
    expect(due.slaResponseDueAt).toEqual(at('10:45'))
    expect(due.slaResolveDueAt).toEqual(at('14:30'))
  })

  it('has no due dates without targets', () => {
    expect(dueDates(at('10:00'), null)).toEqual({ slaResponseDueAt: null, slaResolveDueAt: null })
  })
})

describe('slaClock', () => {
  const base = { reportedAt: at('10:00'), dueAt: at('14:00'), doneAt: null, pausedAt: null, pausedMinutes: 0 }

  it('is on track early, at risk past 75%, breached once overdue', () => {
    expect(slaClock(base, at('11:00'))?.state).toBe('on_track')
    expect(slaClock(base, at('13:01'))?.state).toBe('at_risk')
    const late = slaClock(base, at('14:30'))
    expect(late?.state).toBe('breached')
    expect(late?.remainingMinutes).toBe(-30)
  })

  it('is met or breached for good once done', () => {
    expect(slaClock({ ...base, doneAt: at('13:59') }, at('20:00'))).toMatchObject({ state: 'met', remainingMinutes: 1 })
    expect(slaClock({ ...base, doneAt: at('14:05') }, at('20:00'))?.state).toBe('breached')
  })

  it('stands still while paused', () => {
    const paused = slaClock({ ...base, pausedAt: at('11:00') }, at('18:00'))
    expect(paused).toMatchObject({ state: 'paused', remainingMinutes: 180 })
  })

  it('does not count earlier paused time as used', () => {
    // Due was pushed out by 60 paused minutes: 4h allowance, 1h of it used at 12:00
    const clock = slaClock({ ...base, dueAt: at('15:00'), pausedMinutes: 60 }, at('12:00'))
    expect(clock?.usedRatio).toBe(0.25)
  })

  it('is null without a due date', () => {
    expect(slaClock({ ...base, dueAt: null }, at('11:00'))).toBeNull()
  })
})

describe('incidentSla and slaOutcome', () => {
  it('is null when no SLA applies', () => {
    expect(incidentSla(fields({ slaResponseDueAt: null, slaResolveDueAt: null }), at('11:00'))).toBeNull()
    expect(slaOutcome(null)).toBeNull()
  })

  it('stays unsettled while running inside its targets', () => {
    const sla = incidentSla(fields({ acknowledgedAt: at('10:05') }), at('11:00'))
    expect(sla?.breached).toBe(false)
    expect(slaOutcome(sla)).toBeNull()
  })

  it('is met when acknowledged and resolved in time', () => {
    const sla = incidentSla(fields({ acknowledgedAt: at('10:05'), resolvedAt: at('12:00') }), at('20:00'))
    expect(slaOutcome(sla)).toBe('met')
  })

  it('is breached by a late response even when resolved in time', () => {
    const sla = incidentSla(fields({ acknowledgedAt: at('10:20'), resolvedAt: at('12:00') }), at('20:00'))
    expect(sla?.response?.state).toBe('breached')
    expect(slaOutcome(sla)).toBe('breached')
  })

  it('is breached while still open past the deadline', () => {
    expect(slaOutcome(incidentSla(fields({ acknowledgedAt: at('10:05') }), at('15:00')))).toBe('breached')
  })
})

describe('resumeShift', () => {
  it('moves both due dates out by the paused time and adds it up', () => {
    const resumed = resumeShift(fields({ slaPausedAt: at('11:00'), slaPausedMinutes: 10 }), at('11:45'))
    expect(resumed).toEqual({
      slaPausedAt: null,
      slaPausedMinutes: 55,
      slaResponseDueAt: at('11:00'),
      slaResolveDueAt: at('14:45')
    })
  })
})

describe('impactInterval', () => {
  const incident = { impact: 'OUTAGE', startedAt: at('09:30'), createdAt: at('10:00'), mitigatedAt: at('10:30'), resolvedAt: at('12:00') }

  it('runs from impact start to mitigation', () => {
    expect(impactInterval(incident, at('20:00'))).toEqual({ start: at('09:30').getTime(), end: at('10:30').getTime() })
  })

  it('falls back to the report and to resolution, then to now', () => {
    expect(impactInterval({ ...incident, startedAt: null, mitigatedAt: null }, at('20:00')))
      .toEqual({ start: at('10:00').getTime(), end: at('12:00').getTime() })
    expect(impactInterval({ ...incident, mitigatedAt: null, resolvedAt: null }, at('11:00'))?.end).toBe(at('11:00').getTime())
  })

  it('is null without customer impact', () => {
    expect(impactInterval({ ...incident, impact: 'NONE' }, at('20:00'))).toBeNull()
  })
})

describe('mergedMinutes', () => {
  const from = at('00:00').getTime()
  const to = at('23:00').getTime()

  it('counts overlapping outages once', () => {
    const intervals = [
      { start: at('10:00').getTime(), end: at('11:00').getTime() },
      { start: at('10:30').getTime(), end: at('11:30').getTime() },
      { start: at('13:00').getTime(), end: at('13:10').getTime() }
    ]
    expect(mergedMinutes(intervals, from, to)).toBe(100)
  })

  it('clips to the period', () => {
    expect(mergedMinutes([{ start: from - 30 * MIN, end: from + 30 * MIN }], from, to)).toBe(30)
    expect(mergedMinutes([{ start: to + MIN, end: to + 60 * MIN }], from, to)).toBe(0)
  })
})

describe('availability', () => {
  it('turns outage minutes into a percentage', () => {
    expect(availabilityPercent(43, 30 * 24 * 60)).toBe(99.9)
    expect(availabilityPercent(0, 1000)).toBe(100)
    expect(availabilityPercent(10, 0)).toBe(100)
  })

  it('knows how much outage a target allows', () => {
    expect(allowedOutageMinutes(99.9, 30 * 24 * 60)).toBe(43)
    expect(allowedOutageMinutes(100, 30 * 24 * 60)).toBe(0)
  })
})

describe('monthRange', () => {
  it('parses YYYY-MM as a UTC calendar month', () => {
    const r = monthRange('2026-12')
    expect(r.month).toBe('2026-12')
    expect(r.from.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(r.to.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })

  it('falls back to the current month', () => {
    expect(monthRange('garbage', new Date('2026-10-12T08:00:00Z')).month).toBe('2026-10')
    expect(monthRange(null, new Date('2026-02-28T23:59:00Z')).month).toBe('2026-02')
  })
})
