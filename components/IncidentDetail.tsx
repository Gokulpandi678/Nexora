'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { ArrowLeft, CheckCircle2, ChevronDown, Circle, CircleDot, History, Lock, MessageSquarePlus, Plus, RotateCw, Timer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SeverityBadge, StatusBadge, SystemTag } from '@/components/incident-badges'
import { EmptyState, ErrorNotice, LoadingRows } from '@/components/states'
import CommentThread from '@/components/CommentThread'
import LinkIncidentDialog from '@/components/LinkIncidentDialog'
import Markdown from '@/components/Markdown'
import SolutionCard from '@/components/SolutionCard'
import SolutionForm from '@/components/SolutionForm'
import SlaPanel from '@/components/SlaPanel'
import { MATCH_TYPE_LABEL, SEVERITIES, SEVERITY_LABEL, STATUSES, STATUS_LABEL, type IncidentStatus, type Severity } from '@/lib/constants'
import { useIncident, useIncidentMatches } from '@/hooks/useIncidents'
import { postJson } from '@/hooks/api'
import type { IncidentDetailDTO, IncidentRef, MatchLinkDTO } from '@/lib/types'
import { cn, formatMinutes, shortId, timeAgo } from '@/lib/utils'
import { format } from 'date-fns'

export default function IncidentDetail({ id }: { id: string }): React.JSX.Element {
  const { incident, error, isLoading, mutate } = useIncident(id)
  const { mutate: globalMutate } = useSWRConfig()
  const [addingSolution, setAddingSolution] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  if (error && !incident) {
    return error.message.includes('not found')
      ? <EmptyState title="Incident not found" action={<Button asChild variant="outline"><Link href="/incidents">Back to all incidents</Link></Button>}>It may have been deleted.</EmptyState>
      : <ErrorNotice message={error.message} onRetry={() => void mutate()} />
  }
  if (isLoading || !incident) return <LoadingRows count={4} />

  const refresh = (): void => {
    void mutate()
    void globalMutate(key => typeof key === 'string' && (key.startsWith('/api/stats') || key.startsWith('/api/incidents?') || key.startsWith('/api/incidents/search')))
  }

  const update = async (patch: { status?: IncidentStatus; severity?: Severity }): Promise<void> => {
    setUpdateError(null)
    try {
      await mutate(postJson<IncidentDetailDTO>(`/api/incidents/${id}`, patch, 'PATCH'), {
        optimisticData: { ...incident, ...patch },
        rollbackOnError: true,
        populateCache: true,
        revalidate: false
      })
      refresh()
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  const focusComment = (): void => {
    const el = document.querySelector<HTMLTextAreaElement>('#new-comment textarea')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus({ preventScroll: true })
  }

  return (
    <article aria-labelledby="incident-title" className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href="/incidents"><ArrowLeft aria-hidden="true" /> All incidents</Link>
      </Button>

      <header className={cn('ui-card relative flex flex-col gap-5 overflow-hidden p-6 sm:p-7', `sev-${incident.severity}`)}>
        <span className="sev-dot absolute inset-x-0 top-0 h-1.5" aria-hidden="true" />
        <span className="sev-dot pointer-events-none absolute -right-24 -top-24 size-64 rounded-full opacity-10 blur-3xl" aria-hidden="true" />

        <div className="relative flex flex-wrap items-center gap-2">
          <SeverityBadge severity={incident.severity} long />
          <StatusBadge status={incident.status} />
          {incident.recurringCount > 1 && <Badge variant="warning"><RotateCw aria-hidden="true" /> Recurred {incident.recurringCount}×</Badge>}
          <span className="ml-auto rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{shortId(incident.id)}</span>
        </div>
        <h1 id="incident-title" className="font-display-tight relative max-w-[70ch] text-2xl font-bold leading-snug sm:text-3xl">{incident.title}</h1>

        <dl className="relative grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Meta label="Reported by">
            {incident.createdBy}
            <a href={`mailto:${incident.email}`} className="block truncate text-xs font-normal text-muted-foreground hover:text-info-foreground hover:underline">{incident.email}</a>
          </Meta>
          <Meta label="Department">{incident.department}</Meta>
          <Meta label="Created">
            <time dateTime={incident.createdAt} title={format(new Date(incident.createdAt), 'PPpp')}>{timeAgo(incident.createdAt)}</time>
          </Meta>
          <Meta label="MTTR">
            <span className="inline-flex items-center gap-1">
              <Timer className="size-3.5 text-subtle" aria-hidden="true" />
              {incident.actualMTTR !== null ? formatMinutes(incident.actualMTTR) : <span className="text-muted-foreground">Open for {timeAgo(incident.createdAt).replace(' ago', '')}</span>}
            </span>
          </Meta>
        </dl>

        <div className="relative flex flex-col gap-4 border-t border-border pt-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-6">
            <StatusStepper value={incident.status} onChange={status => void update({ status })} />
            <SeveritySwitch value={incident.severity} onChange={severity => void update({ severity })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAddingSolution(true)}><Plus aria-hidden="true" /> Add solution</Button>
            <Button variant="outline" onClick={focusComment}><MessageSquarePlus aria-hidden="true" /> Add comment</Button>
            <LinkIncidentDialog incidentId={incident.id} onLinked={refresh} />
          </div>
        </div>
        {updateError && <ErrorNotice message={updateError} />}
      </header>

      {incident.linkedTo && (
        <div role="note" className="flex items-start gap-3 rounded-lg border border-secondary/30 bg-secondary-soft px-4 py-3 text-sm">
          <RotateCw className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" />
          <span>
          <span className="font-semibold text-secondary">Recurrence of </span>
          <Link href={`/incidents/${incident.linkedTo.id}`} className="font-semibold hover:underline">{incident.linkedTo.title}</Link>
          <span className="text-muted-foreground"> — first reported by {incident.linkedTo.createdBy} {timeAgo(incident.linkedTo.createdAt)}</span>
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left panel (60%) */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          <Card>
            <CardContent className="flex flex-col gap-5 pt-5">
              <Section label="Description"><Markdown>{incident.description}</Markdown></Section>
              <Section label="Symptoms"><Markdown>{incident.symptoms}</Markdown></Section>
              {incident.initialFixes && <Section label="Already tried"><Markdown>{incident.initialFixes}</Markdown></Section>}
              <Section label="Affected systems">
                <div className="flex flex-wrap gap-1.5">
                  {incident.affectedSystems.map(s => <SystemTag key={s} system={s} />)}
                  {incident.tags.map(t => <Badge key={t} variant="neutral">#{t}</Badge>)}
                </div>
              </Section>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Discussion <span className="font-normal text-muted-foreground">({incident.commentCount})</span></CardTitle></CardHeader>
            <CardContent><CommentThread incidentId={incident.id} onPosted={() => void mutate()} /></CardContent>
          </Card>

          <ActivityLog incident={incident} />
        </div>

        {/* Right panel (40%) */}
        <aside className="flex min-w-0 flex-col gap-6 lg:col-span-2" aria-label="SLA, solutions and related incidents">
          <SlaPanel incident={incident} onSaved={updated => { void mutate(updated, { revalidate: false }); refresh() }} />
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Solutions <span className="font-normal text-muted-foreground">({incident.solutions.length})</span></CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setAddingSolution(true)}><Plus aria-hidden="true" /> Add</Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {incident.solutions.length === 0 && (
                <p className="text-sm text-muted-foreground">No solution yet. Once it&apos;s fixed, add what worked — it becomes the suggested fix next time.</p>
              )}
              {incident.solutions.map(s => <SolutionCard key={s.id} solution={s} onChanged={refresh} />)}
              {incident.linkedTo && incident.linkedTo.solutions.length > 0 && (
                <div className="mt-2 flex flex-col gap-3">
                  <p className="eyebrow">From the original incident</p>
                  {incident.linkedTo.solutions.map(s => <SolutionCard key={s.id} solution={s} onChanged={refresh} />)}
                </div>
              )}
            </CardContent>
          </Card>

          <LinkedIncidents incident={incident} onChanged={refresh} />
          <RelatedIncidents id={incident.id} />
        </aside>
      </div>

      <Dialog open={addingSolution} onOpenChange={setAddingSolution}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a solution</DialogTitle>
            <DialogDescription>Write it for the next person who hits this — they&apos;ll see it as a suggested fix.</DialogDescription>
          </DialogHeader>
          <SolutionForm
            incidentId={incident.id}
            alreadyResolved={incident.status === 'RESOLVED' || incident.status === 'CLOSED'}
            onCancel={() => setAddingSolution(false)}
            onSaved={() => { setAddingSolution(false); refresh() }}
          />
        </DialogContent>
      </Dialog>
    </article>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2.5">
      <dt className="eyebrow text-[10px]">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  )
}

const STATUS_ICON: Record<IncidentStatus, typeof Circle> = {
  OPEN: Circle,
  INVESTIGATING: CircleDot,
  RESOLVED: CheckCircle2,
  CLOSED: Lock
}

/** Lifecycle as a clickable progress track: everything up to the current step is filled. */
function StatusStepper({ value, onChange }: { value: IncidentStatus; onChange: (status: IncidentStatus) => void }): React.JSX.Element {
  const current = STATUSES.indexOf(value)
  return (
    <div role="group" aria-label="Status" className="flex flex-col gap-2">
      <span className="eyebrow text-[10px]">Status</span>
      <ol className="flex items-center">
        {STATUSES.map((s, i) => {
          const Icon = STATUS_ICON[s]
          const done = i <= current
          return (
            <li key={s} className="flex items-center">
              {i > 0 && <span className={cn('h-0.5 w-3 sm:w-5', i <= current ? 'bg-primary' : 'bg-border')} aria-hidden="true" />}
              <button
                type="button"
                aria-pressed={i === current}
                aria-current={i === current ? 'step' : undefined}
                onClick={() => i !== current && onChange(s)}
                className={cn(
                  'ui-badge flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-all [&_svg]:size-3.5',
                  i === current ? 'border-primary bg-primary text-primary-foreground shadow-md'
                    : done ? 'border-primary/40 bg-primary-soft text-info-foreground hover:border-primary'
                      : 'border-border bg-surface text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}
              >
                <Icon aria-hidden="true" /> {STATUS_LABEL[s]}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function SeveritySwitch({ value, onChange }: { value: Severity; onChange: (severity: Severity) => void }): React.JSX.Element {
  return (
    <div role="group" aria-label="Severity" className="flex flex-col gap-2">
      <span className="eyebrow text-[10px]">Severity</span>
      <div className="ui-input flex items-center gap-0.5 p-0.5">
        {SEVERITIES.map(s => (
          <button
            key={s}
            type="button"
            aria-pressed={value === s}
            title={SEVERITY_LABEL[s]}
            onClick={() => value !== s && onChange(s)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold transition-colors',
              `sev-${s}`,
              value === s ? cn('sev-dot', s === 'P3' ? 'text-gray-950' : 'text-white') : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {value !== s && <span className="sev-dot size-1.5 rounded-full" aria-hidden="true" />}
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section>
      <h2 className="eyebrow mb-2 flex items-center gap-2"><span className="h-3 w-0.5 rounded-full bg-primary" aria-hidden="true" />{label}</h2>
      {children}
    </section>
  )
}

function ActivityLog({ incident }: { incident: IncidentDetailDTO }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="ui-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg p-5 text-left transition-colors hover:bg-muted/40">
        <span className="flex items-center gap-2 font-display font-semibold tracking-tight"><History className="size-4" aria-hidden="true" /> Activity log
          <span className="font-normal text-muted-foreground">({incident.activity.length})</span></span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-5 pb-5">
        <ol className="relative ml-2 border-l border-border">
          {incident.activity.map(a => (
            <li key={a.id} className="mb-4 ml-4 last:mb-0">
              <span className="absolute -left-[7px] mt-1 size-3.5 rounded-full border-[3px] border-surface bg-primary shadow-sm" aria-hidden="true" />
              <p className="text-sm"><span className="font-medium">{a.actor}</span> · {a.details}</p>
              <time dateTime={a.timestamp} className="text-xs text-muted-foreground" title={format(new Date(a.timestamp), 'PPpp')}>{timeAgo(a.timestamp)}</time>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

function RefRow({ incident, meta }: { incident: IncidentRef; meta?: React.ReactNode }): React.JSX.Element {
  return (
    <Link href={`/incidents/${incident.id}`} className="-mx-2 flex flex-col gap-0.5 rounded-md px-2 py-2 transition-colors hover:bg-muted">
      <span className="flex items-center gap-2">
        <SeverityBadge severity={incident.severity} />
        <span className="truncate text-sm font-medium">{incident.title}</span>
      </span>
      <span className="text-xs text-muted-foreground">{incident.createdBy} · {meta ?? timeAgo(incident.createdAt)}</span>
    </Link>
  )
}

function LinkedIncidents({ incident, onChanged }: { incident: IncidentDetailDTO; onChanged: () => void }): React.JSX.Element {
  const hasAny = incident.matchedAs.length > 0 || incident.matchedFrom.length > 0
  return (
    <Card>
      <CardHeader><CardTitle>Linked incidents</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!hasAny && <p className="text-sm text-muted-foreground">Not linked to any other incident.</p>}
        {incident.matchedAs.length > 0 && (
          <div>
            <p className="eyebrow mb-1">Links to earlier</p>
            <ul>
              {incident.matchedAs.map(m => (
                <li key={m.id}>
                  <RefRow incident={m.originalIncident} meta={MATCH_TYPE_LABEL[m.matchType]} />
                  <OutcomePrompt link={m} onChanged={onChanged} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {incident.matchedFrom.length > 0 && (
          <div>
            <p className="eyebrow mb-1">Linked here later ({incident.matchedFrom.length})</p>
            <ul>
              {incident.matchedFrom.map(m => (
                <li key={m.id}>
                  <RefRow incident={m.newIncident} meta={`${MATCH_TYPE_LABEL[m.matchType]} · ${timeAgo(m.createdAt)}`} />
                  {m.notes && <p className="line-clamp-2 pl-2 text-xs italic text-muted-foreground">“{m.notes}”</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Asks whether the reused fix worked; feeds solution effectiveness. */
function OutcomePrompt({ link, onChanged }: { link: MatchLinkDTO; onChanged: () => void }): React.JSX.Element | null {
  const [pending, setPending] = useState(false)
  if (!link.solutionUsed) return null
  if (link.didSolutionWork !== null) {
    return <p className="pl-2 text-xs text-muted-foreground">Suggested fix {link.didSolutionWork ? 'worked ✓' : 'did not work'}</p>
  }
  const record = async (didSolutionWork: boolean): Promise<void> => {
    setPending(true)
    try {
      await postJson(`/api/links/${link.id}`, { didSolutionWork }, 'PATCH')
      onChanged()
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
      <span>Did the fix you tried work?</span>
      <Button size="sm" variant="outline" className="h-6 px-2" disabled={pending} onClick={() => record(true)}>Yes</Button>
      <Button size="sm" variant="ghost" className="h-6 px-2" disabled={pending} onClick={() => record(false)}>No</Button>
    </div>
  )
}

function RelatedIncidents({ id }: { id: string }): React.JSX.Element {
  const { data, isLoading } = useIncidentMatches(id)
  return (
    <Card>
      <CardHeader><CardTitle>Related incidents</CardTitle></CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Looking for similar incidents…</p>}
        {data && data.length === 0 && <p className="text-sm text-muted-foreground">No similar incidents found.</p>}
        <ul>
          {data?.map(m => (
            <li key={m.id}><RefRow incident={m} meta={`${m.similarity}% similar · ${m.solutions.length} fix${m.solutions.length === 1 ? '' : 'es'}`} /></li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
