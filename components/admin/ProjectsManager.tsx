'use client'

import { useState } from 'react'
import { AlertTriangle, Archive, ArchiveRestore, Loader2, Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorNotice, LoadingRows } from '@/components/states'
import { postJson } from '@/hooks/api'
import { useProjects } from '@/hooks/useIncidents'
import {
  CRITICALITIES, CRITICALITY_LABEL, DEFAULT_SLA, ROLE_LABEL, SEVERITIES, SEVERITY_LABEL, isOneOf, ROLES,
  type Criticality, type Severity
} from '@/lib/constants'
import type { OrgMemberOption, ProjectDTO, SlaPolicyDTO } from '@/lib/types'
import { allowedOutageMinutes } from '@/lib/sla'
import { cn, formatMinutes } from '@/lib/utils'

const CRITICALITY_BADGE: Record<Criticality, 'danger' | 'warning' | 'default' | 'neutral'> = {
  CRITICAL: 'danger', HIGH: 'warning', MEDIUM: 'default', LOW: 'neutral'
}

/** Projects and their SLA targets. Changes apply to incidents reported from now on. */
export default function ProjectsManager({ members }: { members: OrgMemberOption[] }): React.JSX.Element {
  const { projects, error, isLoading, mutate } = useProjects(true)
  const [editing, setEditing] = useState<ProjectDTO | 'new' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const setArchived = async (p: ProjectDTO, archived: boolean): Promise<void> => {
    setBusyId(p.id)
    setActionError(null)
    try {
      await postJson(`/api/projects/${p.id}`, { archived }, 'PATCH')
      await mutate()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the project')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tag incidents with the projects they affect. Each project&apos;s targets set the response and resolve deadlines of its
          incidents; when an incident hits several projects, the strictest target applies.
        </p>
        <Button onClick={() => setEditing('new')}><Plus aria-hidden="true" /> New project</Button>
      </div>
      {actionError && <ErrorNotice message={actionError} />}

      {error ? <ErrorNotice message={error.message} onRetry={() => void mutate()} />
        : isLoading ? <LoadingRows count={3} />
        : projects.length === 0 ? (
          <EmptyState title="No projects yet" action={<Button onClick={() => setEditing('new')}><Plus aria-hidden="true" /> Add your first project</Button>}>
            Add the products and services your customers depend on, such as &ldquo;Checkout API&rdquo; or &ldquo;Customer portal&rdquo;.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {projects.map(p => (
              <li key={p.id}>
                <Card className={cn('flex h-full flex-col gap-3 p-5', p.archived && 'opacity-60')}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                        {p.name}
                        <Badge variant={CRITICALITY_BADGE[p.criticality]}>{CRITICALITY_LABEL[p.criticality]}</Badge>
                        {p.archived && <Badge variant="outline">Archived</Badge>}
                      </h3>
                      {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Pencil /></Button>
                      <Button variant="ghost" size="icon" disabled={busyId === p.id} aria-label={p.archived ? `Restore ${p.name}` : `Archive ${p.name}`}
                        title={p.archived ? 'Restore' : 'Archive (history is kept)'} onClick={() => void setArchived(p, !p.archived)}>
                        {busyId === p.id ? <Loader2 className="animate-spin" /> : p.archived ? <ArchiveRestore /> : <Archive />}
                      </Button>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Project lead</dt>
                      <dd className="truncate font-medium" title={p.owner?.email}>{p.owner?.name ?? '—'}</dd>
                      {p.owner && !p.owner.active && (
                        <dd className="flex items-center gap-1 text-xs text-warning-foreground">
                          <AlertTriangle className="size-3" aria-hidden="true" /> No longer a member: pick a new lead
                        </dd>
                      )}
                    </div>
                    <Fact label="Uptime target" value={`${p.availabilityTarget}%`} />
                    <Fact label="Cost / outage min" value={p.downtimeCostPerMinute ? p.downtimeCostPerMinute.toLocaleString() : '—'} />
                    <Fact label="Incidents" value={String(p.incidentCount)} />
                  </dl>
                  <div className="mt-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <caption className="sr-only">SLA targets for {p.name}</caption>
                      <thead className="ui-label-mono text-left text-xs text-muted-foreground">
                        <tr><th scope="col" className="px-3 py-1.5">Severity</th><th scope="col" className="px-3 py-1.5">Respond within</th><th scope="col" className="px-3 py-1.5">Resolve within</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {SEVERITIES.map(s => {
                          const policy = p.slaPolicies.find(x => x.severity === s)
                          return (
                            <tr key={s}>
                              <th scope="row" className={cn('px-3 py-1.5 text-left font-medium', `sev-${s}`)}>{s}</th>
                              <td className="px-3 py-1.5 tabular-nums">{policy ? formatMinutes(policy.responseMinutes) : <span className="text-muted-foreground">No SLA</span>}</td>
                              <td className="px-3 py-1.5 tabular-nums">{policy ? formatMinutes(policy.resolveMinutes) : ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

      <Dialog open={editing !== null} onOpenChange={open => { if (!open) setEditing(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'New project' : `Edit ${editing?.name ?? ''}`}</DialogTitle>
            <DialogDescription>Targets apply to incidents reported from now on. Open incidents keep the deadlines they were given.</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <ProjectForm
              key={editing === 'new' ? 'new' : editing.id}
              project={editing === 'new' ? null : editing}
              members={members}
              onSaved={() => { setEditing(null); void mutate() }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium" title={value}>{value}</dd>
    </div>
  )
}

/* ---------- Form ---------- */

type PolicyRow = { enabled: boolean; responseMinutes: number; resolveMinutes: number }

const initialPolicies = (project: ProjectDTO | null): Record<Severity, PolicyRow> =>
  Object.fromEntries(SEVERITIES.map(s => {
    const existing = project?.slaPolicies.find(p => p.severity === s)
    // A new project starts with suggested targets for every severity
    return [s, existing ? { enabled: true, ...existing } : { enabled: project === null, ...DEFAULT_SLA[s] }]
  })) as Record<Severity, PolicyRow>

const NO_LEAD = '__none__'

function ProjectForm({ project, members, onSaved }: { project: ProjectDTO | null; members: OrgMemberOption[]; onSaved: () => void }): React.JSX.Element {
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [ownerId, setOwnerId] = useState(project?.owner?.id ?? '')
  // A lead who has left stays visible (so the admin sees why) but cannot be re-saved by the API
  const formerLead = project?.owner && !members.some(m => m.id === project.owner?.id) ? project.owner : null
  const [criticality, setCriticality] = useState<Criticality>(project?.criticality ?? 'MEDIUM')
  const [target, setTarget] = useState(String(project?.availabilityTarget ?? 99.9))
  const [cost, setCost] = useState(String(project?.downtimeCostPerMinute ?? 0))
  const [policies, setPolicies] = useState(initialPolicies(project))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetNumber = Number(target)
  const budget = Number.isFinite(targetNumber) ? allowedOutageMinutes(targetNumber, 30 * 24 * 60) : null
  const setPolicy = (s: Severity, patch: Partial<PolicyRow>): void => setPolicies(p => ({ ...p, [s]: { ...p[s], ...patch } }))

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const slaPolicies: SlaPolicyDTO[] = SEVERITIES.filter(s => policies[s].enabled)
      .map(s => ({ severity: s, responseMinutes: policies[s].responseMinutes, resolveMinutes: policies[s].resolveMinutes }))
    const body = {
      name, description, ownerId: ownerId || null, criticality,
      availabilityTarget: targetNumber,
      downtimeCostPerMinute: Math.round(Number(cost) || 0),
      slaPolicies
    }
    try {
      await (project ? postJson(`/api/projects/${project.id}`, body, 'PATCH') : postJson('/api/projects', body))
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the project')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="p-name">Name</Label>
          <Input id="p-name" value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="Checkout API" required />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="p-desc">Description (optional)</Label>
          <Input id="p-desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} placeholder="What customers use it for" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-owner">Project lead</Label>
          <Select value={ownerId || NO_LEAD} onValueChange={v => { if (v) setOwnerId(v === NO_LEAD ? '' : v) }}>
            <SelectTrigger id="p-owner" aria-describedby="p-owner-hint"><SelectValue placeholder="Pick a member" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LEAD}>No lead (admins get the alerts)</SelectItem>
              {formerLead && <SelectItem value={formerLead.id} disabled>{formerLead.name} (no longer a member)</SelectItem>}
              {members.map(m => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} · {isOneOf(ROLES, m.role) ? ROLE_LABEL[m.role] : m.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="p-owner-hint" className={cn('text-xs', formerLead && ownerId === formerLead.id ? 'text-warning-foreground' : 'text-muted-foreground')}>
            {formerLead && ownerId === formerLead.id
              ? `${formerLead.name} has left the organization. Pick an active member.`
              : 'An active member of your organization. Gets SLA warnings and breaches.'}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-crit">Business criticality</Label>
          <Select value={criticality} onValueChange={v => setCriticality(v as Criticality)}>
            <SelectTrigger id="p-crit"><SelectValue /></SelectTrigger>
            <SelectContent>{CRITICALITIES.map(c => <SelectItem key={c} value={c}>{CRITICALITY_LABEL[c]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-target">Monthly uptime target (%)</Label>
          <Input id="p-target" type="number" inputMode="decimal" step="0.01" min={90} max={100} value={target} onChange={e => setTarget(e.target.value)} />
          <p className="text-xs text-muted-foreground">{budget !== null ? `Allows about ${formatMinutes(budget)} of outage in a 30-day month` : ' '}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="p-cost">Cost of one outage minute</Label>
          <Input id="p-cost" type="number" inputMode="numeric" min={0} step={1} value={cost} onChange={e => setCost(e.target.value)} />
          <p className="text-xs text-muted-foreground">In your reporting currency; 0 leaves cost out of reports.</p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">SLA targets</legend>
        <div className="flex flex-col divide-y divide-border rounded-md border border-border">
          {SEVERITIES.map(s => {
            const row = policies[s]
            return (
              <div key={s} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                <div className="flex w-36 items-center gap-2">
                  <Checkbox id={`p-on-${s}`} checked={row.enabled} onCheckedChange={c => setPolicy(s, { enabled: c === true })} />
                  <Label htmlFor={`p-on-${s}`} className="font-normal">{SEVERITY_LABEL[s]}</Label>
                </div>
                {row.enabled ? (
                  <>
                    <DurationInput id={`p-resp-${s}`} label="Respond within" minutes={row.responseMinutes} onChange={m => setPolicy(s, { responseMinutes: m })} />
                    <DurationInput id={`p-res-${s}`} label="Resolve within" minutes={row.resolveMinutes} onChange={m => setPolicy(s, { resolveMinutes: m })} />
                  </>
                ) : <span className="text-sm text-muted-foreground">No SLA for {s} incidents</span>}
              </div>
            )
          })}
        </div>
      </fieldset>

      {error && <ErrorNotice message={error} />}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || name.trim().length === 0}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />} {project ? 'Save changes' : 'Create project'}
        </Button>
      </div>
    </form>
  )
}

const UNITS = [{ id: 'min', minutes: 1, label: 'min' }, { id: 'h', minutes: 60, label: 'hours' }, { id: 'd', minutes: 1440, label: 'days' }] as const
type Unit = (typeof UNITS)[number]['id']
const bestUnit = (minutes: number): Unit => (minutes % 1440 === 0 ? 'd' : minutes % 60 === 0 ? 'h' : 'min')
const unitMinutes = (u: Unit): number => UNITS.find(x => x.id === u)?.minutes ?? 1

/** A duration as a number and a unit; reports whole minutes. */
function DurationInput({ id, label, minutes, onChange }: { id: string; label: string; minutes: number; onChange: (minutes: number) => void }): React.JSX.Element {
  const [unit, setUnit] = useState<Unit>(bestUnit(minutes))
  const value = minutes / unitMinutes(unit)
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">{label}</Label>
      <Input id={id} type="number" min={1} step={unit === 'min' ? 1 : 0.5} className="h-9 w-20" value={Number.isInteger(value) ? value : value.toFixed(1)}
        onChange={e => onChange(Math.max(1, Math.round(Number(e.target.value) * unitMinutes(unit))))} />
      <Select value={unit} onValueChange={v => setUnit(v as Unit)}>
        <SelectTrigger className="h-9 w-24" aria-label={`${label} unit`}><SelectValue /></SelectTrigger>
        <SelectContent>{UNITS.map(u => <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

