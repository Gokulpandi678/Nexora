'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorNotice } from '@/components/states'
import { OrganizationFields, organizationPayload, useFormErrors, type OrganizationValue } from '@/components/auth/fields'
import { postJson } from '@/hooks/api'
import type { OrgSize } from '@/lib/constants'
import { organizationDetailsSchema } from '@/lib/validators'

export interface OrganizationDetails {
  id: string
  name: string
  industry: string | null
  size: string | null
  website: string | null
  description: string | null
}

/** Edit an organization's name and profile. Used by its admins and by superadmins. */
export default function OrganizationDetailsForm({ org, onSaved }: { org: OrganizationDetails; onSaved?: () => void }): React.JSX.Element {
  const [value, setValue] = useState<OrganizationValue>({
    name: org.name,
    industry: org.industry ?? '',
    size: (org.size ?? '') as OrgSize | '',
    website: org.website ?? '',
    description: org.description ?? ''
  })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const payload = organizationPayload(value)
  const form = useFormErrors(organizationDetailsSchema, payload)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const details = form.submit()
    if (!details) return
    setBusy(true)
    setSaved(false)
    try {
      await postJson(`/api/organizations/${org.id}`, { action: 'update', details }, 'PATCH')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved?.()
    } catch (error) {
      form.setApiError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <OrganizationFields value={value} onChange={setValue} errors={form.errors} />
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        {saved && <span role="status" className="flex items-center gap-1.5 text-sm text-success-foreground sm:mr-auto"><CheckCircle2 className="size-4" aria-hidden="true" /> Saved</span>}
        {form.serverError && <ErrorNotice message={form.serverError} className="sm:mr-auto" />}
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" aria-hidden="true" />} Save details</Button>
      </div>
    </form>
  )
}
