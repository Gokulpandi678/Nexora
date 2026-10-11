'use client'

import { useState } from 'react'
import { ChevronDown, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { EfficiencyBadge, SolutionStatusBadge } from '@/components/incident-badges'
import Markdown from '@/components/Markdown'
import { ErrorNotice } from '@/components/states'
import { QA_CHECKLIST } from '@/lib/constants'
import { useIdentityStore } from '@/lib/store'
import { postJson } from '@/hooks/api'
import { useSolutionEffectiveness } from '@/hooks/useIncidents'
import type { SolutionDTO } from '@/lib/types'
import { cn, formatMinutes, timeAgo } from '@/lib/utils'

const CAN_VERIFY = new Set(['VERIFIER', 'ADMIN'])

export default function SolutionCard({ solution, onChanged }: { solution: SolutionDTO; onChanged: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const role = useIdentityStore(s => s.userRole)
  const verified = solution.status === 'VERIFIED'
  const missing = QA_CHECKLIST.filter(c => !solution.qaChecks.includes(c.id))

  const setStatus = async (status: 'VERIFIED' | 'UNVERIFIED' | 'DEPRECATED'): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      await postJson(`/api/solutions/${solution.id}/verify`, { status }, 'PATCH')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the solution')
    } finally {
      setPending(false)
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}
      className={cn('rounded-lg border bg-surface', verified ? 'border-success/40' : 'border-border', solution.status === 'DEPRECATED' && 'opacity-70')}>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <SolutionStatusBadge status={solution.status} />
          <EfficiencyBadge efficiency={solution.efficiency} />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" aria-hidden="true" /> {formatMinutes(solution.timeToFix)}
          </span>
        </div>
        <p className={cn('text-sm', !open && 'line-clamp-2')}>{solution.approach}</p>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{solution.solvedBy} · {timeAgo(solution.solvedAt)}</span>
          <span className={missing.length ? 'text-warning-foreground' : 'text-success-foreground'}>
            QA {QA_CHECKLIST.length - missing.length}/{QA_CHECKLIST.length}
          </span>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-mx-2 self-start">
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} aria-hidden="true" />
            {open ? 'Hide details' : 'Show details'}
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="flex flex-col gap-4 border-t border-border p-4">
        <Detail label="Root cause"><Markdown>{solution.rootCause}</Markdown></Detail>
        <Detail label="Approach"><Markdown>{solution.approach}</Markdown></Detail>
        <Detail label="When to use it"><Markdown>{solution.useCaseNotes}</Markdown></Detail>
        {solution.preventionRules && <Detail label="Prevention"><Markdown>{solution.preventionRules}</Markdown></Detail>}
        {solution.monitoring && <Detail label="Monitoring"><Markdown>{solution.monitoring}</Markdown></Detail>}

        <Detail label="QA checklist">
          <ul className="flex flex-col gap-1 text-sm">
            {QA_CHECKLIST.map(c => {
              const done = solution.qaChecks.includes(c.id)
              return (
                <li key={c.id} className={done ? '' : 'text-muted-foreground'}>
                  <span aria-hidden="true">{done ? '✓' : '○'}</span> {c.label}
                  <span className="sr-only">{done ? ' (checked)' : ' (not checked)'}</span>
                </li>
              )
            })}
          </ul>
        </Detail>

        {verified && solution.verifiedBy && (
          <p className="text-xs text-muted-foreground">
            Verified by {solution.verifiedBy}{solution.verifiedAt && ` · ${timeAgo(solution.verifiedAt)}`}
          </p>
        )}

        {open && <Effectiveness solutionId={solution.id} />}

        {CAN_VERIFY.has(role) ? (
          <div className="flex flex-wrap gap-2">
            {!verified && <Button size="sm" variant="success" disabled={pending} onClick={() => setStatus('VERIFIED')}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Verify (QA approve)
            </Button>}
            {verified && <Button size="sm" variant="outline" disabled={pending} onClick={() => setStatus('UNVERIFIED')}>Revoke verification</Button>}
            {solution.status !== 'DEPRECATED' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus('DEPRECATED')}>Deprecate</Button>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Only QA verifiers can verify solutions.</p>
        )}
        {error && <ErrorNotice message={error} />}
      </CollapsibleContent>
    </Collapsible>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <p className="eyebrow mb-1">{label}</p>
      {children}
    </div>
  )
}

function Effectiveness({ solutionId }: { solutionId: string }): React.JSX.Element | null {
  const { data } = useSolutionEffectiveness(solutionId)
  if (!data || data.timesUsed === 0) return null
  return (
    <dl className="grid grid-cols-3 gap-2 rounded-md bg-muted/60 p-3 text-center text-xs">
      <div>
        <dt className="text-muted-foreground">Reused</dt>
        <dd className="text-base font-semibold tabular-nums">{data.timesUsed}×</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Success rate</dt>
        <dd className="text-base font-semibold tabular-nums">{data.successRate === null ? '—' : `${data.successRate}%`}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">MTTR saved</dt>
        <dd className="text-base font-semibold tabular-nums">
          {data.mttrImprovement === null ? '—' : data.mttrImprovement >= 0 ? formatMinutes(data.mttrImprovement) : `−${formatMinutes(-data.mttrImprovement)}`}
        </dd>
      </div>
    </dl>
  )
}
