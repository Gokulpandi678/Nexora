'use client'

import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ErrorNotice } from '@/components/states'
import { MATCH_TYPE_LABEL, type MatchType } from '@/lib/constants'
import { postJson } from '@/hooks/api'
import type { SimilarIncident } from '@/lib/types'

interface Props {
  newIncidentId: string
  match: Pick<SimilarIncident, 'id' | 'title' | 'createdBy' | 'solutions'>
  matchType: MatchType
  onCancel: () => void
  onLinked: (result: { ownerName: string; notified: boolean }) => void
}

const NO_SOLUTION = '__none__'

/** Confirms a link between a new incident and an earlier one, optionally naming the fix being tried. */
export default function MatchDecision({ newIncidentId, match, matchType, onCancel, onLinked }: Props): React.JSX.Element {
  const { mutate } = useSWRConfig()
  const [solutionUsed, setSolutionUsed] = useState(NO_SOLUTION)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const confirm = async (): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      const result = await postJson<{ notified: boolean; ownerName: string }>(`/api/incidents/${newIncidentId}/link`, {
        originalIncidentId: match.id,
        matchType,
        solutionUsed: solutionUsed === NO_SOLUTION ? undefined : solutionUsed,
        notes: notes || undefined
      })
      void mutate(key => typeof key === 'string' && (key.includes(newIncidentId) || key.includes(match.id) || key.startsWith('/api/stats')))
      onLinked(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link incidents')
      setPending(false)
    }
  }

  return (
    <div className="flex animate-slide-in flex-col gap-4 border-t border-border pt-4">
      <p className="text-sm font-semibold">
        Link as: <span className="text-primary">{MATCH_TYPE_LABEL[matchType]}</span>
      </p>

      {match.solutions.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`solution-${match.id}`}>Fix you&apos;ll try first (optional)</Label>
          <Select value={solutionUsed} onValueChange={setSolutionUsed}>
            <SelectTrigger id={`solution-${match.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SOLUTION}>Not decided yet</SelectItem>
              {match.solutions.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.status === 'VERIFIED' ? '✓ ' : ''}
                  {s.approach.length > 70 ? `${s.approach.slice(0, 70)}…` : s.approach}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`notes-${match.id}`}>
          {matchType === 'SAME' ? `Note for ${match.createdBy} (optional)` : 'What is different this time? (optional)'}
        </Label>
        <Textarea id={`notes-${match.id}`} rows={2} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <p className="flex items-center gap-2 rounded-md bg-primary-soft px-3 py-2 text-sm text-info-foreground">
        <Mail className="size-4 shrink-0" aria-hidden="true" />
        The original solver, {match.createdBy}, will be notified.
      </p>

      {error && <ErrorNotice message={error} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="success" className="flex-1" onClick={confirm} disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {pending ? 'Linking…' : 'Confirm link'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>Back</Button>
      </div>
    </div>
  )
}
