'use client'

import {
  Activity, AlertOctagon, ArrowRightLeft, BarChart3, Bell, Building2, Check, CheckCircle2, ChevronsUpDown, LayoutDashboard,
  ListTree, Plus, RotateCw, Search, Settings, ShieldCheck, Sparkles, Timer, Users, X
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DailyColumns } from '@/components/charts'
import { SeverityBadge, StatusBadge, SystemTag } from '@/components/incident-badges'
import KpiCard from '@/components/KpiCard'
import { LogoMark } from '@/components/Logo'
import { cn } from '@/lib/utils'

/*
 * Product "screenshots" for the landing page: the app's own components rendered with demo data, so
 * they always match the real UI, stay sharp at any size and follow light/dark mode. Everything is
 * `inert` (not focusable or clickable) and described by one label for screen readers.
 */

/** Browser-window chrome around a preview. */
export function BrowserFrame({ path, label, children, className }: {
  path: string
  label: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <figure role="img" aria-label={label} className={cn('ui-card overflow-hidden rounded-2xl p-0 shadow-lg', className)}>
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-2.5" aria-hidden="true">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-danger/70" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
        </span>
        <span className="mx-auto flex min-w-0 max-w-xs flex-1 items-center justify-center gap-1.5 truncate rounded-md bg-surface/80 px-3 py-1 font-mono text-[11px] text-muted-foreground">
          <LogoMark className="size-3.5 rounded-[4px] shadow-none" /> nexora{path}
        </span>
        <span className="w-12" />
      </div>
      <div inert className="pointer-events-none select-none">{children}</div>
    </figure>
  )
}

/* ---------- Demo data ---------- */

const DAYS = Array.from({ length: 14 }, (_, n) => {
  const d = new Date(Date.UTC(2026, 8, 27 + n))
  return d.toISOString().slice(0, 10)
})
const DAILY = [3, 5, 2, 6, 4, 7, 3, 2, 5, 4, 3, 2, 2, 1]
const SPARK_OPEN = [9, 11, 10, 12, 10, 9, 8, 8, 7, 7, 6, 6, 5, 5]
const SPARK_P1 = [2, 2, 3, 2, 1, 2, 1, 1, 1, 0, 1, 0, 0, 1]
const SPARK_MTTR = [190, 170, 175, 150, 140, 132, 120, 110, 104, 96, 90, 84, 79, 74]
const SPARK_REC = [31, 30, 29, 28, 27, 25, 24, 22, 21, 20, 19, 18, 18, 17]

const RECENT = [
  { title: 'Checkout returns 504 — DB connection pool exhausted', sev: 'P1', status: 'INVESTIGATING', who: 'Priya Nair', when: '4 min ago' },
  { title: 'Login emails delayed 20+ minutes after provider failover', sev: 'P2', status: 'OPEN', who: 'Marco Rossi', when: '38 min ago' },
  { title: 'Redis evicting session keys under peak traffic', sev: 'P2', status: 'RESOLVED', who: 'Aiko Tanaka', when: '2 h ago' },
  { title: 'Nightly export job stuck on locked rows', sev: 'P3', status: 'RESOLVED', who: 'Sam Okafor', when: 'yesterday' }
] as const

/* ---------- Hero: the dashboard ---------- */

const NAV = [
  { label: 'Dashboard', Icon: LayoutDashboard, on: true },
  { label: 'Incidents', Icon: ListTree, count: 5 },
  { label: 'Analytics', Icon: BarChart3 },
  { label: 'Members', Icon: Users },
  { label: 'Settings', Icon: Settings }
]

