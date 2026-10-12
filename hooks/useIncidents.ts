'use client'

import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr'
import { fetcher } from '@/hooks/api'
import { filtersToParams, useIdentityStore, useSearchStore, type IncidentFilters } from '@/lib/store'
import type {
  CommentDTO, DashboardStats, IncidentDetailDTO, IncidentListItem, NotificationDTO, Paginated, ProjectDTO, RecurringRow,
  SlaReport,
  SimilarIncident, SolutionEffectiveness, SystemStat, TeamStats, TrendStats
} from '@/lib/types'

const LIST_OPTIONS: SWRConfiguration = { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true }
const DETAIL_OPTIONS: SWRConfiguration = { revalidateOnFocus: true, dedupingInterval: 5_000 }
const STATS_OPTIONS: SWRConfiguration = { revalidateOnFocus: false, dedupingInterval: 60_000 }

interface Query<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isValidating: boolean
  mutate: SWRResponse<T, Error>['mutate']
}

function useApi<T>(key: string | null, options: SWRConfiguration): Query<T> {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T, Error>(key, fetcher, options)
  return { data, error, isLoading, isValidating, mutate }
}

/** Paginated incident list driven by explicit filters. */
export function useIncidents(filters: IncidentFilters, page = 1, sortBy = ''): Query<Paginated<IncidentListItem>> & {
  incidents: IncidentListItem[]
} {
  const params = filtersToParams(filters, { page: String(page), sort: sortBy })
  const endpoint = filters.q.trim() ? '/api/incidents/search' : '/api/incidents'
  const query = useApi<Paginated<IncidentListItem>>(`${endpoint}?${params}`, LIST_OPTIONS)
  return { ...query, incidents: query.data?.items ?? [] }
}

/** Same as useIncidents but reads filters, sort and page from the global search store. */
export function useSearchIncidents(): ReturnType<typeof useIncidents> {
  const { filters, sortBy, page } = useSearchStore()
  return useIncidents(filters, page, sortBy)
}

export function useIncident(id: string): Query<IncidentDetailDTO> & { incident: IncidentDetailDTO | undefined } {
  const query = useApi<IncidentDetailDTO>(`/api/incidents/${encodeURIComponent(id)}`, DETAIL_OPTIONS)
  return { ...query, incident: query.data }
}

export function useIncidentMatches(id: string | null): Query<SimilarIncident[]> {
  return useApi<SimilarIncident[]>(id ? `/api/incidents/${encodeURIComponent(id)}/matches` : null, STATS_OPTIONS)
}

export function useComments(id: string, page = 1): Query<Paginated<CommentDTO>> {
  return useApi<Paginated<CommentDTO>>(`/api/incidents/${encodeURIComponent(id)}/comments?page=${page}`, DETAIL_OPTIONS)
}

export function useIncidentStats(): Query<DashboardStats> {
  return useApi<DashboardStats>('/api/stats/dashboard', STATS_OPTIONS)
}

export function useRecurringIncidents(): { recurring: RecurringRow[]; isLoading: boolean; error: Error | undefined } {
  const { data, isLoading, error } = useIncidentStats()
  return { recurring: data?.topRecurring ?? [], isLoading, error }
}

export function useTrends(days = 30): Query<TrendStats> {
  return useApi<TrendStats>(`/api/stats/trends?days=${days}`, STATS_OPTIONS)
}

export function useSystemStats(): Query<SystemStat[]> {
  return useApi<SystemStat[]>('/api/stats/systems', STATS_OPTIONS)
}

export function useTeamStats(): Query<TeamStats> {
  return useApi<TeamStats>('/api/stats/teams', STATS_OPTIONS)
}

export function useSolutionEffectiveness(id: string | null): Query<SolutionEffectiveness> {
  return useApi<SolutionEffectiveness>(id ? `/api/solutions/${encodeURIComponent(id)}/effectiveness` : null, STATS_OPTIONS)
}

export function useNotifications(): Query<{ items: NotificationDTO[]; unread: number }> {
  const email = useIdentityStore(s => s.currentUser?.email)
  // The email in the key keeps each profile's inbox in its own cache entry
  return useApi(email ? `/api/notifications?for=${encodeURIComponent(email)}` : null, {
    refreshInterval: 60_000,
    revalidateOnFocus: true
  })
}

/** The organization's projects (archived ones too when asked; admins only). */
export function useProjects(includeArchived = false): Query<ProjectDTO[]> & { projects: ProjectDTO[] } {
  const query = useApi<ProjectDTO[]>(`/api/projects${includeArchived ? '?archived=1' : ''}`, STATS_OPTIONS)
  return { ...query, projects: query.data ?? [] }
}

/** SLA & availability for a month ('YYYY-MM'); refreshed every minute so countdowns stay current. */
export function useSlaReport(month: string): Query<SlaReport> {
  return useApi<SlaReport>(`/api/sla?month=${encodeURIComponent(month)}`, { ...STATS_OPTIONS, dedupingInterval: 30_000, refreshInterval: 60_000 })
}
