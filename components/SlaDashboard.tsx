'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Download, Gauge, ShieldCheck, Timer, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import KpiCard from '@/components/KpiCard'
import { SeverityBadge } from '@/components/incident-badges'
import { EmptyState, ErrorNotice, LoadingRows } from '@/components/states'
import { useSession } from '@/components/SessionProvider'
import { useSlaReport } from '@/hooks/useIncidents'
import { CRITICALITY_LABEL, SLA_WARN_RATIO } from '@/lib/constants'
import type { ProjectSlaRow, SlaRiskRow } from '@/lib/types'
import { cn, formatMinutes } from '@/lib/utils'

const thisMonth = (): string => new Date().toISOString().slice(0, 7)
const shiftMonth = (month: string, by: number): string => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}
const monthLabel = (month: string): string =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
const pct = (v: number | null): string => (v === null ? '—' : `${v}%`)

/** SLA compliance, availability, downtime and its cost per project for a month, plus what is at risk now. */
export default function SlaDashboard(): React.JSX.Element {
  const [month, setMonth] = useState(thisMonth)
  const { data, error, isLoading, mutate } = useSlaReport(month)
  const { membership, user } = useSession()
  const isAdmin = user.isSuperAdmin || membership?.role === 'ADMIN'
  const current = month === thisMonth()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="ui-input flex items-center gap-1 p-1" role="group" aria-label="Month">
          <Button variant="ghost" size="icon" className="size-8" aria-label="Previous month" onClick={() => setMonth(m => shiftMonth(m, -1))}><ChevronLeft /></Button>
          <span className="min-w-36 text-center text-sm font-medium tabular-nums" aria-live="polite">{monthLabel(month)}</span>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Next month" disabled={current} onClick={() => setMonth(m => shiftMonth(m, 1))}><ChevronRight /></Button>
        </div>
        <div className="flex items-center gap-2">
          {current && <span className="text-xs text-muted-foreground">Month to date · UTC</span>}
          <Button asChild variant="outline"><a href={`/api/export/sla?month=${month}`} download><Download aria-hidden="true" /> PDF report</a></Button>
        </div>
      </div>

      {error ? <ErrorNotice message={error.message} onRetry={() => void mutate()} />
        : isLoading || !data ? <LoadingRows count={4} />
        : data.projects.length === 0 && data.atRisk.length === 0 ? (
          <EmptyState title="No projects to report on"
            action={isAdmin && <Button asChild><Link href="/admin/projects">Set up projects & SLAs</Link></Button>}>
            SLA and uptime are tracked per project. {isAdmin ? 'Add your projects and their targets to start.' : 'Ask an organization admin to add projects and their targets.'}
          </EmptyState>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard label="SLA compliance" value={pct(data.totals.compliance)} Icon={ShieldCheck}
                tone={data.totals.compliance === null ? 'secondary' : data.totals.compliance >= 95 ? 'success' : data.totals.compliance >= 80 ? 'warning' : 'danger'}
                sub={`${data.totals.slaMet} met of ${data.totals.slaMet + data.totals.slaBreached} settled`} />
              <KpiCard label="SLA breaches" value={data.totals.slaBreached} Icon={AlertTriangle} tone={data.totals.slaBreached ? 'danger' : 'success'}
                sub={`${data.totals.incidents} incidents reported`} />
              <KpiCard label="Projects on target" value={`${data.totals.projectsMeetingTarget} / ${data.totals.projects}`} Icon={Gauge}
                tone={data.totals.projectsMeetingTarget === data.totals.projects ? 'success' : 'warning'} sub="Uptime vs monthly target" />
              <KpiCard label="Outage time" value={formatMinutes(data.totals.outageMinutes)} Icon={Timer}
                tone={data.totals.outageMinutes ? 'warning' : 'success'} sub="Summed across projects" />
              <KpiCard label="Downtime cost" value={data.totals.downtimeCost ? data.totals.downtimeCost.toLocaleString() : '—'} Icon={Wallet}
                tone="secondary" sub="Outage minutes × cost per minute" />
            </div>

            <AtRisk rows={data.atRisk} />

            <Card>
              <CardHeader>
                <CardTitle>Projects</CardTitle>
                <CardDescription>Worst first. Availability counts full outages only; degraded time is shown beside it.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <caption className="sr-only">SLA and availability per project, {monthLabel(month)}</caption>
                    <thead className="ui-label-mono border-y border-border bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">Project</th>
                        <th scope="col" className="px-3 py-2.5">Availability</th>
                        <th scope="col" className="px-3 py-2.5">Error budget</th>
                        <th scope="col" className="px-3 py-2.5 text-right">Outage</th>
                        <th scope="col" className="px-3 py-2.5 text-right">Degraded</th>
                        <th scope="col" className="px-3 py-2.5 text-right">Incidents</th>
                        <th scope="col" className="px-3 py-2.5 text-right">SLA met / breached</th>
                        <th scope="col" className="px-3 py-2.5 text-right">Avg resolve</th>
                        <th scope="col" className="px-4 py-2.5 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.projects.map(p => <ProjectRow key={p.id} p={p} />)}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
    </div>
  )
}

function ProjectRow({ p }: { p: ProjectSlaRow }): React.JSX.Element {
  // Availability bar: scaled so the gap between 100% and the target fills most of the track
  const floor = Math.max(0, 100 - (100 - p.availabilityTarget) * 4)
  const fill = Math.min(100, Math.max(0, ((p.availability - floor) / (100 - floor)) * 100))
  const targetAt = ((p.availabilityTarget - floor) / (100 - floor)) * 100
  const budgetUsed = p.errorBudgetMinutes > 0 ? Math.min(100, (p.outageMinutes / p.errorBudgetMinutes) * 100) : p.outageMinutes ? 100 : 0
  return (
    <tr className={cn('align-top', p.archived && 'opacity-60')}>
      <td className="px-4 py-3">
        <div className="font-medium">{p.name}{p.archived && <span className="ml-1 text-xs text-muted-foreground">(archived)</span>}</div>
        <div className="text-xs text-muted-foreground">{CRITICALITY_LABEL[p.criticality]} · {p.ownerName ? `lead: ${p.ownerName}` : 'no lead'}</div>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className={cn('w-16 font-semibold tabular-nums', p.targetMet ? 'text-success-foreground' : 'text-danger-foreground')}>{p.availability}%</span>
          <span className="relative h-2 w-24 rounded-full bg-muted" aria-hidden="true">
            <span className={cn('absolute inset-y-0 left-0 rounded-full', p.targetMet ? 'bg-success' : 'bg-danger')} style={{ width: `${fill}%` }} />
            <span className="absolute -inset-y-1 w-px bg-foreground/60" style={{ left: `${targetAt}%` }} />
          </span>
        </div>
        <div className="text-xs text-muted-foreground">target {p.availabilityTarget}%</div>
      </td>
      <td className="px-3 py-3">
        <span className="relative block h-2 w-24 rounded-full bg-muted" aria-hidden="true">
          <span className={cn('absolute inset-y-0 left-0 rounded-full', budgetUsed >= 100 ? 'bg-danger' : budgetUsed >= 75 ? 'bg-warning' : 'bg-primary')} style={{ width: `${budgetUsed}%` }} />
        </span>
        <div className="mt-1 text-xs text-muted-foreground">
          {p.errorBudgetLeftMinutes < 0 ? <span className="text-danger-foreground">over by {formatMinutes(-p.errorBudgetLeftMinutes)}</span> : `${formatMinutes(p.errorBudgetLeftMinutes)} left`}
        </div>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{p.outageMinutes ? formatMinutes(p.outageMinutes) : '—'}</td>
      <td className="px-3 py-3 text-right tabular-nums">{p.degradedMinutes ? formatMinutes(p.degradedMinutes) : '—'}</td>
      <td className="px-3 py-3 text-right tabular-nums">{p.incidents}</td>
      <td className="px-3 py-3 text-right tabular-nums">
        <span className="text-success-foreground">{p.slaMet}</span> / <span className={p.slaBreached ? 'font-semibold text-danger-foreground' : ''}>{p.slaBreached}</span>
        <div className="text-xs text-muted-foreground">{pct(p.compliance)}</div>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{formatMinutes(p.avgResolveMinutes)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{p.downtimeCost ? p.downtimeCost.toLocaleString() : '—'}</td>
    </tr>
  )
}

function AtRisk({ rows }: { rows: SlaRiskRow[] }): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock className="size-4" aria-hidden="true" /> At risk now</CardTitle>
        <CardDescription>Open incidents past {SLA_WARN_RATIO * 100}% of their time, or already overdue. Updates every minute.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing at risk. Every open incident is within its SLA.</p> : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <SeverityBadge severity={r.severity} />
                <Link href={`/incidents/${r.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{r.title}</Link>
                <span className="text-xs text-muted-foreground">{r.projects.join(', ')}</span>
                <Badge variant={r.state === 'breached' ? 'danger' : 'warning'}>
                  {r.clock === 'response' ? 'Response' : 'Resolve'} {r.state === 'breached' ? `overdue ${formatMinutes(-r.remainingMinutes)}` : `due in ${formatMinutes(r.remainingMinutes)}`}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
