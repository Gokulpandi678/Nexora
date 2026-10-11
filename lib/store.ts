'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Department, IncidentStatus, Role, Severity } from '@/lib/constants'
import type { SortOption } from '@/lib/validators'
import { DEFAULT_PREFERENCES, parsePreferences, type IncidentView, type Theme } from '@/lib/preferences'
import type { UiStyle } from '@/lib/ui-styles'

export type { Theme }
/** @deprecated use IncidentView */
export type ViewMode = IncidentView

/* ---------- User (persisted) ---------- */

export interface CurrentUser {
  name: string
  email: string
  department: Department
}

/* ---------- Identity (from the WorkOS session, never stored) ---------- */

interface IdentityState {
  currentUser: CurrentUser | null
  userRole: Role
  setIdentity: (currentUser: CurrentUser | null, userRole: Role) => void
}

/**
 * Who is signed in, mirrored from the server session by SessionProvider on every page load.
 * Deliberately a separate, non-persisted store: zustand's persist middleware writes the whole
 * persisted state on every change, so updating identity in the preferences store before it had
 * been read back from localStorage overwrote the saved theme with the defaults.
 */
export const useIdentityStore = create<IdentityState>(set => ({
  currentUser: null,
  userRole: 'VIEWER',
  setIdentity: (currentUser, userRole) => set({ currentUser, userRole })
}))

/* ---------- Preferences (persisted per browser) ---------- */

interface UserState {
  theme: Theme
  uiStyle: UiStyle
  sidebarCollapsed: boolean
  incidentView: IncidentView
  hydrated: boolean
  setTheme: (theme: Theme) => void
  setUiStyle: (uiStyle: UiStyle) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setIncidentView: (view: IncidentView) => void
}

/**
 * The user's preferences (lib/preferences.ts). Starts from the defaults, is cached in localStorage for
 * an instant first paint, and is synced with the account by lib/preferences-sync.ts when signed in.
 * Nothing but preferences may be written here.
 */
export const useUserStore = create<UserState>()(
  persist(
    set => ({
      ...DEFAULT_PREFERENCES,
      hydrated: false,
      setTheme: theme => set({ theme }),
      setUiStyle: uiStyle => set({ uiStyle }),
      setSidebarCollapsed: sidebarCollapsed => set({ sidebarCollapsed }),
      setIncidentView: incidentView => set({ incidentView })
    }),
    {
      name: 'nexora-user',
      // Writes are ignored until the saved preferences have been read back: persist writes on every
      // change, so any change made before rehydration would otherwise replace the user's saved theme
      // with the defaults. Storage can also be unavailable (private mode, blocked site data).
      storage: createJSONStorage(() => ({
        getItem: key => {
          try {
            return localStorage.getItem(key)
          } catch {
            return null
          }
        },
        setItem: (key, value) => {
          if (!useUserStore.getState().hydrated) return
          try {
            localStorage.setItem(key, value)
          } catch {
            // preferences simply are not remembered
          }
        },
        removeItem: key => {
          try {
            localStorage.removeItem(key)
          } catch {
            // ignore
          }
        }
      })),
      partialize: ({ theme, uiStyle, sidebarCollapsed, incidentView }) => ({ theme, uiStyle, sidebarCollapsed, incidentView }),
      // A corrupted or outdated cache falls back to the defaults field by field instead of breaking
      merge: (persisted, current) => ({ ...current, ...parsePreferences(persisted) }),
      // Rehydrated from an effect (AppProviders) so server and first client render match
      skipHydration: true,
      onRehydrateStorage: () => () => useUserStore.setState({ hydrated: true })
    }
  )
)

export const selectIsAuthenticated = (s: IdentityState): boolean => s.currentUser !== null

/* ---------- UI ---------- */

interface UIState {
  sidebarOpen: boolean
  paletteOpen: boolean
  setSidebarOpen: (open: boolean) => void
  setPaletteOpen: (open: boolean) => void
}

/** Transient UI state (not a preference, never saved). */
export const useUIStore = create<UIState>(set => ({
  sidebarOpen: false,
  paletteOpen: false,
  setSidebarOpen: sidebarOpen => set({ sidebarOpen }),
  setPaletteOpen: paletteOpen => set({ paletteOpen })
}))

/* ---------- Search & filters ---------- */

export interface IncidentFilters {
  q: string
  status: IncidentStatus[]
  severity: Severity[]
  systems: string[]
  department: Department | ''
  from: string
  to: string
  recurring: '' | 'true' | 'false'
}

export const EMPTY_FILTERS: IncidentFilters = {
  q: '',
  status: [],
  severity: [],
  systems: [],
  department: '',
  from: '',
  to: '',
  recurring: ''
}

interface SearchState {
  filters: IncidentFilters
  sortBy: SortOption | ''
  page: number
  setFilter: <K extends keyof IncidentFilters>(key: K, value: IncidentFilters[K]) => void
  setFilters: (filters: Partial<IncidentFilters>) => void
  setSort: (sort: SortOption | '') => void
  setPage: (page: number) => void
  reset: () => void
}

export const useSearchStore = create<SearchState>(set => ({
  filters: EMPTY_FILTERS,
  sortBy: '',
  page: 1,
  // Any filter change returns to page 1
  setFilter: (key, value) => set(s => ({ filters: { ...s.filters, [key]: value }, page: 1 })),
  setFilters: filters => set(s => ({ filters: { ...s.filters, ...filters }, page: 1 })),
  setSort: sortBy => set({ sortBy, page: 1 }),
  setPage: page => set({ page }),
  reset: () => set({ filters: EMPTY_FILTERS, sortBy: '', page: 1 })
}))

export function filtersToParams(filters: IncidentFilters, extra: Record<string, string> = {}): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q.trim()) params.set('q', filters.q.trim())
  for (const s of filters.status) params.append('status', s)
  for (const s of filters.severity) params.append('severity', s)
  for (const s of filters.systems) params.append('systems', s)
  if (filters.department) params.set('department', filters.department)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.recurring) params.set('recurring', filters.recurring)
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v)
  return params
}

export function hasActiveFilters(filters: IncidentFilters): boolean {
  return Object.entries(filters).some(([, v]) => (Array.isArray(v) ? v.length > 0 : Boolean(v)))
}
