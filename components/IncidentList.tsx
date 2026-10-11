'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Columns3, Eye, LayoutGrid, MessageSquare, RotateCw, Search, SlidersHorizontal, Table2,
  Wrench, X
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { SeverityBadge, StatusBadge, SystemTag } from '@/components/incident-badges'
import { EmptyState, ErrorNotice } from '@/components/states'
import ExportMenu from '@/components/ExportMenu'
import {
  DEPARTMENTS, SEVERITIES, SEVERITY_LABEL, STATUSES, STATUS_LABEL, SYSTEM_OPTIONS, isOneOf, type Department
} from '@/lib/constants'
import { SORT_OPTIONS, type SortOption } from '@/lib/validators'
import { filtersToParams, hasActiveFilters, useSearchStore, useUserStore, type IncidentFilters, type ViewMode } from '@/lib/store'
import { useSearchIncidents } from '@/hooks/useIncidents'
import type { IncidentListItem } from '@/lib/types'
import { cn, formatMinutes, pluralize, timeAgo } from '@/lib/utils'

const SORT_LABEL: Record<SortOption, string> = {
  relevance: 'Best match',
  newest: 'Newest first',
  oldest: 'Oldest first',
  mttr: 'Longest MTTR',
  severity: 'Highest severity',
  recurring: 'Most recurring'
}
const ALL = '__all__'

