'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Activity, AlertOctagon, ArrowRight, CheckCircle2, ListTree, Plus, RotateCw, Sparkles, Timer
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SeverityBadge, StatusBadge } from '@/components/incident-badges'
import { EmptyState, ErrorNotice, LoadingRows } from '@/components/states'
import KpiCard from '@/components/KpiCard'
import { useIncidentStats, useTrends } from '@/hooks/useIncidents'
import { useIdentityStore } from '@/lib/store'
import { SEVERITIES, SEVERITY_LABEL, STATUSES, STATUS_LABEL } from '@/lib/constants'
import type { DashboardStats } from '@/lib/types'
import { cn, formatMinutes, timeAgo } from '@/lib/utils'

function greeting(date: Date): string {
  const h = date.getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Overview(): React.JSX.Element {
  const { data, error, mutate } = useIncidentStats()
  const { data: trends } = useTrends(14)
  const name = useIdentityStore(s => s.currentUser?.name.split(' ')[0])
  // Set after mount so the server render (other timezone) never disagrees with the client
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(new Date()), [])
  const points = trends?.points ?? []

  if (error) return <><Hero name={name} now={now} /><ErrorNotice message={error.message} onRetry={() => void mutate()} /></>
  if (!data) return <><Hero name={name} now={now} /><LoadingRows count={3} /></>

  return (
    <div className="flex flex-col gap-6">
      <Hero name={name} now={now} stats={data} />

      {data.totals.all === 0 ? (
        <EmptyState title="No incidents yet" action={<Button asChild><Link href="/incidents/new">Report the first incident</Link></Button>}>
          Every incident you report is checked against history, so the second occurrence is faster to fix.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Open incidents" value={data.totals.open} Icon={Activity} tone="primary"
              sub={`${data.totals.all.toLocaleString()} all time`} spark={points.map(p => p.incidents)} className="animate-rise" />
            <KpiCard label="Open P1s" value={data.totals.openP1} Icon={AlertOctagon} tone={data.totals.openP1 ? 'danger' : 'success'}
              sub={data.totals.openP1 ? 'Needs attention now' : 'None — good'} spark={points.map(p => p.P1)} className="animate-rise [animation-delay:60ms]" />
            <KpiCard label="Avg MTTR" value={formatMinutes(data.avgMTTR)} Icon={Timer} tone="secondary"
              sub="report → resolved" spark={points.map(p => p.avgMTTR)} className="animate-rise [animation-delay:120ms]" />
            <KpiCard label="Recurring rate" value={`${data.recurringRate}%`} Icon={RotateCw} tone="warning"
              sub={`${data.resolutionRate}% resolved overall`} spark={points.map(p => p.resolved)} className="animate-rise [animation-delay:180ms]" />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Pipeline stats={data} className="lg:col-span-3" />
            <SeverityMix stats={data} className="lg:col-span-2" />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Recent incidents</CardTitle>
                <Button asChild variant="link" size="sm"><Link href="/incidents">View all <ArrowRight aria-hidden="true" /></Link></Button>
              </CardHeader>
              <CardContent>
                <ol className="relative flex flex-col">
                  {data.recent.map((i, idx) => (
                    <li key={i.id} className={cn('relative pl-6', `sev-${i.severity}`)}>
                      {idx < data.recent.length - 1 && <span className="absolute left-[7px] top-6 h-full w-px bg-border" aria-hidden="true" />}
                      <span className="sev-dot absolute left-0.5 top-[18px] size-3 rounded-full ring-4 ring-surface" aria-hidden="true" />
                      <Link href={`/incidents/${i.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{i.title}</span>
                          <span className="text-xs text-muted-foreground">{i.createdBy} · {timeAgo(i.createdAt)}</span>
                        </span>
                        <SeverityBadge severity={i.severity} />
                        <StatusBadge status={i.status} />
                      </Link>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Keeps coming back</CardTitle>
                <Button asChild variant="link" size="sm"><Link href="/analytics">Analytics <ArrowRight aria-hidden="true" /></Link></Button>
              </CardHeader>
              <CardContent>
                {data.topRecurring.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" aria-hidden="true" /> Nothing has recurred yet.</p>
                ) : (
                  <RecurringBars rows={data.topRecurring.slice(0, 5)} />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Hero({ name, now, stats }: { name?: string; now: Date | null; stats?: DashboardStats }): React.JSX.Element {
  const p1 = stats?.totals.openP1 ?? 0
  const open = stats?.totals.open ?? 0
  const tone = !stats ? 'text-subtle' : p1 > 0 ? 'text-danger' : open > 0 ? 'text-warning' : 'text-success'
  const headline = !stats
    ? 'Checking the queue…'
    : p1 > 0
      ? `${p1} critical incident${p1 === 1 ? '' : 's'} need${p1 === 1 ? 's' : ''} attention`
      : open > 0
        ? `${open} open, nothing critical`
        : 'All clear — no open incidents'
  const rate = stats?.resolutionRate ?? 0

  return (
    <section className="ui-card relative overflow-hidden p-6 sm:p-8" aria-labelledby="hero-title">
      <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="animate-rise">
          <p className="eyebrow mb-2 min-h-4">{now && `${format(now, 'EEEE, d MMMM')} · ${greeting(now)}`}</p>
          <h1 id="hero-title" className="font-display-tight text-3xl font-bold sm:text-4xl">
            {name ? <>Welcome back, <span className="text-gradient">{name}</span></> : 'Dashboard'}
          </h1>
          <p className="mt-3 flex items-center gap-2.5 text-sm font-medium" role="status">
            <span className={cn('pulse-ring size-2.5 shrink-0 rounded-full bg-current', tone)} aria-hidden="true" />
            {headline}
          </p>
          <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
            Report early — someone may already have the fix. Every report is checked against history first.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="lg"><Link href="/incidents/new"><Plus aria-hidden="true" /> Report incident</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/incidents"><ListTree aria-hidden="true" /> Browse incidents</Link></Button>
          </div>
        </div>
        {stats && stats.totals.all > 0 && <HealthRing rate={rate} solutions={stats.verifiedSolutions} />}
      </div>
    </section>
  )
}

/** Resolution rate as a ring gauge. */
function HealthRing({ rate, solutions }: { rate: number; solutions: number }): React.JSX.Element {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="flex shrink-0 items-center gap-5 self-start md:self-auto">
      <div className="relative size-36">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-1000"
            strokeDasharray={c} strokeDashoffset={c * (1 - rate / 100)} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-bold tabular-nums">{rate}%</span>
          <span className="text-[11px] text-muted-foreground">resolved</span>
        </div>
      </div>
      <div className="hidden flex-col gap-1 text-sm sm:flex">
        <span className="flex items-center gap-1.5 font-semibold"><Sparkles className="size-4 text-primary" aria-hidden="true" /> {solutions} verified fixes</span>
        <span className="max-w-[18ch] text-xs text-muted-foreground">ready to reuse the next time something breaks</span>
      </div>
    </div>
  )
}

const STATUS_BAR: Record<string, string> = {
  OPEN: 'bg-primary',
  INVESTIGATING: 'bg-warning',
  RESOLVED: 'bg-success',
  CLOSED: 'bg-subtle'
}

/** Where incidents sit in the lifecycle, as a flow. */
function Pipeline({ stats, className }: { stats: DashboardStats; className?: string }): React.JSX.Element {
  const counts = STATUSES.map(s => ({ s, n: stats.byStatus.find(r => r.key === s)?.count ?? 0 }))
  const total = Math.max(1, counts.reduce((a, c) => a + c.n, 0))
  return (
    <Card className={className}>
      <CardHeader><CardTitle>Lifecycle pipeline</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {counts.map(({ s, n }) => n > 0 && (
            <span key={s} className={cn('h-full origin-left animate-grow-x first:rounded-l-full last:rounded-r-full', STATUS_BAR[s])} style={{ width: `${(n / total) * 100}%` }} />
          ))}
        </div>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {counts.map(({ s, n }, i) => (
            <li key={s} className="relative">
              <Link href={`/incidents?status=${s}`} className="flex flex-col gap-0.5 rounded-lg border border-border p-3 transition-colors hover:border-primary/50 hover:bg-muted/50">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn('size-2 rounded-full', STATUS_BAR[s])} aria-hidden="true" />
                  {STATUS_LABEL[s]}
                </span>
                <span className="font-display text-2xl font-bold tabular-nums">{n}</span>
                <span className="text-[11px] text-muted-foreground">{Math.round((n / total) * 100)}% of all</span>
              </Link>
              {i < counts.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 hidden size-4 -translate-y-1/2 text-subtle sm:block" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function SeverityMix({ stats, className }: { stats: DashboardStats; className?: string }): React.JSX.Element {
  const rows = SEVERITIES.map(s => ({ s, n: stats.bySeverity.find(r => r.key === s)?.count ?? 0 }))
  const max = Math.max(1, ...rows.map(r => r.n))
  return (
    <Card className={className}>
      <CardHeader><CardTitle>Severity mix</CardTitle></CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {rows.map(({ s, n }) => (
            <li key={s} className={cn('grid grid-cols-[88px_1fr_40px] items-center gap-3 text-sm', `sev-${s}`)}>
              <span className="font-medium">{SEVERITY_LABEL[s]}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="sev-dot block h-full origin-left animate-grow-x rounded-full" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function RecurringBars({ rows }: { rows: DashboardStats['topRecurring'] }): React.JSX.Element {
  const max = Math.max(1, ...rows.map(r => r.count))
  return (
    <ol className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <li key={r.id}>
          <Link href={`/incidents/${r.id}`} className="-mx-2 flex flex-col gap-1.5 rounded-md px-2 py-2 transition-colors hover:bg-muted">
            <span className="flex items-center gap-2">
              <span className="w-4 text-xs font-semibold tabular-nums text-subtle">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-warning-foreground">{r.count}×</span>
            </span>
            <span className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full origin-left animate-grow-x rounded-full bg-warning" style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}
