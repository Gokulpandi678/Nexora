'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSWRConfig } from 'swr'
import {
  AlertOctagon, AlertTriangle, ArrowDown, Box, CheckCircle2, CreditCard, Database, Globe, HardDrive, KeyRound, Layers, Loader2, Mail,
  Minus, Monitor, Network, Server, Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ErrorNotice, FieldError } from '@/components/states'
import MatchResults, { type LinkOutcome } from '@/components/MatchResults'
import {
  DEPARTMENTS, IMPACTS, IMPACT_LABEL, LIMITS, SEVERITIES, SEVERITY_LABEL, SYSTEM_OPTIONS, type Department, type Impact, type Severity
} from '@/lib/constants'
import { useProjects } from '@/hooks/useIncidents'
import { createIncidentSchema } from '@/lib/validators'
import { useIdentityStore } from '@/lib/store'
import { ApiError, postJson } from '@/hooks/api'
import type { IncidentRef, SimilarIncident } from '@/lib/types'
import { cn } from '@/lib/utils'

interface FormState {
  title: string
  description: string
  symptoms: string
  initialFixes: string
  affectedSystems: string[]
  severity: Severity
  department: Department | ''
  estimatedMTTR: string
  createdBy: string
  email: string
  projectIds: string[]
  impact: Impact
  /** datetime-local value (the reporter's local time) */
  startedAt: string
}

const EMPTY: FormState = {
  title: '',
  description: '',
  symptoms: '',
  initialFixes: '',
  affectedSystems: [],
  severity: 'P3',
  department: '',
  estimatedMTTR: '',
  createdBy: '',
  email: '',
  projectIds: [],
  impact: 'NONE',
  startedAt: ''
}

const SEVERITY_HINT: Record<Severity, string> = {
  P1: 'Outage or data loss, many users',
  P2: 'Major feature broken, no workaround',
  P3: 'Degraded, workaround exists',
  P4: 'Cosmetic or low impact'
}

const SEVERITY_ICON: Record<Severity, typeof Minus> = { P1: AlertOctagon, P2: AlertTriangle, P3: Minus, P4: ArrowDown }

const SYSTEM_ICON: Record<string, typeof Database> = {
  Database, API: Server, Cache: Zap, Network, Auth: KeyRound, Storage: HardDrive, Queue: Layers,
  Frontend: Monitor, Payments: CreditCard, Email: Mail, Other: Box
}

type Step = 'details' | 'matches' | 'done'
const STEPS: { id: Step; label: string }[] = [
  { id: 'details', label: 'Describe' },
  { id: 'matches', label: 'Check matches' },
  { id: 'done', label: 'Done' }
]

