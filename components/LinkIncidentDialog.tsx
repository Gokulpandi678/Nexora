'use client'

import { useState } from 'react'
import { Link2, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SeverityBadge } from '@/components/incident-badges'
import { ErrorNotice } from '@/components/states'
import { MATCH_TYPES, MATCH_TYPE_LABEL, type MatchType } from '@/lib/constants'
import { EMPTY_FILTERS } from '@/lib/store'
import { useIncidents } from '@/hooks/useIncidents'
import { postJson } from '@/hooks/api'
import { cn, shortId, timeAgo } from '@/lib/utils'

const MATCH_HINT: Record<MatchType, string> = {
  SAME: 'This is a recurrence; group it under that incident',
  SIMILAR: 'Related, but needed a different approach',
  DERIVED: 'This was caused by that incident'
}

/** Manually link this incident to an earlier one found by search. */
export default function LinkIncidentDialog({ incidentId, onLinked }: { incidentId: string; onLinked: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Link2 aria-hidden="true" /> Link incident</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        {open && <LinkForm incidentId={incidentId} onClose={() => setOpen(false)} onLinked={onLinked} />}
      </DialogContent>
    </Dialog>
  )
}

function LinkForm({ incidentId, onClose, onLinked }: { incidentId: string; onClose: () => void; onLinked: () => void }): React.JSX.Element {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null)
  const [matchType, setMatchType] = useState<MatchType>('SAME')
  const [notes, setNotes] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { incidents, isLoading } = useIncidents({ ...EMPTY_FILTERS, q }, 1, q ? 'relevance' : 'newest')
  const candidates = incidents.filter(i => i.id !== incidentId).slice(0, 8)

  const submit = async (): Promise<void> => {
    if (!selected) return
    setPending(true)
    setError(null)
    try {
      await postJson(`/api/incidents/${incidentId}/link`, { originalIncidentId: selected.id, matchType, notes: notes || undefined })
      onClose()
      onLinked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link incidents')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>Link to an earlier incident</DialogTitle>
          <DialogDescription>The earlier incident&apos;s owner is notified.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input aria-label="Search incidents to link" placeholder="Search by title or symptoms…" className="pl-9"
            value={q} onChange={e => setQ(e.target.value)} autoFocus />
        </div>

        <ul className="max-h-56 overflow-y-auto rounded-md border border-border" role="listbox" aria-label="Incidents">
          {isLoading && <li className="p-3 text-sm text-muted-foreground">Searching…</li>}
          {!isLoading && candidates.length === 0 && <li className="p-3 text-sm text-muted-foreground">No incidents found.</li>}
          {candidates.map(i => (
            <li key={i.id} role="option" aria-selected={selected?.id === i.id}>
              <button type="button" onClick={() => setSelected({ id: i.id, title: i.title })}
                className={cn('flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted',
                  selected?.id === i.id && 'bg-primary-soft')}>
                <SeverityBadge severity={i.severity} />
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{shortId(i.id)} · {timeAgo(i.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Relationship</legend>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
            {MATCH_TYPES.map(t => (
              <label key={t} className={cn('cursor-pointer rounded-md border p-2.5 text-sm focus-within:ring-2 focus-within:ring-ring',
                matchType === t ? 'border-primary bg-primary-soft' : 'border-input hover:bg-muted')}>
                <input type="radio" name="matchType" className="sr-only" checked={matchType === t} onChange={() => setMatchType(t)} />
                <span className="block font-medium">{MATCH_TYPE_LABEL[t]}</span>
                <span className="block text-xs text-muted-foreground">{MATCH_HINT[t]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="link-notes">Notes (optional)</Label>
          <Textarea id="link-notes" rows={2} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {error && <ErrorNotice message={error} />}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!selected || pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {selected ? `Link to “${selected.title.slice(0, 28)}${selected.title.length > 28 ? '…' : ''}”` : 'Choose an incident'}
          </Button>
        </DialogFooter>
    </>
  )
}
