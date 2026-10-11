'use client'

import { useState } from 'react'
import type { ZodType, ZodTypeDef } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FieldError } from '@/components/states'
import { ApiError } from '@/hooks/api'
import { DEPARTMENTS, ORG_SIZES, type Department, type OrgSize } from '@/lib/constants'
import { cn } from '@/lib/utils'

export type Errors = Record<string, string | undefined>

/**
 * Validates `value` with a Zod schema once the form has been submitted, and merges in field errors
 * the API returned. Paths are joined with dots ("profile.name").
 */
export function useFormErrors<T>(schema: ZodType<T, ZodTypeDef, unknown>, value: unknown): {
  errors: Errors
  data: T | null
  submit: () => T | null
  serverError: string | null
  setApiError: (error: unknown) => void
} {
  const [submitted, setSubmitted] = useState(false)
  const [server, setServer] = useState<{ message: string | null; fields: Errors }>({ message: null, fields: {} })
  const result = schema.safeParse(value)

  const errors: Errors = { ...server.fields }
  if (submitted && !result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join('.')
      errors[key] ??= issue.message
    }
  }

  return {
    errors,
    data: result.success ? result.data : null,
    submit: () => {
      setSubmitted(true)
      setServer({ message: null, fields: {} })
      return result.success ? result.data : null
    },
    serverError: server.message,
    setApiError: error => {
      if (error instanceof ApiError) {
        const fields = Object.fromEntries(Object.entries(error.fieldErrors).map(([k, v]) => [k, v[0]]))
        setServer({ message: error.message, fields })
      } else {
        setServer({ message: 'Something went wrong. Please try again.', fields: {} })
      }
    }
  }
}

function Field({ id, label, hint, error, optional, children, className }: {
  id: string
  label: string
  hint?: string
  error?: string
  optional?: boolean
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}

/* ---------- Personal details ---------- */

export interface ProfileValue {
  name: string
  jobTitle: string
  department: Department | ''
  phone: string
  bio: string
}

export const emptyProfile = (p: Partial<{ name: string; jobTitle: string | null; department: Department | null; phone: string | null; bio: string | null }> = {}): ProfileValue => ({
  name: p.name ?? '',
  jobTitle: p.jobTitle ?? '',
  department: p.department ?? '',
  phone: p.phone ?? '',
  bio: p.bio ?? ''
})

/** The profile payload the API expects (empty department becomes undefined so Zod reports it). */
export const profilePayload = (v: ProfileValue): Record<string, unknown> => ({ ...v, department: v.department || undefined })

export function ProfileFields({ value, onChange, errors, prefix = '', columns = 2 }: {
  value: ProfileValue
  onChange: (value: ProfileValue) => void
  errors: Errors
  /** Error-key prefix, e.g. "profile." when nested in a larger payload */
  prefix?: string
  /** 3 lays the fields out in three columns on large screens (full-width forms) */
  columns?: 2 | 3
}): React.JSX.Element {
  const wide = columns === 3
  const set = <K extends keyof ProfileValue>(key: K, v: ProfileValue[K]): void => onChange({ ...value, [key]: v })
  const err = (key: string): string | undefined => errors[`${prefix}${key}`]
  const aria = (key: string): { 'aria-invalid': boolean; 'aria-describedby': string } => ({
    'aria-invalid': Boolean(err(key)),
    'aria-describedby': `p-${key}-error`
  })

  return (
    <div className={cn('grid gap-x-4 gap-y-3 sm:grid-cols-2', wide && 'lg:grid-cols-3')}>
      <Field id="p-name" label="Full name" error={err('name')}>
        <Input id="p-name" autoComplete="name" value={value.name} onChange={e => set('name', e.target.value)} {...aria('name')} />
      </Field>
      <Field id="p-jobTitle" label="Job title" error={err('jobTitle')}>
        <Input id="p-jobTitle" autoComplete="organization-title" placeholder="e.g. Site Reliability Engineer" value={value.jobTitle}
          onChange={e => set('jobTitle', e.target.value)} {...aria('jobTitle')} />
      </Field>
      <Field id="p-department" label="Team / department" error={err('department')}>
        <Select value={value.department} onValueChange={v => { if (v) set('department', v as Department) }}>
          <SelectTrigger id="p-department" {...aria('department')}><SelectValue placeholder="Choose a department" /></SelectTrigger>
          <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field id="p-phone" label="Phone" optional error={err('phone')} hint="Used for urgent incident escalation only.">
        <Input id="p-phone" type="tel" autoComplete="tel" value={value.phone} onChange={e => set('phone', e.target.value)} {...aria('phone')} />
      </Field>
      <Field id="p-bio" label="What do you work on?" optional error={err('bio')} className={cn('sm:col-span-2', wide && 'lg:col-span-2')}
        hint="Systems you own or know well, so the right people get pulled into incidents.">
        <Textarea id="p-bio" rows={2} value={value.bio} onChange={e => set('bio', e.target.value)} {...aria('bio')} />
      </Field>
    </div>
  )
}

/* ---------- Organization details ---------- */

export interface OrganizationValue {
  name: string
  industry: string
  size: OrgSize | ''
  website: string
  description: string
}

export const organizationPayload = (v: OrganizationValue): Record<string, unknown> => ({ ...v, size: v.size || null })

export function OrganizationFields({ value, onChange, errors, prefix = '' }: {
  value: OrganizationValue
  onChange: (value: OrganizationValue) => void
  errors: Errors
  prefix?: string
}): React.JSX.Element {
  const set = <K extends keyof OrganizationValue>(key: K, v: OrganizationValue[K]): void => onChange({ ...value, [key]: v })
  const err = (key: string): string | undefined => errors[`${prefix}${key}`]
  const aria = (key: string): { 'aria-invalid': boolean; 'aria-describedby': string } => ({
    'aria-invalid': Boolean(err(key)),
    'aria-describedby': `o-${key}-error`
  })

  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      <Field id="o-name" label="Organization name" error={err('name')} className="sm:col-span-2">
        <Input id="o-name" autoComplete="organization" value={value.name} onChange={e => set('name', e.target.value)} {...aria('name')} />
      </Field>
      <Field id="o-industry" label="Industry" optional error={err('industry')}>
        <Input id="o-industry" placeholder="e.g. Fintech" value={value.industry} onChange={e => set('industry', e.target.value)} {...aria('industry')} />
      </Field>
      <Field id="o-size" label="Company size" optional error={err('size')}>
        <Select value={value.size} onValueChange={v => { if (v) set('size', v as OrgSize) }}>
          <SelectTrigger id="o-size" {...aria('size')}><SelectValue placeholder="Number of employees" /></SelectTrigger>
          <SelectContent>{ORG_SIZES.map(s => <SelectItem key={s} value={s}>{s} people</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field id="o-website" label="Website" optional error={err('website')} className="sm:col-span-2">
        <Input id="o-website" type="url" inputMode="url" placeholder="example.com" value={value.website}
          onChange={e => set('website', e.target.value)} {...aria('website')} />
      </Field>
      <Field id="o-description" label="About the organization" optional error={err('description')} className="sm:col-span-2"
        hint="Shown to people choosing which organization to join.">
        <Textarea id="o-description" rows={2} value={value.description} onChange={e => set('description', e.target.value)} {...aria('description')} />
      </Field>
    </div>
  )
}
