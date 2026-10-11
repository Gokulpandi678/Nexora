'use client'

import { useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, FileText, Loader2, Mail, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useSession } from '@/components/SessionProvider'
import { postJson } from '@/hooks/api'
import { cn } from '@/lib/utils'

type Status = { kind: 'sending' } | { kind: 'sent'; to: string } | { kind: 'error'; message: string } | null

/** Download the current list as CSV or PDF, or email both to yourself. `params` is the list's query string. */
export default function ExportMenu({ params, className }: { params: string; className?: string }): React.JSX.Element {
  const { user } = useSession()
  const [status, setStatus] = useState<Status>(null)
  const qs = params ? `?${params}` : ''

  const emailMe = async (): Promise<void> => {
    setStatus({ kind: 'sending' })
    try {
      const res = await postJson<{ sentTo: string }>('/api/export/email', { formats: ['csv', 'pdf'], params })
      setStatus({ kind: 'sent', to: res.sentTo })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Could not send the export' })
    }
    setTimeout(() => setStatus(s => (s?.kind === 'sending' ? s : null)), 6000)
  }

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn('h-11', className)} disabled={status?.kind === 'sending'}>
            {status?.kind === 'sending' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />} Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="eyebrow text-[10px]">Current filters</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <a href={`/api/export/csv${qs}`} download><FileSpreadsheet aria-hidden="true" /> Download CSV</a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/api/export/pdf${qs}`} download><FileText aria-hidden="true" /> Download PDF report</a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void emailMe()} className="flex-col items-start gap-0.5">
            <span className="flex items-center gap-2"><Mail className="size-4" aria-hidden="true" /> Email me CSV + PDF</span>
            <span className="pl-6 text-xs text-muted-foreground">Sent to {user.email}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {status && status.kind !== 'sending' && (
        <p role="status" className={cn(
          'absolute right-0 top-full z-10 mt-2 flex w-72 items-start gap-2 rounded-md p-3 text-xs shadow-lg',
          status.kind === 'sent' ? 'bg-success-soft text-success-foreground' : 'bg-danger-soft text-danger-foreground'
        )}>
          {status.kind === 'sent' ? <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> : <XCircle className="size-4 shrink-0" aria-hidden="true" />}
          {status.kind === 'sent' ? `Export emailed to ${status.to}.` : status.message}
        </p>
      )}
    </div>
  )
}