export function DashboardPreview(): React.JSX.Element {
  return (
    <div className="flex bg-background/40 text-left">
      <aside className="hidden w-48 shrink-0 flex-col gap-1 border-r border-border bg-surface/60 p-3 md:flex">
        <div className="mb-3 flex items-center gap-2 px-1">
          <LogoMark className="size-7" />
          <span className="leading-tight">
            <span className="block font-display text-[13px] font-bold">Nexora</span>
            <span className="block text-[10px] text-muted-foreground">Acme Cloud</span>
          </span>
        </div>
        <span className="ui-btn-primary mb-2 flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
          <Plus className="size-3.5" /> Report incident
        </span>
        {NAV.map(({ label, Icon, on, count }) => (
          <span key={label} aria-current={on ? 'page' : undefined} className="nav-item py-1.5 text-[12px]">
            <Icon className="size-3.5" /> <span className="flex-1">{label}</span>
            {count && <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold">{count}</span>}
          </span>
        ))}
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex h-11 items-center gap-2 border-b border-border px-4">
          <span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px]">
            <Building2 className="size-3 text-muted-foreground" /> Acme Cloud <ChevronsUpDown className="size-3 text-muted-foreground" />
          </span>
          <span className="flex flex-1 items-center gap-1.5 rounded-md border border-border bg-surface/70 px-2 py-1 text-[11px] text-muted-foreground">
            <Search className="size-3" /> Search incidents, people, systems…
          </span>
          <span className="relative"><Bell className="size-4 text-muted-foreground" /><span className="absolute -right-1 -top-1 size-2 rounded-full bg-danger" /></span>
          <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[9px] font-bold text-secondary-foreground">PN</span>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div>
            <p className="eyebrow text-[9px] text-info-foreground">Thursday, 10 October</p>
            <p className="font-display text-lg font-bold tracking-tight">Good morning, Priya</p>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 [&_.ui-card]:p-3 [&_.ui-label-mono]:text-[11px]">
            <KpiCard label="Open incidents" value={5} Icon={Activity} tone="primary" sub="148 all time" spark={SPARK_OPEN} />
            <KpiCard label="Open P1s" value={1} Icon={AlertOctagon} tone="danger" sub="Needs attention now" spark={SPARK_P1} />
            <KpiCard label="Avg MTTR" value="1h 14m" Icon={Timer} tone="secondary" sub="↓ 61% in 14 days" spark={SPARK_MTTR} />
            <KpiCard label="Recurring rate" value="17%" Icon={RotateCw} tone="warning" sub="92% resolved overall" spark={SPARK_REC} />
          </div>
          <div className="grid gap-3 lg:grid-cols-5">
            <div className="ui-card p-3 lg:col-span-3">
              <p className="mb-2 text-[12px] font-semibold">Recent incidents</p>
              <ul className="flex flex-col">
                {RECENT.map(i => (
                  <li key={i.title} className={cn('flex items-center gap-2 border-b border-border py-1.5 last:border-0', `sev-${i.sev}`)}>
                    <span className="sev-dot size-2 shrink-0 rounded-full" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium">{i.title}</span>
                      <span className="text-[10px] text-muted-foreground">{i.who} · {i.when}</span>
                    </span>
                    <span className="hidden scale-90 sm:inline-flex"><SeverityBadge severity={i.sev} /></span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="ui-card hidden p-3 lg:col-span-2 lg:block">
              <p className="text-[12px] font-semibold">Incidents per day</p>
              <div className="-mx-2 h-40 [&>div]:!h-40">
                <DailyColumns data={DAYS.map((day, n) => ({ day, value: DAILY[n] ?? 0 }))} unit="incident" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Floating notifications for the hero ---------- */

export function MatchToast({ className }: { className?: string }): React.JSX.Element {
  return (
    <div aria-hidden="true" className={cn('ui-card w-72 p-3 text-left shadow-lg', className)}>
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-info-foreground"><Sparkles className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold">Seen this before — 87% match</span>
          <span className="block truncate text-[11px] text-muted-foreground">“API timeouts when Postgres pool saturates”</span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
        <Badge variant="success"><CheckCircle2 /> Verified fix</Badge>
        <span className="text-muted-foreground">fixed in 12 min last time</span>
      </div>
    </div>
  )
}

export function ApprovalToast({ className }: { className?: string }): React.JSX.Element {
  return (
    <div aria-hidden="true" className={cn('ui-card flex w-64 items-center gap-2.5 p-3 text-left shadow-lg', className)}>
      <span className="flex size-8 items-center justify-center rounded-full bg-success-soft text-success-foreground"><Check className="size-4" /></span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold">Aiko joined Acme Cloud</span>
        <span className="block text-[11px] text-muted-foreground">Approved by Priya · QA verifier</span>
      </span>
    </div>
  )
}

/* ---------- Showcase 1: report → match ---------- */

function Meter({ value }: { value: number }): React.JSX.Element {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${value}%` }} />
      </span>
      <span className="font-display text-sm font-bold tabular-nums">{value}%</span>
    </span>
  )
}

const MATCHES = [
  {
    title: 'API timeouts when Postgres connection pool saturates',
    symptoms: 'Requests hang ~30s then 504. Pool at max 20, queries themselves fast — connections held by a leaked transaction.',
    similarity: 87, meaning: true, sev: 'P1', status: 'RESOLVED', systems: ['Database', 'API'], recurred: 3,
    fix: 'Set idle_in_transaction_session_timeout and close the leaked transaction in the retry wrapper.', verified: true, time: '12 min'
  },
  {
    title: 'Payments service slow after ORM upgrade',
    symptoms: 'Latency spike on /checkout; connection count climbing until restart.',
    similarity: 64, meaning: false, sev: 'P2', status: 'CLOSED', systems: ['Payments', 'Database'], recurred: 1,
    fix: 'Pinned the pool size and rolled the ORM back to 4.2.', verified: false, time: '45 min'
  }
] as const

export function MatchPreview(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 bg-background/40 p-4 text-left">
      <div className="ui-card flex flex-col gap-1 p-3">
        <span className="eyebrow text-[9px] text-info-foreground">Just reported</span>
        <span className="text-[13px] font-semibold">Checkout returns 504 — DB connection pool exhausted</span>
        <span className="flex flex-wrap gap-1"><SeverityBadge severity="P1" /><SystemTag system="Database" highlight /><SystemTag system="API" highlight /></span>
      </div>
      <p className="px-1 text-[12px] font-semibold">2 past incidents look like this one</p>
      {MATCHES.map(m => (
        <div key={m.title} className="ui-card flex flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[12px] font-semibold leading-snug">{m.title}</span>
            <Meter value={m.similarity} />
          </div>
          <p className="line-clamp-2 text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Symptoms: </span>{m.symptoms}</p>
          <div className="flex flex-wrap items-center gap-1">
            {m.meaning && <Badge><Sparkles /> Similar meaning</Badge>}
            {m.systems.map(s => <SystemTag key={s} system={s} highlight />)}
            {m.recurred > 1 && <Badge variant="warning"><RotateCw /> Recurred {m.recurred}×</Badge>}
            <StatusBadge status={m.status} />
          </div>
          <div className="rounded-md border border-border bg-muted/50 p-2 text-[11px]">
            <span className="mb-1 flex items-center gap-1.5 font-semibold">
              {m.verified ? <><ShieldCheck className="size-3.5 text-success" /> Verified fix</> : 'Suggested fix'} · {m.time}
            </span>
            {m.fix}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- Showcase 2: analytics ---------- */

const RECURRING = [
  { title: 'DB connection pool exhausted', count: 6, mttr: '38m' },
  { title: 'Cert renewal missed on edge proxy', count: 4, mttr: '1h 05m' },
  { title: 'Queue consumer lag after deploy', count: 3, mttr: '52m' }
]
const HEAT_ROWS = ['SRE', 'Platform', 'Data']
const HEAT_COLS = ['API', 'Database', 'Cache', 'Network']
const HEAT = [[8, 11, 3, 2], [4, 6, 7, 5], [1, 9, 2, 0]]

export function AnalyticsPreview(): React.JSX.Element {
  const max = Math.max(...HEAT.flat())
  return (
    <div className="grid gap-3 bg-background/40 p-4 text-left sm:grid-cols-2">
      <div className="ui-card p-3 sm:col-span-2">
        <div className="flex items-baseline justify-between">
          <p className="text-[12px] font-semibold">Incidents per day</p>
          <p className="text-[11px] text-muted-foreground">last 14 days · <span className="font-semibold text-success-foreground">↓ 38%</span></p>
        </div>
        <div className="-mx-2 h-36 [&>div]:!h-36">
          <DailyColumns data={DAYS.map((day, n) => ({ day, value: DAILY[n] ?? 0 }))} unit="incident" />
        </div>
      </div>
      <div className="ui-card p-3">
        <p className="mb-2 text-[12px] font-semibold">Keeps coming back</p>
        <ol className="flex flex-col gap-2">
          {RECURRING.map((r, n) => (
            <li key={r.title} className="flex items-center gap-2 text-[11px]">
              <span className="flex size-5 items-center justify-center rounded-md bg-warning-soft font-bold text-warning-foreground">{n + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
              <span className="tabular-nums text-muted-foreground">{r.count}× · {r.mttr}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="ui-card p-3">
        <p className="mb-2 text-[12px] font-semibold">Where incidents land</p>
        <div className="grid grid-cols-[auto_repeat(4,1fr)] gap-1 text-[10px]">
          <span />
          {HEAT_COLS.map(c => <span key={c} className="truncate text-center text-muted-foreground">{c}</span>)}
          {HEAT_ROWS.map((r, i) => (
            <div key={r} className="contents">
              <span className="pr-1 text-muted-foreground">{r}</span>
              {HEAT_COLS.map((c, j) => {
                const v = HEAT[i]?.[j] ?? 0
                return (
                  <span key={c} className="flex h-6 items-center justify-center rounded font-semibold tabular-nums"
                    style={{ background: `rgb(var(--primary) / ${0.08 + 0.8 * (v / max)})`, color: v / max > 0.5 ? 'white' : undefined }}>
                    {v}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- Showcase 3: organizations & approvals ---------- */

const ORGS = [
  { name: 'Acme Cloud', role: 'Admin', current: true },
  { name: 'Brightline Health', role: 'Reporter' },
  { name: 'Freelance — Studio North', role: 'QA verifier' }
]
const REQUESTS = [
  { name: 'Aiko Tanaka', title: 'Site Reliability Engineer · SRE', note: 'Joined the platform on-call rotation this week.' },
  { name: 'Diego Alvarez', title: 'Backend Engineer · Platform', note: null }
]

export function OrganizationsPreview(): React.JSX.Element {
  return (
    <div className="grid gap-3 bg-background/40 p-4 text-left sm:grid-cols-5">
      <div className="ui-card flex flex-col gap-1 p-2 sm:col-span-2">
        <p className="eyebrow px-2 pt-1 text-[9px]">Your organizations</p>
        {ORGS.map(o => (
          <span key={o.name} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5', o.current && 'bg-primary-soft')}>
            <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium">{o.name}</span>
              <span className="block text-[10px] text-muted-foreground">{o.role}</span>
            </span>
            {o.current ? <Check className="size-3.5 text-primary" /> : <ArrowRightLeft className="size-3 text-muted-foreground" />}
          </span>
        ))}
        <span className="mt-1 flex items-center gap-1.5 border-t border-border px-2 pt-2 text-[11px] text-muted-foreground">
          <Plus className="size-3.5" /> Join another organization
        </span>
      </div>
      <div className="ui-card flex flex-col gap-2 p-3 sm:col-span-3">
        <p className="flex items-center gap-2 text-[12px] font-semibold">Join requests <Badge variant="warning">2</Badge></p>
        {REQUESTS.map(r => (
          <div key={r.name} className="flex flex-col gap-1.5 border-b border-border pb-2 last:border-0 last:pb-0">
            <span className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[9px] font-bold text-secondary-foreground">
                {r.name.split(' ').map(p => p[0]).join('')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold">{r.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{r.title}</span>
              </span>
            </span>
            {r.note && <span className="rounded bg-muted/60 px-2 py-1 text-[10px]">“{r.note}”</span>}
            <span className="flex gap-1.5">
              <span className="flex items-center gap-1 rounded-md bg-success px-2 py-1 text-[10px] font-semibold text-white dark:text-background"><Check className="size-3" /> Approve</span>
              <span className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold"><X className="size-3" /> Decline</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