export default function IncidentList(): React.JSX.Element {
  const searchParams = useSearchParams()
  const { filters, sortBy, page, setFilter, setFilters, setSort, setPage, reset } = useSearchStore()
  const { data, incidents, error, isLoading, isValidating, mutate } = useSearchIncidents()
  // A saved preference: the same view on every device
  const viewMode = useUserStore(s => s.incidentView)
  const setViewMode = useUserStore(s => s.setIncidentView)
  const [query, setQuery] = useState(filters.q)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // The command palette navigates here with ?q=, dashboard pipeline tiles with ?status=
  const urlQ = searchParams.get('q')
  const urlStatus = searchParams.get('status')
  useEffect(() => {
    if (urlQ !== null) {
      setQuery(urlQ)
      setFilters({ q: urlQ })
    }
  }, [urlQ, setFilters])
  useEffect(() => {
    if (isOneOf(STATUSES, urlStatus)) setFilters({ status: [urlStatus] })
  }, [urlStatus, setFilters])

  // Debounce typing into the store
  useEffect(() => {
    if (query === filters.q) return
    const timer = setTimeout(() => setFilter('q', query), 250)
    return () => clearTimeout(timer)
  }, [query, filters.q, setFilter])

  const active = hasActiveFilters({ ...filters, q: '' })
  const activeCount = countFilters(filters)
  const exportParams = filtersToParams(filters, { sort: sortBy }).toString()

  return (
    <section aria-labelledby="list-heading" className="flex flex-col gap-4">
      <h2 id="list-heading" className="sr-only">Incident search</h2>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input type="search" aria-label="Search incidents" placeholder="Search title, description, symptoms…"
            className="h-11 pl-10 text-[15px]" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={sortBy || (filters.q ? 'relevance' : 'newest')} onValueChange={v => setSort(v as SortOption)}>
            <SelectTrigger className="h-11 w-44" aria-label="Sort by"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.filter(s => s !== 'relevance' || filters.q).map(s => <SelectItem key={s} value={s}>{SORT_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-11" onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen} aria-controls="filter-panel">
            <SlidersHorizontal aria-hidden="true" /> More filters {activeCount > 0 && <Badge className="ml-1">{activeCount}</Badge>}
          </Button>
          <ExportMenu params={exportParams} />
        </div>
      </div>

      <QuickFilters filters={filters} setFilter={setFilter} />

      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent id="filter-panel">
          <FilterPanel filters={filters} setFilter={setFilter} />
        </CollapsibleContent>
      </Collapsible>

      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span aria-live="polite">
          {isLoading ? 'Loading…' : data ? `${pluralize(data.total, 'incident')}${filters.q ? ` matching “${filters.q}”` : ''}` : ''}
          {isValidating && !isLoading && <span className="sr-only"> (updating)</span>}
        </span>
        <span className="flex items-center gap-2">
          {(active || filters.q) && (
            <Button variant="ghost" size="sm" onClick={() => { reset(); setQuery('') }}><X aria-hidden="true" /> Clear all</Button>
          )}
          <ViewSwitch value={viewMode} onChange={setViewMode} />
        </span>
      </div>

      {error ? (
        <ErrorNotice message={error.message} onRetry={() => void mutate()} />
      ) : isLoading && !data ? (
        <Card className="p-4"><div className="flex flex-col gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div></Card>
      ) : incidents.length === 0 ? (
        <EmptyState
          title={active || filters.q ? 'No incidents match' : 'No incidents yet'}
          action={!(active || filters.q) && <Button asChild><Link href="/incidents/new">Report an incident</Link></Button>}
        >
          {active || filters.q ? 'Try fewer words or clear some filters.' : 'Reported incidents will show up here.'}
        </EmptyState>
      ) : viewMode !== 'table' ? (
        <div className={cn('flex flex-col gap-4', isValidating && 'opacity-80 transition-opacity')}>
          {viewMode === 'cards' ? <CardsView incidents={incidents} /> : <BoardView incidents={incidents} />}
          {data && <Pager page={page} total={data.total} pageSize={data.pageSize} totalPages={data.totalPages} setPage={setPage} className="ui-card" />}
        </div>
      ) : (
        <Card className={cn('overflow-hidden', isValidating && 'opacity-80 transition-opacity')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Incidents, page {page}</caption>
              <thead className="ui-label-mono border-b border-border bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">Title</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Severity</th>
                  <th scope="col" className="hidden px-3 py-3 lg:table-cell">Systems</th>
                  <th scope="col" className="px-3 py-3 text-right">MTTR</th>
                  <th scope="col" className="px-3 py-3">Created</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {incidents.map(i => (
                  <tr key={i.id} className={cn('group transition-colors hover:bg-muted/50', `sev-${i.severity}`)}>
                    <td className="sev-stripe max-w-[380px] px-4 py-3.5">
                      <Link href={`/incidents/${i.id}`} className="font-medium hover:underline group-hover:text-info-foreground">{i.title}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{i.createdBy} · {i.department}</span>
                        {i.recurringCount > 1 && <Badge variant="warning"><RotateCw aria-hidden="true" />{i.recurringCount}×</Badge>}
                        {i.linkedToId && <Badge variant="secondary">Recurrence</Badge>}
                        {i.solutionCount > 0 && <Badge variant="success">{pluralize(i.solutionCount, 'fix', 'fixes')}</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-3.5"><StatusBadge status={i.status} /></td>
                    <td className="px-3 py-3.5"><SeverityBadge severity={i.severity} /></td>
                    <td className="hidden px-3 py-3.5 lg:table-cell">
                      <div className="flex max-w-[200px] flex-wrap gap-1">{i.affectedSystems.slice(0, 3).map(s => <SystemTag key={s} system={s} />)}
                        {i.affectedSystems.length > 3 && <Badge variant="outline">+{i.affectedSystems.length - 3}</Badge>}</div>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{formatMinutes(i.actualMTTR)}</td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-muted-foreground"><time dateTime={i.createdAt}>{timeAgo(i.createdAt)}</time></td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Button asChild variant="ghost" size="icon" className="size-8"><Link href={`/incidents/${i.id}`} aria-label={`View ${i.title}`}><Eye /></Link></Button>
                        <Button asChild variant="ghost" size="icon" className="size-8"><Link href={`/incidents/${i.id}#new-comment`} aria-label={`Comment on ${i.title}`}><MessageSquare /></Link></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && <Pager page={page} total={data.total} pageSize={data.pageSize} totalPages={data.totalPages} setPage={setPage} className="border-t border-border" />}
        </Card>
      )}
    </section>
  )
}

function countFilters(f: IncidentFilters): number {
  return f.status.length + f.severity.length + f.systems.length + (f.department ? 1 : 0) + (f.from ? 1 : 0) + (f.to ? 1 : 0) + (f.recurring ? 1 : 0)
}

const toggleIn = <T extends string>(list: T[], value: T): T[] => (list.includes(value) ? list.filter(v => v !== value) : [...list, value])

function Pager({ page, total, pageSize, totalPages, setPage, className }: {
  page: number
  total: number
  pageSize: number
  totalPages: number
  setPage: (page: number) => void
  className?: string
}): React.JSX.Element {
  return (
    <nav className={cn('flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm', className)} aria-label="Pagination">
      <span className="text-muted-foreground">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft aria-hidden="true" /> Previous</Button>
        <span className="tabular-nums text-muted-foreground">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next <ChevronRight aria-hidden="true" /></Button>
      </div>
    </nav>
  )
}

const VIEWS: { value: ViewMode; label: string; Icon: typeof Table2 }[] = [
  { value: 'table', label: 'Table', Icon: Table2 },
  { value: 'cards', label: 'Cards', Icon: LayoutGrid },
  { value: 'board', label: 'Board', Icon: Columns3 }
]

function ViewSwitch({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }): React.JSX.Element {
  return (
    <div role="group" aria-label="View" className="ui-input flex items-center gap-0.5 p-0.5">
      {VIEWS.map(({ value: v, label, Icon }) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} title={`${label} view`}
          className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors [&_svg]:size-3.5',
            value === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
          <Icon aria-hidden="true" /><span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      ))}
    </div>
  )
}

/** One-click chips for the filters people reach for most. */
function QuickFilters({ filters, setFilter }: {
  filters: IncidentFilters
  setFilter: <K extends keyof IncidentFilters>(key: K, value: IncidentFilters[K]) => void
}): React.JSX.Element {
  const chip = (on: boolean): string => cn(
    'ui-badge inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all',
    on ? 'border-primary bg-primary-soft text-info-foreground' : 'border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground'
  )
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick filters">
      {SEVERITIES.map(s => {
        const on = filters.severity.includes(s)
        return (
          <button key={s} type="button" aria-pressed={on} className={cn(chip(on), `sev-${s}`)} onClick={() => setFilter('severity', toggleIn(filters.severity, s))}>
            <span className="sev-dot size-2 rounded-full" aria-hidden="true" /> {SEVERITY_LABEL[s]}
          </button>
        )
      })}
      <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
      {STATUSES.map(s => {
        const on = filters.status.includes(s)
        return (
          <button key={s} type="button" aria-pressed={on} className={chip(on)} onClick={() => setFilter('status', toggleIn(filters.status, s))}>
            {STATUS_LABEL[s]}
          </button>
        )
      })}
      <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
      <button type="button" aria-pressed={filters.recurring === 'true'} className={chip(filters.recurring === 'true')}
        onClick={() => setFilter('recurring', filters.recurring === 'true' ? '' : 'true')}>
        <RotateCw className="size-3" aria-hidden="true" /> Recurring
      </button>
    </div>
  )
}

function IncidentCard({ incident: i, compact = false }: { incident: IncidentListItem; compact?: boolean }): React.JSX.Element {
  return (
    <Link href={`/incidents/${i.id}`}
      className={cn('ui-card ui-card-interactive group relative flex w-full flex-col gap-2.5 overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:shadow-md', `sev-${i.severity}`)}>
      <span className="sev-dot absolute inset-x-0 top-0 h-1" aria-hidden="true" />
      <span className="flex items-center gap-1.5">
        <SeverityBadge severity={i.severity} />
        {!compact && <StatusBadge status={i.status} />}
        <time dateTime={i.createdAt} className="ml-auto text-xs text-muted-foreground">{timeAgo(i.createdAt)}</time>
      </span>
      <span className={cn('font-medium leading-snug group-hover:text-info-foreground', compact ? 'line-clamp-3 text-sm' : 'line-clamp-2')}>{i.title}</span>
      {!compact && <span className="flex flex-wrap gap-1">{i.affectedSystems.slice(0, 4).map(s => <SystemTag key={s} system={s} />)}</span>}
      <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="truncate">{i.createdBy}</span>
        {i.recurringCount > 1 && (
          <span className="inline-flex items-center gap-1 font-medium text-warning-foreground"><RotateCw className="size-3" aria-hidden="true" />{i.recurringCount}×<span className="sr-only"> recurring</span></span>
        )}
        {i.solutionCount > 0 && (
          <span className="inline-flex items-center gap-1 font-medium text-success-foreground"><Wrench className="size-3" aria-hidden="true" />{i.solutionCount}<span className="sr-only"> {i.solutionCount === 1 ? 'fix' : 'fixes'}</span></span>
        )}
        {i.actualMTTR !== null && <span className="ml-auto tabular-nums">{formatMinutes(i.actualMTTR)}</span>}
      </span>
    </Link>
  )
}

function CardsView({ incidents }: { incidents: IncidentListItem[] }): React.JSX.Element {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {incidents.map(i => <li key={i.id} className="flex"><IncidentCard incident={i} /></li>)}
    </ul>
  )
}

const BOARD_ACCENT: Record<string, string> = { OPEN: 'bg-primary', INVESTIGATING: 'bg-warning', RESOLVED: 'bg-success', CLOSED: 'bg-subtle' }

/** Kanban-style columns for the current page of results. */
function BoardView({ incidents }: { incidents: IncidentListItem[] }): React.JSX.Element {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[880px] grid-cols-4 gap-4">
        {STATUSES.map(s => {
          const column = incidents.filter(i => i.status === s)
          return (
            <section key={s} aria-label={`${STATUS_LABEL[s]} (${column.length})`} className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/50 p-3">
              <h3 className="ui-label-mono flex items-center gap-2 px-1 text-sm font-semibold">
                <span className={cn('size-2 rounded-full', BOARD_ACCENT[s])} aria-hidden="true" />
                {STATUS_LABEL[s]}
                <span className="ml-auto rounded-full bg-surface px-2 text-xs tabular-nums text-muted-foreground">{column.length}</span>
              </h3>
              {column.length === 0
                ? <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Nothing here on this page</p>
                : column.map(i => <IncidentCard key={i.id} incident={i} compact />)}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function FilterPanel({ filters, setFilter }: {
  filters: IncidentFilters
  setFilter: <K extends keyof IncidentFilters>(key: K, value: IncidentFilters[K]) => void
}): React.JSX.Element {
  return (
    <Card className="grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Status</legend>
        <div className="flex flex-col gap-2">
          {STATUSES.map(s => (
            <div key={s} className="flex items-center gap-2">
              <Checkbox id={`f-status-${s}`} checked={filters.status.includes(s)} onCheckedChange={() => setFilter('status', toggleIn(filters.status, s))} />
              <Label htmlFor={`f-status-${s}`} className="font-normal">{STATUS_LABEL[s]}</Label>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Severity</legend>
        <div className="flex flex-col gap-2">
          {SEVERITIES.map(s => (
            <div key={s} className="flex items-center gap-2">
              <Checkbox id={`f-sev-${s}`} checked={filters.severity.includes(s)} onCheckedChange={() => setFilter('severity', toggleIn(filters.severity, s))} />
              <Label htmlFor={`f-sev-${s}`} className="font-normal">{SEVERITY_LABEL[s]}</Label>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium">Systems</legend>
        <div className="flex flex-wrap gap-1.5">
          {SYSTEM_OPTIONS.map(s => {
            const on = filters.systems.includes(s)
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => setFilter('systems', toggleIn(filters.systems, s))}
                className={cn('ui-badge rounded-full border px-3 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary-soft text-info-foreground' : 'border-input hover:bg-muted')}>
                {s}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="f-from">From</Label>
        <Input id="f-from" type="date" value={filters.from} max={filters.to || undefined} onChange={e => setFilter('from', e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="f-to">To</Label>
        <Input id="f-to" type="date" value={filters.to} min={filters.from || undefined} onChange={e => setFilter('to', e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="f-dept">Department</Label>
        <Select value={filters.department || ALL} onValueChange={v => setFilter('department', v === ALL ? '' : (isOneOf(DEPARTMENTS, v) ? v : '') as Department | '')}>
          <SelectTrigger id="f-dept"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="f-rec">Recurrence</Label>
        <Select value={filters.recurring || ALL} onValueChange={v => setFilter('recurring', v === ALL ? '' : (v as 'true' | 'false'))}>
          <SelectTrigger id="f-rec"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any</SelectItem>
            <SelectItem value="true">Recurring only</SelectItem>
            <SelectItem value="false">One-off only</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </Card>
  )
}