const toIso = (local: string): string | undefined => {
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

const IMPACT_HINT: Record<Impact, string> = {
  NONE: 'Internal only, customers unaffected',
  DEGRADED: 'Slow or partly failing for customers',
  OUTAGE: 'Down for customers'
}

/** The latest moment a datetime-local input may pick: now, in local time. */
const nowLocal = (): string => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function toPayload(form: FormState): unknown {
  return {
    ...form,
    initialFixes: form.initialFixes || undefined,
    estimatedMTTR: form.estimatedMTTR === '' ? undefined : Number(form.estimatedMTTR),
    department: form.department || undefined,
    // A local date-time from the picker, sent as an absolute instant; no start time when there is no impact
    startedAt: form.impact !== 'NONE' && form.startedAt ? toIso(form.startedAt) : undefined
  }
}

export default function IncidentForm(): React.JSX.Element {
  const currentUser = useIdentityStore(s => s.currentUser)
  const { mutate } = useSWRConfig()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('details')
  const [created, setCreated] = useState<IncidentRef | null>(null)
  const [matches, setMatches] = useState<SimilarIncident[]>([])
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null)
  const { projects } = useProjects()

  // Reporter fields come from the signed-in account (the API enforces this too)
  useEffect(() => {
    if (!currentUser) return
    setForm(f => ({
      ...f,
      createdBy: f.createdBy || currentUser.name,
      email: f.email || currentUser.email,
      department: f.department || currentUser.department
    }))
  }, [currentUser])

  const validation = useMemo(() => createIncidentSchema.safeParse(toPayload(form)), [form])
  const errors: Partial<Record<keyof FormState, string>> = useMemo(() => {
    if (validation.success) return {}
    const out: Partial<Record<keyof FormState, string>> = {}
    for (const issue of validation.error.issues) {
      const key = issue.path[0] as keyof FormState
      out[key] ??= issue.message === 'Required' ? 'Required' : issue.message
    }
    return out
  }, [validation])

  const errorFor = (key: keyof FormState): string | undefined => (touched[key] || submitted ? errors[key] : undefined)
  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void => setForm(f => ({ ...f, [key]: value }))
  const touch = (key: keyof FormState) => (): void => setTouched(t => ({ ...t, [key]: true }))

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSubmitted(true)
    if (!validation.success) return
    setPending(true)
    setServerError(null)
    try {
      const result = await postJson<{ incident: IncidentRef; similarIncidents: SimilarIncident[] }>(
        '/api/incidents/create',
        toPayload(form)
      )
      setCreated(result.incident)
      setMatches(result.similarIncidents)
      setStep(result.similarIncidents.length ? 'matches' : 'done')
      void mutate(key => typeof key === 'string' && (key.startsWith('/api/incidents') || key.startsWith('/api/stats')))
    } catch (err) {
      setServerError(err instanceof ApiError || err instanceof Error ? err.message : 'Could not report the incident')
    } finally {
      setPending(false)
    }
  }

  const reset = (): void => {
    setForm({ ...EMPTY, createdBy: form.createdBy, email: form.email, department: form.department })
    setTouched({})
    setSubmitted(false)
    setCreated(null)
    setMatches([])
    setOutcome(null)
    setStep('details')
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper current={step} />

      {step === 'matches' && created && (
        <MatchResults
          incident={created}
          matches={matches}
          onDone={result => {
            setOutcome(result)
            setStep('done')
          }}
        />
      )}

      {step === 'done' && created && <DonePanel incident={created} outcome={outcome} onReportAnother={reset} />}

      {step === 'details' && (
        <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5"><StepNumber n={1} /> What happened?</CardTitle>
                <CardDescription>Specific error text and symptoms give the best matches against past incidents.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <TextField
                  id="title" label="Title" value={form.title} onChange={v => update('title', v)} onBlur={touch('title')}
                  error={errorFor('title')} min={LIMITS.title.min} max={LIMITS.title.max}
                  placeholder="e.g. Checkout API returns 504 after database connection pool exhaustion"
                />
                <TextField
                  id="description" label="Description" multiline rows={5} value={form.description}
                  onChange={v => update('description', v)} onBlur={touch('description')} error={errorFor('description')}
                  min={LIMITS.description.min} max={LIMITS.description.max}
                  hint="Markdown is supported. When did it start, who is affected, what changed recently?"
                  placeholder="What happened, when it started, and the impact on users…"
                />
                <TextField
                  id="symptoms" label="Symptoms" multiline rows={4} value={form.symptoms}
                  onChange={v => update('symptoms', v)} onBlur={touch('symptoms')} error={errorFor('symptoms')}
                  min={LIMITS.symptoms.min} max={LIMITS.symptoms.max}
                  placeholder="Exact error messages, status codes, log lines, dashboards showing the problem…"
                />
                <TextField
                  id="initialFixes" label="Already tried (optional)" multiline rows={2} value={form.initialFixes}
                  onChange={v => update('initialFixes', v)} max={LIMITS.initialFixes.max}
                  placeholder="Restarts, rollbacks, config changes you've attempted"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5"><StepNumber n={2} /> Impact</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <fieldset aria-describedby={errorFor('affectedSystems') ? 'affectedSystems-error' : undefined}>
                  <legend className="mb-2 text-sm font-medium">Affected systems</legend>
                  <div className="flex flex-wrap gap-2">
                    {SYSTEM_OPTIONS.map(system => {
                      const selected = form.affectedSystems.includes(system)
                      const Icon = SYSTEM_ICON[system] ?? Globe
                      return (
                        <button
                          key={system}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            touch('affectedSystems')()
                            update('affectedSystems', selected ? form.affectedSystems.filter(s => s !== system) : [...form.affectedSystems, system])
                          }}
                          className={cn(
                            'ui-badge inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground shadow-md'
                              : 'border-input bg-surface text-muted-foreground hover:border-primary/50 hover:text-foreground'
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                          {system}
                        </button>
                      )
                    })}
                  </div>
                  <FieldError id="affectedSystems-error" message={errorFor('affectedSystems')} />
                </fieldset>

                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Severity</legend>
                  <div role="radiogroup" aria-label="Severity" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {SEVERITIES.map(sev => {
                      const Icon = SEVERITY_ICON[sev]
                      const on = form.severity === sev
                      return (
                        <label
                          key={sev}
                          className={cn(
                            'ui-card relative flex cursor-pointer flex-col gap-1 overflow-hidden p-3.5 pt-4 transition-all focus-within:ring-2 focus-within:ring-ring hover:-translate-y-0.5',
                            `sev-${sev}`,
                            on ? 'shadow-md ring-2 ring-[rgb(var(--sev))]' : 'opacity-80 hover:opacity-100'
                          )}
                        >
                          <span className={cn('sev-dot absolute inset-x-0 top-0 transition-all', on ? 'h-1.5' : 'h-0.5')} aria-hidden="true" />
                          <input type="radio" name="severity" value={sev} checked={on}
                            onChange={() => update('severity', sev)} className="sr-only" />
                          <span className="flex items-center gap-2">
                            <Icon className="sev-text size-4" aria-hidden="true" />
                            <span className="text-sm font-semibold">{SEVERITY_LABEL[sev]}</span>
                            {on && <CheckCircle2 className="sev-text ml-auto size-4" aria-hidden="true" />}
                          </span>
                          <span className="text-xs text-muted-foreground">{SEVERITY_HINT[sev]}</span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>

                {projects.length > 0 && (
                  <fieldset aria-describedby={errorFor('projectIds') ? 'projectIds-error' : undefined}>
                    <legend className="mb-1 text-sm font-medium">Affected projects</legend>
                    <p className="mb-2 text-xs text-muted-foreground">Their SLAs set this incident&apos;s response and resolve deadlines.</p>
                    <div className="flex flex-wrap gap-2">
                      {projects.map(project => {
                        const selected = form.projectIds.includes(project.id)
                        return (
                          <button key={project.id} type="button" aria-pressed={selected}
                            onClick={() => update('projectIds', selected ? form.projectIds.filter(id => id !== project.id) : [...form.projectIds, project.id])}
                            className={cn(
                              'ui-badge inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all',
                              selected ? 'border-primary bg-primary text-primary-foreground shadow-md' : 'border-input bg-surface text-muted-foreground hover:border-primary/50 hover:text-foreground'
                            )}>
                            {project.name}
                          </button>
                        )
                      })}
                    </div>
                    <FieldError id="projectIds-error" message={errorFor('projectIds')} />
                  </fieldset>
                )}

                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Customer impact</legend>
                  <div role="radiogroup" aria-label="Customer impact" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {IMPACTS.map(impact => {
                      const on = form.impact === impact
                      return (
                        <label key={impact} className={cn(
                          'ui-card flex cursor-pointer flex-col gap-0.5 p-3 transition-all focus-within:ring-2 focus-within:ring-ring',
                          on ? 'shadow-md ring-2 ring-primary' : 'opacity-80 hover:opacity-100'
                        )}>
                          <input type="radio" name="impact" value={impact} checked={on} onChange={() => update('impact', impact)} className="sr-only" />
                          <span className="flex items-center gap-2 text-sm font-semibold">
                            {IMPACT_LABEL[impact]}
                            {on && <CheckCircle2 className="ml-auto size-4 text-primary" aria-hidden="true" />}
                          </span>
                          <span className="text-xs text-muted-foreground">{IMPACT_HINT[impact]}</span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-2">
                  {form.impact !== 'NONE' && (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="startedAt">When did customers start being affected? (optional)</Label>
                      <Input id="startedAt" type="datetime-local" max={nowLocal()} value={form.startedAt}
                        onChange={e => update('startedAt', e.target.value)} onBlur={touch('startedAt')}
                        aria-describedby={errorFor('startedAt') ? 'startedAt-error' : 'startedAt-hint'} />
                      <p id="startedAt-hint" className="text-xs text-muted-foreground">Leave empty if it started when you report it. Downtime counts from here.</p>
                      <FieldError id="startedAt-error" message={errorFor('startedAt')} />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="estimatedMTTR">How long has it persisted? (minutes, optional)</Label>
                    <Input id="estimatedMTTR" type="number" inputMode="numeric" min={0} value={form.estimatedMTTR}
                      onChange={e => update('estimatedMTTR', e.target.value)} placeholder="e.g. 30" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5"><StepNumber n={3} /> Reporter</CardTitle>
                <CardDescription>From your signed-in account.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <TextField id="createdBy" label="Name" value={form.createdBy} onChange={v => update('createdBy', v)}
                  onBlur={touch('createdBy')} error={errorFor('createdBy')} autoComplete="name" readOnly={Boolean(currentUser)} />
                <TextField id="email" label="Email" type="email" value={form.email} onChange={v => update('email', v)}
                  onBlur={touch('email')} error={errorFor('email')} autoComplete="email" readOnly={Boolean(currentUser)} />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="department">Department</Label>
                  <Select value={form.department} onValueChange={v => {
                    // Radix's hidden native select fires '' on mount inside a form; ignore it so the profile prefill survives
                    if (!v) return
                    update('department', v as Department)
                    touch('department')()
                  }}>
                    <SelectTrigger id="department" aria-invalid={Boolean(errorFor('department'))}
                      aria-describedby={errorFor('department') ? 'department-error' : undefined}>
                      <SelectValue placeholder="Choose a department" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.filter(d => d !== 'Unassigned').map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FieldError id="department-error" message={errorFor('department') && 'Choose a department'} />
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 lg:sticky lg:top-24">
              <QualityMeter form={form} errors={errors} />
              {serverError && <ErrorNotice message={serverError} />}
              {!validation.success && (
                <div className="rounded-md border border-border bg-muted/50 p-3" aria-live="polite">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Still needed</p>
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {[...new Set(Object.values(errors))].slice(0, 6).map(msg => <li key={msg}>{msg}</li>)}
                  </ul>
                </div>
              )}
              <Button type="submit" size="lg" disabled={pending || !validation.success}>
                {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {pending ? 'Reporting & checking history…' : 'Report & check for matches'}
              </Button>
              <p className="text-xs text-muted-foreground">
                We&apos;ll compare this against past incidents before anyone starts from scratch.
              </p>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}

interface TextFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  min?: number
  max?: number
  hint?: string
  placeholder?: string
  multiline?: boolean
  rows?: number
  type?: string
  autoComplete?: string
  readOnly?: boolean
}

function TextField({ id, label, value, onChange, onBlur, error, min, max, hint, multiline, rows, ...rest }: TextFieldProps): React.JSX.Element {
  const length = value.trim().length
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`, max && `${id}-count`].filter(Boolean).join(' ') || undefined
  const common = {
    id,
    value,
    onBlur,
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy,
    maxLength: max,
    ...rest
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {max !== undefined && (
          <span id={`${id}-count`} className={cn('text-xs tabular-nums', min && length > 0 && length < min ? 'text-warning-foreground' : 'text-subtle')}>
            {min && length < min ? `${length}/${min} min` : `${length}/${max}`}
          </span>
        )}
      </div>
      {multiline ? (
        <Textarea rows={rows} onChange={e => onChange(e.target.value)} {...common} />
      ) : (
        <Input onChange={e => onChange(e.target.value)} {...common} />
      )}
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}

function Stepper({ current }: { current: Step }): React.JSX.Element {
  const index = STEPS.findIndex(s => s.id === current)
  return (
    <ol className="ui-card flex items-center gap-2 self-start px-4 py-2.5 text-sm" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2" aria-current={i === index ? 'step' : undefined}>
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-full text-xs font-bold transition-all',
              i < index ? 'bg-success text-white dark:text-background' : i === index ? 'bg-primary text-primary-foreground shadow-md ring-4 ring-primary/15' : 'bg-muted text-muted-foreground'
            )}
          >
            {i < index ? <CheckCircle2 className="size-4" aria-label="Completed" /> : i + 1}
          </span>
          <span className={cn('ui-label-mono', i === index ? 'font-semibold' : 'text-muted-foreground')}>{s.label}</span>
          {i < STEPS.length - 1 && (
            <span className="mx-1 h-0.5 w-6 overflow-hidden rounded-full bg-border sm:w-12" aria-hidden="true">
              <span className={cn('block h-full bg-success transition-all duration-500', i < index ? 'w-full' : 'w-0')} />
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

function StepNumber({ n }: { n: number }): React.JSX.Element {
  return (
    <span className="flex size-6 items-center justify-center rounded-md bg-primary-soft font-sans text-xs font-bold text-info-foreground" aria-hidden="true">{n}</span>
  )
}

const QUALITY_CHECKS: { key: keyof FormState; label: string }[] = [
  { key: 'title', label: 'Clear title' },
  { key: 'description', label: 'Description' },
  { key: 'symptoms', label: 'Symptoms' },
  { key: 'affectedSystems', label: 'Affected systems' },
  { key: 'createdBy', label: 'Reporter' }
]

/** Concrete evidence (status codes, error names, log lines) makes history matching much better */
const EVIDENCE = /\b\d{3}\b|error|exception|timeout|log/i

/** How ready the report is, as one number plus a checklist. */
function QualityMeter({ form, errors }: { form: FormState; errors: Partial<Record<keyof FormState, string>> }): React.JSX.Element {
  const isDone = (key: keyof FormState): boolean => !errors[key] && !(key === 'createdBy' && (errors.email || errors.department))
  const passed = QUALITY_CHECKS.filter(c => isDone(c.key)).length
  const bonus = (form.initialFixes.trim() ? 1 : 0) + (EVIDENCE.test(form.symptoms) ? 1 : 0)
  const score = Math.round(((passed + bonus) / (QUALITY_CHECKS.length + 2)) * 100)
  const tone = score >= 85 ? 'bg-success' : score >= 50 ? 'bg-warning' : 'bg-danger'
  const verdict = score >= 85 ? 'Strong matches likely' : score >= 50 ? 'Getting there' : 'Just started'
  return (
    <div className="ui-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">Report quality</span>
        <span className="font-display text-2xl font-bold tabular-nums">{score}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn('h-full rounded-full transition-all duration-500', tone)} style={{ width: `${score}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{verdict}. Exact error text and log lines give the best matches.</p>
      <ul className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-xs" aria-label="Report checklist">
        {QUALITY_CHECKS.map(c => {
          const ok = isDone(c.key)
          return (
            <li key={c.key} className={cn('flex items-center gap-1.5', ok ? 'text-success-foreground' : 'text-muted-foreground')}>
              {ok ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <span className="size-3.5 rounded-full border-2 border-current opacity-50" aria-hidden="true" />}
              {c.label}<span className="sr-only">{ok ? ' (done)' : ' (to do)'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function DonePanel({ incident, outcome, onReportAnother }: { incident: IncidentRef; outcome: LinkOutcome | null; onReportAnother: () => void }): React.JSX.Element {
  return (
    <Card role="status" className="relative max-w-2xl animate-rise overflow-hidden border-success/40">
      <span className="absolute inset-x-0 top-0 h-1.5 bg-success" aria-hidden="true" />
      <CardHeader>
        <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success-foreground" aria-hidden="true">
          <CheckCircle2 className="size-6" />
        </span>
        <p className="flex items-center gap-2 text-sm font-semibold text-success-foreground">
          {outcome ? 'Linked to a past incident' : 'Logged as a new incident'}
        </p>
        <CardTitle className="text-lg">{incident.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {outcome
            ? <>Linked to <span className="font-medium text-foreground">{outcome.originalTitle}</span>. {outcome.notified
                ? `${outcome.ownerName} has been notified and can share what worked last time.`
                : `${outcome.ownerName} was not emailed (you own both incidents, or they were already notified).`}</>
            : 'No earlier incident matched, so this starts a new record. Once it is fixed, add the solution so the next person finds it.'}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href={`/incidents/${incident.id}`}>Open incident</Link>
          </Button>
          <Button variant="outline" onClick={onReportAnother}>Report another</Button>
        </div>
      </CardContent>
    </Card>
  )
}
