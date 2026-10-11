'use client'

import Link from 'next/link'
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useSession } from '@/components/SessionProvider'
import { ROLE_LABEL } from '@/lib/constants'

/** Shows the organization the user is working in and switches to another one (full reload via /switch-org). */
export default function OrgSwitcher(): React.JSX.Element | null {
  const { membership, memberships, invites } = useSession()
  if (!membership) return null
  const active = memberships.filter(m => m.status === 'ACTIVE' && !m.suspended)
  const pending = memberships.filter(m => m.status === 'PENDING').length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="hidden h-9 max-w-[14rem] shrink-0 justify-between gap-2 px-2.5 sm:inline-flex" aria-label={`Organization: ${membership.organization.name}. Switch organization`}>
          <Building2 className="text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{membership.organization.name}</span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="eyebrow text-[10px]">Your organizations</DropdownMenuLabel>
        {active.map(m => {
          const current = m.organization.id === membership.organization.id
          return (
            <DropdownMenuItem key={m.id} asChild>
              <a href={current ? '#' : `/switch-org?org=${encodeURIComponent(m.organization.id)}&next=/dashboard`} aria-current={current ? 'true' : undefined}
                onClick={current ? e => e.preventDefault() : undefined} className="gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.organization.name}</span>
                  <span className="block text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</span>
                </span>
                {current && <Check className="text-primary" aria-label="Current" />}
              </a>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/organizations">
            <Plus aria-hidden="true" /> Join or manage organizations
            {invites.length > 0 ? (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{invites.length} invite{invites.length === 1 ? '' : 's'}</span>
            ) : pending > 0 && <span className="ml-auto text-xs text-muted-foreground">{pending} pending</span>}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
