'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Hand, Loader2, Pause, Pencil, Play, ShieldAlert, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ErrorNotice } from '@/components/states'
import { useSession } from '@/components/SessionProvider'
import { postJson } from '@/hooks/api'
import { useProjects } from '@/hooks/useIncidents'
import { IMPACTS, IMPACT_LABEL, type Impact } from '@/lib/constants'
import type { IncidentDetailDTO, SlaClock } from '@/lib/types'
import { cn, formatMinutes, timeAgo } from '@/lib/utils'

type Patch = {
  acknowledge?: true
  mitigated?: boolean
  slaPaused?: boolean
  impact?: Impact
  startedAt?: string | null
  projectIds?: string[]
}

const isOpen = (status: string): boolean => status === 'OPEN' || status === 'INVESTIGATING'

/** Re-renders every 30 seconds so countdowns move without refetching. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

const localInput = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** Response and resolve clocks, customer impact and downtime, with the actions that move them. */
export default function SlaPanel({ incident, onSaved }: { incident: IncidentDetailDTO; onSaved: (updated: IncidentDetailDTO) => void }): React.JSX.Element {
  const now = useNow()
  const { user, membership } = useSession()
  const canEdit = user.isSuperAdmin || (membership !== null && membership.role !== 'VIEWER')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingProjects, setEditingProjects] = useState(false)
  const [editingStart, setEditingStart] = useState(false)
  const open = isOpen(incident.status)
  const sla = incident.sla

  /** Sends one change; true when it was saved. */
  const save = async (key: string, patch: Patch): Promise<boolean> => {
    setBusy(key)
    setError(null)
    try {
      onSaved(await postJson<IncidentDetailDTO>(`/api/incidents/${incident.id}`, patch, 'PATCH'))
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
      return false
    } finally {
      setBusy(null)
    }
  }

  const impactStart = incident.startedAt ?? incident.createdAt
  const impactEnd = incident.mitigatedAt ?? incident.resolvedAt
  const downtime = incident.impact === 'NONE' ? null : Math.max(0, Math.round(((impactEnd ? Date.parse(impactEnd) : now) - Date.parse(impactStart)) / 60_000))

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2"><ShieldAlert className="size-4" aria-hidden="true" /> SLA & impact</CardTitle>
        {sla?.paused && <Badge variant="secondary"><Pause aria-hidden="true" /> Paused</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sla ? (
          <div className="flex flex-col gap-3">
            <ClockRow label="Response" clock={sla.response} now={now} doneLabel={incident.acknowledgedAt ? `Acknowledged ${timeAgo(incident.acknowledgedAt)}` : null} />
            <ClockRow label="Resolve" clock={sla.resolve} now={now} doneLabel={incident.resolvedAt ? `Resolved ${timeAgo(incident.resolvedAt)}` : null} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No SLA on this incident. {incident.projects.length ? 'Its projects have no target for this severity.' : 'Tag a project with SLA targets to start the clock.'}
          </p>
        )}

        {canEdit && open && (
          <div className="flex flex-wrap gap-2">
            {!incident.acknowledgedAt && (
              <Button size="sm" disabled={busy !== null} onClick={() => void save('ack', { acknowledge: true })}>
                {busy === 'ack' ? <Loader2 className="animate-spin" /> : <Hand aria-hidden="true" />} Acknowledge
              </Button>
            )}
            {sla && (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void save('pause', { slaPaused: !sla.paused })}
                title={sla.paused ? 'Restart the SLA clock' : 'Stop the SLA clock while waiting on the customer'}>
                {busy === 'pause' ? <Loader2 className="animate-spin" /> : sla.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                {sla.paused ? 'Resume SLA clock' : 'Waiting on customer'}
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="sla-impact" className="text-sm">Customer impact</Label>
            {canEdit ? (
              <Select value={incident.impact} disabled={busy !== null} onValueChange={v => { if (v && v !== incident.impact) void save('impact', { impact: v as Impact }) }}>
                <SelectTrigger id="sla-impact" className="h-9 w-52"><SelectValue /></SelectTrigger>
                <SelectContent>{IMPACTS.map(i => <SelectItem key={i} value={i}>{IMPACT_LABEL[i]}</SelectItem>)}</SelectContent>
              </Select>
            ) : <span className="text-sm font-medium">{IMPACT_LABEL[incident.impact]}</span>}
          </div>

          {incident.impact !== 'NONE' && (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Impact started</dt>
                  <dd className="flex items-center gap-1 font-medium">
                    <time dateTime={impactStart}>{new Date(impactStart).toLocaleString()}</time>
                    {canEdit && <Button variant="ghost" size="icon" className="size-6" aria-label="Change when impact started" onClick={() => setEditingStart(e => !e)}><Pencil className="size-3" /></Button>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{incident.impact === 'OUTAGE' ? 'Downtime' : 'Degraded for'}</dt>
                  <dd className={cn('font-medium tabular-nums', !impactEnd && 'text-danger-foreground')}>{formatMinutes(downtime)}{!impactEnd && ' and counting'}</dd>
                </div>
              </dl>
              {editingStart && canEdit && (
                <StartEditor initial={localInput(incident.startedAt)} busy={busy === 'start'}
                  onSave={value => void save('start', { startedAt: value }).then(ok => { if (ok) setEditingStart(false) })} />
              )}
              {canEdit && (incident.mitigatedAt ? (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 text-success-foreground"><CheckCircle2 className="size-4" aria-hidden="true" /> Service restored {timeAgo(incident.mitigatedAt)}</span>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void save('mitigate', { mitigated: false })}>Undo</Button>
                </div>
              ) : !incident.resolvedAt && (
                <Button size="sm" variant="outline" className="self-start" disabled={busy !== null} onClick={() => void save('mitigate', { mitigated: true })}>
                  {busy === 'mitigate' ? <Loader2 className="animate-spin" /> : <Wrench aria-hidden="true" />} Service restored
                </Button>
              ))}
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Projects</span>
            {canEdit && <Button variant="ghost" size="sm" onClick={() => setEditingProjects(e => !e)}>{editingProjects ? 'Done' : 'Edit'}</Button>}
          </div>
          {editingProjects && canEdit
            ? <ProjectPicker selected={incident.projects.map(p => p.id)} busy={busy === 'projects'} onChange={ids => void save('projects', { projectIds: ids })} />
            : incident.projects.length
              ? <div className="flex flex-wrap gap-1.5">{incident.projects.map(p => <Badge key={p.id} variant="neutral">{p.name}</Badge>)}</div>
              : <p className="text-sm text-muted-foreground">None</p>}
        </div>

        {error && <ErrorNotice message={error} />}
      </CardContent>
    </Card>
  )
}

const STATE_BADGE: Record<SlaClock['state'], { variant: 'success' | 'danger' | 'warning' | 'secondary' | 'default'; label: string }> = {
  met: { variant: 'success', label: 'Met' },
  breached: { variant: 'danger', label: 'Breached' },
  at_risk: { variant: 'warning', label: 'At risk' },
  paused: { variant: 'secondary', label: 'Paused' },
  on_track: { variant: 'default', label: 'On track' }
}

function ClockRow({ label, clock, now, doneLabel }: { label: string; clock: SlaClock | null; now: number; doneLabel: string | null }): React.JSX.Element | null {
  if (!clock) return null
  // A running clock keeps counting on the client between refreshes
  const running = clock.state === 'on_track' || clock.state === 'at_risk'
  const remaining = running ? Math.floor((Date.parse(clock.dueAt) - now) / 60_000) : clock.remainingMinutes
  const state = running && remaining < 0 ? 'breached' : clock.state
  const badge = STATE_BADGE[state]
  // The whole allowance, recovered from the server's snapshot: remaining = budget × (1 − used)
  const budget = clock.usedRatio < 1 ? clock.remainingMinutes / (1 - clock.usedRatio) : 0
  const used = Math.min(100, Math.max(0, running && budget > 0 ? (1 - remaining / budget) * 100 : clock.usedRatio * 100))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <span className="relative h-1.5 rounded-full bg-muted" aria-hidden="true">
        <span className={cn('absolute inset-y-0 left-0 rounded-full', state === 'breached' ? 'bg-danger' : state === 'at_risk' ? 'bg-warning' : state === 'met' ? 'bg-success' : 'bg-primary')}
          style={{ width: `${state === 'breached' ? 100 : used}%` }} />
      </span>
      <span className="text-xs text-muted-foreground">
        {doneLabel && (state === 'met' || state === 'breached') && !running ? `${doneLabel} · ` : ''}
        {state === 'paused' ? `${formatMinutes(remaining)} left when resumed`
          : remaining >= 0 ? (running ? `Due in ${formatMinutes(remaining)}` : `${formatMinutes(remaining)} to spare`)
          : `${formatMinutes(-remaining)} past due`}
        {' · '}due <time dateTime={clock.dueAt}>{new Date(clock.dueAt).toLocaleString()}</time>
      </span>
    </div>
  )
}

function StartEditor({ initial, busy, onSave }: { initial: string; busy: boolean; onSave: (iso: string | null) => void }): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const max = localInput(new Date().toISOString())
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="sla-start" className="text-xs">Impact started (your local time)</Label>
        <Input id="sla-start" type="datetime-local" max={max} value={value} onChange={e => setValue(e.target.value)} className="h-9" />
      </div>
      <Button size="sm" disabled={busy || !value} onClick={() => onSave(new Date(value).toISOString())}>{busy && <Loader2 className="animate-spin" />} Save</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(null)} title="Count from when it was reported">Clear</Button>
    </div>
  )
}

function ProjectPicker({ selected, busy, onChange }: { selected: string[]; busy: boolean; onChange: (ids: string[]) => void }): React.JSX.Element {
  const { projects, isLoading } = useProjects()
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading projects…</p>
  if (projects.length === 0) return <p className="text-sm text-muted-foreground">No projects yet. An admin adds them under Projects & SLAs.</p>
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {projects.map(p => {
          const on = selected.includes(p.id)
          return (
            <button key={p.id} type="button" aria-pressed={on} disabled={busy}
              onClick={() => onChange(on ? selected.filter(id => id !== p.id) : [...selected, p.id])}
              className={cn('ui-badge rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60',
                on ? 'border-primary bg-primary text-primary-foreground' : 'border-input hover:bg-muted')}>
              {p.name}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">Changing projects re-applies their SLA targets, measured from when this incident was reported.</p>
    </div>
  )
}
