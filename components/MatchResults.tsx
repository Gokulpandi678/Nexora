'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ExternalLink, RotateCw, Sparkles, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SeverityBadge, SolutionStatusBadge, StatusBadge, SystemTag } from '@/components/incident-badges'
import MatchDecision from '@/components/MatchDecision'
import type { MatchType } from '@/lib/constants'
import type { IncidentRef, SimilarIncident } from '@/lib/types'
import { cn, formatMinutes, pluralize, timeAgo } from '@/lib/utils'

export interface LinkOutcome {
  originalTitle: string
  ownerName: string
  notified: boolean
}

interface Props {
  incident: IncidentRef
  matches: SimilarIncident[]
  /** Called with the link result, or null when the user keeps it as a new incident */
  onDone: (outcome: LinkOutcome | null) => void
}

/** Step 2 of reporting: the top similar incidents, each with a same / similar / different decision. */
export default function MatchResults({ incident, matches, onDone }: Props): React.JSX.Element {
  const [dismissed, setDismissed] = useState<string[]>([])
  const [deciding, setDeciding] = useState<{ id: string; matchType: MatchType } | null>(null)
  const remaining = matches.filter(m => !dismissed.includes(m.id))

  return (
    <section aria-labelledby="matches-heading" className="flex max-w-3xl animate-slide-in flex-col gap-4">
      <div>
        <h2 id="matches-heading" className="text-xl font-semibold">
          We found {pluralize(matches.length, 'similar past incident')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Is one of these your issue? Linking gives you its fixes, and its owner is asked to help.
          Your report <span className="font-medium text-foreground">“{incident.title}”</span> is already saved.
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        {matches.map((match, index) => (
          <li key={match.id}>
            {dismissed.includes(match.id) ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                <span className="truncate"><span className="line-through">{match.title}</span> · different issue</span>
                <Button variant="ghost" size="sm" onClick={() => setDismissed(d => d.filter(id => id !== match.id))}>
                  <Undo2 /> Undo
                </Button>
              </div>
            ) : (
              <MatchCard
                match={match}
                rank={index + 1}
                decision={deciding?.id === match.id ? deciding.matchType : null}
                onChoose={matchType => setDeciding({ id: match.id, matchType })}
                onDifferent={() => {
                  setDismissed(d => [...d, match.id])
                  if (deciding?.id === match.id) setDeciding(null)
                }}
              >
                {deciding?.id === match.id && (
                  <MatchDecision
                    newIncidentId={incident.id}
                    match={match}
                    matchType={deciding.matchType}
                    onCancel={() => setDeciding(null)}
                    onLinked={result => onDone({ originalTitle: match.title, ...result })}
                  />
                )}
              </MatchCard>
            )}
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {remaining.length === 0 ? 'You ruled out every suggestion.' : 'None of these look right?'}
        </p>
        <Button variant="outline" onClick={() => onDone(null)}>
          Different issue — keep as a new incident
        </Button>
      </div>
    </section>
  )
}

interface MatchCardProps {
  match: SimilarIncident
  rank: number
  decision: MatchType | null
  onChoose: (matchType: MatchType) => void
  onDifferent: () => void
  children?: React.ReactNode
}

function MatchCard({ match, rank, decision, onChoose, onDifferent, children }: MatchCardProps): React.JSX.Element {
  const best = match.solutions[0]
  const solver = best?.solvedBy ?? match.createdBy

  return (
    <Card className={cn('transition-shadow', decision && 'ring-2 ring-primary')} aria-label={`Match ${rank}: ${match.title}`}>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold leading-snug">
              <Link href={`/incidents/${match.id}`} target="_blank" className="hover:text-primary hover:underline">
                {match.title}
                <ExternalLink className="ml-1 inline size-3.5 align-baseline text-subtle" aria-label="(opens in new tab)" />
              </Link>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reported by {match.createdBy} · {match.department} · {timeAgo(match.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <SimilarityMeter value={match.similarity} />
            <div className="flex gap-1">
              <SeverityBadge severity={match.severity} />
              <StatusBadge status={match.status} />
            </div>
          </div>
        </div>

        <p className="line-clamp-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Symptoms: </span>
          {match.symptoms}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {match.matchedBy !== 'keywords' && (
            <Badge variant="default" title="Found by comparing what the incidents mean, not just shared words">
              <Sparkles aria-hidden="true" /> Similar meaning
            </Badge>
          )}
          {match.sharedTerms.length > 0 && <span className="text-xs text-muted-foreground">Shared terms:</span>}
          {match.sharedTerms.map(t => <Badge key={t} variant="neutral" className="font-mono">{t}</Badge>)}
          {match.affectedSystems.map(s => <SystemTag key={s} system={s} highlight={match.sharedSystems.includes(s)} />)}
          {match.recurringCount > 1 && (
            <Badge variant="warning"><RotateCw aria-hidden="true" /> Recurred {match.recurringCount}×</Badge>
          )}
        </div>

        {best ? (
          <div className="rounded-md border border-success/30 bg-success-soft/50 px-3 py-2">
            <p className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium text-success-foreground">
              {pluralize(match.solutions.length, 'known fix', 'known fixes')}
              <SolutionStatusBadge status={best.status} />
              <span className="font-normal text-muted-foreground">took {formatMinutes(best.timeToFix)} · solved by {solver}</span>
            </p>
            <p className="line-clamp-2 text-sm">{best.approach}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No fix recorded yet — linking still alerts {match.createdBy}.</p>
        )}

        {!decision && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="sm" className="flex-1" onClick={() => onChoose('SAME')}>Yes, same issue</Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onChoose('SIMILAR')}>Similar, different approach</Button>
            <Button size="sm" variant="ghost" className="flex-1" onClick={onDifferent}>Different issue</Button>
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

function SimilarityMeter({ value }: { value: number }): React.JSX.Element {
  const label = value >= 70 ? 'Strong' : value >= 45 ? 'Good' : 'Partial'
  return (
    <div className="flex items-center gap-2" title={`${value}% similarity`}>
      <span className="text-xs text-muted-foreground">{label} match</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold tabular-nums">{value}%</span>
    </div>
  )
}
