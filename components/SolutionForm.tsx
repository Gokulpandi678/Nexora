'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ErrorNotice, FieldError } from '@/components/states'
import { EFFICIENCIES, EFFICIENCY_LABEL, QA_CHECKLIST, type Efficiency } from '@/lib/constants'
import { createSolutionSchema } from '@/lib/validators'
import { ApiError, postJson } from '@/hooks/api'
import { cn } from '@/lib/utils'

const TIME_PRESETS = [15, 30, 60, 120, 240] as const

interface Props {
  incidentId: string
  alreadyResolved: boolean
  onSaved: () => void
  onCancel: () => void
}

export default function SolutionForm({ incidentId, alreadyResolved, onSaved, onCancel }: Props): React.JSX.Element {
  const [form, setForm] = useState({
    rootCause: '', approach: '', useCaseNotes: '', timeToFix: '', preventionRules: '', monitoring: '',
    efficiency: 'MEDIUM' as Efficiency
  })
  const [qaChecks, setQaChecks] = useState<string[]>([])
  const [resolve, setResolve] = useState(!alreadyResolved)
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payload = { ...form, timeToFix: form.timeToFix === '' ? Number.NaN : Number(form.timeToFix), qaChecks, resolve }
  const result = createSolutionSchema.safeParse(payload)
  const fieldError = (key: string): string | undefined =>
    submitted && !result.success ? result.error.issues.find(i => i.path[0] === key)?.message : undefined

  const update = (key: keyof typeof form, value: string): void => setForm(f => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSubmitted(true)
    if (!result.success) return
    setPending(true)
    setError(null)
    try {
      await postJson(`/api/incidents/${incidentId}/solutions`, result.data)
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the solution')
      setPending(false)
    }
  }

  const area = (key: 'rootCause' | 'approach' | 'useCaseNotes' | 'preventionRules' | 'monitoring', label: string, placeholder: string, rows = 3): React.JSX.Element => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`sol-${key}`}>{label}</Label>
      <Textarea id={`sol-${key}`} rows={rows} value={form[key]} placeholder={placeholder}
        onChange={e => update(key, e.target.value)} aria-invalid={Boolean(fieldError(key))}
        aria-describedby={fieldError(key) ? `sol-${key}-error` : undefined} maxLength={5000} />
      <FieldError id={`sol-${key}-error`} message={fieldError(key)} />
    </div>
  )

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {area('rootCause', 'Root cause', 'Why did it actually happen?', 2)}
      {area('approach', 'Approach — what fixed it', 'Concrete steps, commands, config changes… (markdown supported)', 4)}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sol-timeToFix">Time to fix (minutes)</Label>
          <Input id="sol-timeToFix" type="number" min={0} inputMode="numeric" value={form.timeToFix}
            onChange={e => update('timeToFix', e.target.value)} aria-invalid={Boolean(fieldError('timeToFix'))}
            aria-describedby="sol-timeToFix-error" placeholder="e.g. 45" />
          <div className="flex flex-wrap gap-1">
            {TIME_PRESETS.map(m => (
              <Button key={m} variant="outline" size="sm" className="h-7 px-2" onClick={() => update('timeToFix', String(m))}>
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </Button>
            ))}
          </div>
          <FieldError id="sol-timeToFix-error" message={fieldError('timeToFix') && 'Enter whole minutes'} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Kind of fix</legend>
          <div role="radiogroup" aria-label="Kind of fix" className="flex flex-wrap gap-2">
            {EFFICIENCIES.map(eff => (
              <label key={eff} className={cn(
                'cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring',
                form.efficiency === eff ? 'border-primary bg-primary-soft font-medium text-info-foreground' : 'border-input hover:bg-muted'
              )}>
                <input type="radio" name="efficiency" className="sr-only" checked={form.efficiency === eff}
                  onChange={() => setForm(f => ({ ...f, efficiency: eff }))} />
                {EFFICIENCY_LABEL[eff]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {area('useCaseNotes', 'When to use this fix', 'Use this when X is true; it will not help if Y…', 2)}

      <div className="grid gap-4 sm:grid-cols-2">
        {area('preventionRules', 'Prevention (optional)', 'How to stop it recurring', 2)}
        {area('monitoring', 'Monitoring (optional)', 'Alerts or dashboards that catch it early', 2)}
      </div>

      <fieldset className="rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-medium">
          QA checklist <span className="font-normal text-muted-foreground">({qaChecks.length}/{QA_CHECKLIST.length})</span>
        </legend>
        <div className="flex flex-col gap-2.5">
          {QA_CHECKLIST.map(item => (
            <div key={item.id} className="flex items-start gap-2.5">
              <Checkbox id={`qa-${item.id}`} checked={qaChecks.includes(item.id)}
                onCheckedChange={checked => setQaChecks(prev => checked ? [...prev, item.id] : prev.filter(c => c !== item.id))} />
              <Label htmlFor={`qa-${item.id}`} className="font-normal leading-snug">{item.label}</Label>
            </div>
          ))}
        </div>
        {qaChecks.length < QA_CHECKLIST.length && (
          <p className="mt-3 text-xs text-warning-foreground">
            You can save with open items — they stay visible until a QA verifier signs off.
          </p>
        )}
      </fieldset>

      {!alreadyResolved && (
        <div className="flex items-center gap-2">
          <Checkbox id="sol-resolve" checked={resolve} onCheckedChange={c => setResolve(c === true)} />
          <Label htmlFor="sol-resolve" className="font-normal">Mark the incident as resolved</Label>
        </div>
      )}

      {error && <ErrorNotice message={error} />}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {resolve && !alreadyResolved ? 'Save solution & resolve' : 'Save solution'}
        </Button>
      </div>
    </form>
  )
}
