'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Loader2, PlayCircle, Settings2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorNotice, FieldError } from '@/components/states'
import OrganizationDetailsForm, { type OrganizationDetails } from '@/components/organizations/OrganizationDetailsForm'
import { postJson } from '@/hooks/api'
import { cn } from '@/lib/utils'

export interface OrganizationRow extends OrganizationDetails {
  admins: string[]
  members: number
  pending: number
  incidents: number
  createdAt: string
  suspendedAt: string | null
  suspendedBy: string | null
  suspendedReason: string | null
}

const dateFmt = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function OrganizationsTable({ rows }: { rows: OrganizationRow[] }): React.JSX.Element {
  const [managing, setManaging] = useState<OrganizationRow | null>(null)
  if (rows.length === 0) return <EmptyState title="No organizations yet">Send your first invitation above.</EmptyState>

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-4 font-medium">Organization</th>
              <th scope="col" className="py-2 pr-4 font-medium">Status</th>
              <th scope="col" className="py-2 pr-4 font-medium">Admins</th>
              <th scope="col" className="py-2 pr-4 font-medium">Members</th>
              <th scope="col" className="py-2 pr-4 font-medium">Incidents</th>
              <th scope="col" className="py-2 pr-4 font-medium">Created</th>
              <th scope="col" className="py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(o => (
              <tr key={o.id} className={cn('border-b border-border last:border-0', o.suspendedAt && 'text-muted-foreground')}>
                <td className="py-3 pr-4">
                  <span className="block font-medium text-foreground">{o.name}</span>
                  {o.industry && <span className="text-xs text-muted-foreground">{o.industry}{o.size && ` · ${o.size} people`}</span>}
                </td>
                <td className="py-3 pr-4">
                  {o.suspendedAt
                    ? <Badge variant="danger" title={o.suspendedReason ?? undefined}><Ban aria-hidden="true" /> Suspended</Badge>
                    : <Badge variant="success">Active</Badge>}
                </td>
                <td className="max-w-[16rem] truncate py-3 pr-4 text-muted-foreground" title={o.admins.join(', ')}>{o.admins.join(', ') || '—'}</td>
                <td className="py-3 pr-4 tabular-nums">{o.members}{o.pending > 0 && <span className="text-xs text-muted-foreground"> (+{o.pending} pending)</span>}</td>
                <td className="py-3 pr-4 tabular-nums">{o.incidents}</td>
                <td className="py-3 pr-4 text-muted-foreground">{dateFmt(o.createdAt)}</td>
                <td className="py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => setManaging(o)} aria-label={`Manage ${o.name}`}>
                    <Settings2 aria-hidden="true" /> Manage
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {managing && <ManageDialog org={managing} onClose={() => setManaging(null)} />}
    </>
  )
}

function ManageDialog({ org, onClose }: { org: OrganizationRow; onClose: () => void }): React.JSX.Element {
  const router = useRouter()
  const done = (): void => {
    router.refresh()
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {org.name} {org.suspendedAt ? <Badge variant="danger">Suspended</Badge> : <Badge variant="success">Active</Badge>}
          </DialogTitle>
          <DialogDescription>
            {org.members} {org.members === 1 ? 'member' : 'members'} · {org.incidents} {org.incidents === 1 ? 'incident' : 'incidents'} · created {dateFmt(org.createdAt)}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="status">
          <TabsList>
            <TabsTrigger value="status">Access</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
          <TabsContent value="status" className="pt-4">
            {org.suspendedAt ? <ReactivatePanel org={org} onDone={done} /> : <SuspendPanel org={org} onDone={done} />}
          </TabsContent>
          <TabsContent value="details" className="pt-4">
            <OrganizationDetailsForm org={org} onSaved={() => router.refresh()} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function SuspendPanel({ org, onDone }: { org: OrganizationRow; onDone: () => void }): React.JSX.Element {
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reasonError = reason.trim().length > 0 && reason.trim().length < 5 ? 'Give a short reason (at least 5 characters)' : undefined
  const ready = reason.trim().length >= 5 && confirm.trim().toLowerCase() === org.name.toLowerCase()

  const suspend = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await postJson(`/api/organizations/${org.id}`, { action: 'suspend', reason: reason.trim() }, 'PATCH')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not suspend the organization')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-warning-soft p-3 text-sm text-warning-foreground">
        <p className="font-semibold">What suspending does</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>Members can no longer open {org.name} or switch to it.</li>
          <li>It disappears from the list of organizations people can join.</li>
          <li>No emails are sent for its incidents.</li>
          <li><strong>Nothing is deleted.</strong> Reactivating restores everything exactly as it was.</li>
        </ul>
        <p className="mt-2">Its admins ({org.admins.join(', ') || 'none'}) are emailed the reason.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="suspend-reason">Reason</Label>
        <Textarea id="suspend-reason" rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)}
          placeholder="e.g. Contract ended on 30 September" aria-invalid={Boolean(reasonError)} aria-describedby="suspend-reason-error" />
        <FieldError id="suspend-reason-error" message={reasonError} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="suspend-confirm">Type <strong>{org.name}</strong> to confirm</Label>
        <Input id="suspend-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" />
      </div>
      {error && <ErrorNotice message={error} />}
      <Button variant="destructive" className="self-end" disabled={!ready || busy} onClick={() => void suspend()}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Ban aria-hidden="true" />} Suspend organization
      </Button>
    </div>
  )
}

function ReactivatePanel({ org, onDone }: { org: OrganizationRow; onDone: () => void }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reactivate = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await postJson(`/api/organizations/${org.id}`, { action: 'reactivate' }, 'PATCH')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reactivate the organization')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-3 rounded-md bg-muted/60 p-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Suspended</dt><dd className="font-medium">{org.suspendedAt && dateFmt(org.suspendedAt)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">By</dt><dd className="truncate font-medium">{org.suspendedBy ?? '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Reason</dt><dd>{org.suspendedReason ?? '—'}</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Reactivating gives every member their access back, with all {org.incidents} incidents and their history intact. Its admins are emailed.
      </p>
      {error && <ErrorNotice message={error} />}
      <Button className="self-end" disabled={busy} onClick={() => void reactivate()}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PlayCircle aria-hidden="true" />} Reactivate organization
      </Button>
    </div>
  )
}
