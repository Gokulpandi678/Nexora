'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Activity, CheckCircle2, RotateCw, Timer } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SeverityBadge } from '@/components/incident-badges'
import { EmptyState, ErrorNotice, LoadingRows } from '@/components/states'
import KpiCard from '@/components/KpiCard'
import { ChartCard, DailyColumns, DonutChart, HBarChart, Heatmap, TrendLine } from '@/components/charts'
import { useIncidentStats, useSystemStats, useTeamStats, useTrends } from '@/hooks/useIncidents'
import { CHART } from '@/lib/design-tokens'
import { SEVERITIES, SEVERITY_LABEL, STATUSES, STATUS_LABEL } from '@/lib/constants'
import { formatMinutes, timeAgo } from '@/lib/utils'

const RANGES = [7, 30, 90] as const

export default function PatternsTab(): React.JSX.Element {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)
  const stats = useIncidentStats()
  const trends = useTrends(days)
  const systems = useSystemStats()
  const teams = useTeamStats()

  if (stats.error) return <ErrorNotice message={stats.error.message} onRetry={() => void stats.mutate()} />
  if (!stats.data) return <LoadingRows count={4} />
  const s = stats.data
  if (s.totals.all === 0) return <EmptyState title="No data yet">Analytics appear once incidents are reported.</EmptyState>

  const count = (rows: { key: string; count: number }[], key: string): number => rows.find(r => r.key === key)?.count ?? 0
  const severity = SEVERITIES.map(sev => ({ label: SEVERITY_LABEL[sev], value: count(s.bySeverity, sev), color: CHART.severity[sev] }))
  const status = STATUSES.map(st => ({ label: STATUS_LABEL[st], value: count(s.byStatus, st) }))
  const bySystem = s.bySystem.map(r => ({ label: r.key, value: r.count }))
  const points = trends.data?.points ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Incidents this month" value={s.totals.thisMonth.toLocaleString()} Icon={Activity} tone="primary" spark={points.map(p => p.incidents)}
          delta={{ value: s.totals.thisMonth - s.totals.lastMonth, label: `vs ${s.totals.lastMonth} last month`, goodWhen: 'down' }} />
        <KpiCard label="Avg MTTR" value={s.avgMTTR === null ? '—' : formatMinutes(s.avgMTTR)} Icon={Timer} tone="secondary" spark={points.map(p => p.avgMTTR)}
          sub={s.avgMTTR === null ? 'No resolved incidents yet' : `${s.avgMTTR.toLocaleString()} minutes, report → resolved`} />
        <KpiCard label="Recurring rate" value={`${s.recurringRate}%`} Icon={RotateCw} tone="warning" sub="of incidents repeat an earlier one" />
        <KpiCard label="Resolution rate" value={`${s.resolutionRate}%`} Icon={CheckCircle2} tone="success" spark={points.map(p => p.resolved)} sub={`${s.totals.open} still open`} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Trends</h2>
        <Tabs value={String(days)} onValueChange={v => setDays(Number(v) as (typeof RANGES)[number])}>
          <TabsList aria-label="Time range">
            {RANGES.map(r => <TabsTrigger key={r} value={String(r)}>{r} days</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="MTTR trend" description={`Average minutes to resolve, by day resolved (last ${days} days, UTC)`}
          table={{ columns: ['Day', 'Resolved', 'Avg MTTR'], rows: points.filter(p => p.resolved).map(p => [p.day, p.resolved, formatMinutes(p.avgMTTR)]) }}>
          <TrendLine data={points.map(p => ({ day: p.day, value: p.avgMTTR }))} valueLabel="Avg MTTR" format={formatMinutes} />
        </ChartCard>
        <ChartCard title="Incidents per day"
          description={trends.data ? `${trends.data.thisWeek} in the last 7 days vs ${trends.data.lastWeek} the week before` : undefined}
          table={{ columns: ['Day', 'Incidents', 'P1', 'P2', 'P3', 'P4'], rows: points.filter(p => p.incidents).map(p => [p.day, p.incidents, p.P1, p.P2, p.P3, p.P4]) }}>
          <DailyColumns data={points.map(p => ({ day: p.day, value: p.incidents }))} unit="incident" />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Incidents by severity" table={{ columns: ['Severity', 'Incidents'], rows: severity.map(d => [d.label, d.value]) }}>
          <DonutChart data={severity} unit="incident" />
        </ChartCard>
        <ChartCard title="Status distribution" table={{ columns: ['Status', 'Incidents'], rows: status.map(d => [d.label, d.value]) }}>
          <HBarChart data={status} unit="incident" />
        </ChartCard>
        <ChartCard title="Incidents by system" description="Top 10 · an incident can affect several systems" className="lg:col-span-2"
          table={{
            columns: ['System', 'Incidents', 'Open', 'Recurring', 'Avg MTTR'],
            rows: (systems.data ?? []).map(r => [r.system, r.incidents, r.open, r.recurring, formatMinutes(r.avgMTTR)])
          }}>
          <HBarChart data={bySystem} unit="incident" />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top recurring incidents</CardTitle>
          <CardDescription>Prime candidates for a permanent fix</CardDescription>
        </CardHeader>
        <CardContent>
          {s.topRecurring.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incident has recurred yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">Incident</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Count</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Avg MTTR</th>
                    <th scope="col" className="py-2 font-medium">Last occurrence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {s.topRecurring.map(r => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3">
                        <Link href={`/incidents/${r.id}`} className="flex items-center gap-2 hover:text-primary hover:underline">
                          <SeverityBadge severity={r.severity} /> <span className="line-clamp-1">{r.title}</span>
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{r.count}×</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatMinutes(r.avgMTTR)}</td>
                      <td className="py-2 text-muted-foreground">{timeAgo(r.lastOccurrence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Department contribution</CardTitle>
          </CardHeader>
          <CardContent>
            {!teams.data ? <LoadingRows count={2} /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">Department</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Incidents</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Top solver</th>
                      <th scope="col" className="py-2 text-right font-medium">Avg MTTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {teams.data.teams.map(t => (
                      <tr key={t.department}>
                        <td className="py-2 pr-3 font-medium">{t.department}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{t.incidents}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{t.topSolver ?? '—'}</td>
                        <td className="py-2 text-right tabular-nums">{formatMinutes(t.avgMTTR)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top solvers</CardTitle>
            <CardDescription>Ranked by verified solutions</CardDescription>
          </CardHeader>
          <CardContent>
            {!teams.data ? <LoadingRows count={2} /> : teams.data.topSolvers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No solutions recorded yet.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-border text-sm">
                {teams.data.topSolvers.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-3 py-2">
                    <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="flex-1 font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{p.verified} verified · {p.solutions} total</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {teams.data && teams.data.heatmap.length > 0 && <DepartmentHeatmap heatmap={teams.data.heatmap} />}
    </div>
  )
}

function DepartmentHeatmap({ heatmap }: { heatmap: { department: string; system: string; count: number }[] }): React.JSX.Element {
  const departments = [...new Set(heatmap.map(h => h.department))].sort()
  const systems = [...new Set(heatmap.map(h => h.system))].sort()
  const lookup = new Map(heatmap.map(h => [`${h.department}|${h.system}`, h.count]))
  return (
    <ChartCard title="Hot spots: department × system" description="Darker cells mean more incidents"
      table={{ columns: ['Department', 'System', 'Incidents'], rows: heatmap.map(h => [h.department, h.system, h.count]) }}>
      <Heatmap rows={departments} columns={systems} value={(r, c) => lookup.get(`${r}|${c}`) ?? 0} />
    </ChartCard>
  )
}
