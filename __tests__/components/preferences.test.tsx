// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import SessionProvider from '@/components/SessionProvider'
import { useUserStore } from '@/lib/store'
import { resetPreferenceSync } from '@/lib/preferences-sync'
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/preferences'
import type { AppSession } from '@/lib/session'

/*
 * Preferences live on the account and follow the user to any browser; localStorage is only a cache for
 * an instant first paint. Regression included: the theme used to reset to "system" on every visit.
 */

const KEY = 'nexora-user'
const cached: Preferences = { theme: 'light', uiStyle: 'paper', sidebarCollapsed: true, incidentView: 'table' }

const sessionWith = (preferences: Preferences | null): AppSession => ({
  user: { id: 'u1', email: 'rita@example.com', name: 'Rita Reporter', isSuperAdmin: false, jobTitle: null, department: 'SRE', phone: null, bio: null, onboarded: true },
  membership: { id: 'm1', role: 'VERIFIER', position: null, status: 'ACTIVE', suspended: false, organization: { id: 'o1', name: 'Acme', slug: 'acme' } },
  memberships: [],
  invites: [],
  preferences
})

const stored = (): unknown => (JSON.parse(localStorage.getItem(KEY) ?? '{}') as { state?: unknown }).state
const fetchMock = vi.fn<typeof fetch>()
const patches = (): unknown[] => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))

/** A page load: defaults in memory, `cache` in localStorage, then the app mounts and reads the cache. */
async function pageLoad(session: AppSession, cache: Preferences | null = cached): Promise<void> {
  resetPreferenceSync()
  useUserStore.setState({ ...DEFAULT_PREFERENCES, hydrated: false })
  localStorage.clear()
  if (cache) localStorage.setItem(KEY, JSON.stringify({ state: cache, version: 0 }))
  render(<SessionProvider session={session}><div /></SessionProvider>)
  // AppProviders reads the cache from an effect, after SessionProvider has rendered
  await act(async () => { await useUserStore.persist.rehydrate() })
}

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the account’s preferences', () => {
  it('win over this browser’s cache, and replace it', async () => {
    const account: Preferences = { theme: 'dark', uiStyle: 'neo', sidebarCollapsed: false, incidentView: 'board' }
    await pageLoad(sessionWith(account))
    expect(useUserStore.getState()).toMatchObject(account)
    expect(stored()).toEqual(account)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(fetchMock).not.toHaveBeenCalled() // nothing to save: it came from the account
  })

  it('are seeded from this browser the first time, instead of resetting it to the defaults', async () => {
    await pageLoad(sessionWith(null))
    expect(useUserStore.getState()).toMatchObject(cached)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(patches()).toEqual([cached])
  })

  it('fall back to the defaults when neither the account nor the browser has any', async () => {
    await pageLoad(sessionWith(null), null)
    expect(useUserStore.getState()).toMatchObject(DEFAULT_PREFERENCES)
  })
})

describe('changing a preference', () => {
  it('applies at once and saves to the account once, debounced', async () => {
    await pageLoad(sessionWith(cached))
    act(() => {
      useUserStore.getState().setTheme('dark')
      useUserStore.getState().setIncidentView('cards')
      useUserStore.getState().setTheme('system')
    })
    expect(useUserStore.getState()).toMatchObject({ theme: 'system', incidentView: 'cards' })
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(patches()).toEqual([{ theme: 'system', incidentView: 'cards' }])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/me/preferences')
  })

  it('keeps the new value on screen when saving fails, and retries until it is saved', async () => {
    await pageLoad(sessionWith(cached))
    fetchMock.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(new Response('{}', { status: 500 }))
    act(() => useUserStore.getState().setSidebarCollapsed(false))
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) }) // first try: offline
    expect(useUserStore.getState().sidebarCollapsed).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) }) // retry: server error
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) }) // retry: works
    expect(patches()).toEqual([{ sidebarCollapsed: false }, { sidebarCollapsed: false }, { sidebarCollapsed: false }])
    expect(stored()).toMatchObject({ sidebarCollapsed: false })
  })

  it('sends unsaved changes along with the next one after retries run out', async () => {
    await pageLoad(sessionWith(cached))
    fetchMock.mockRejectedValue(new TypeError('offline'))
    act(() => useUserStore.getState().setTheme('dark'))
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    act(() => useUserStore.getState().setUiStyle('command'))
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(patches().at(-1)).toEqual({ theme: 'dark', uiStyle: 'command' })
  })
})

describe('saved preferences survive a page load (regression)', () => {
  it('are not overwritten when the signed-in user is filled in before the cache is read', async () => {
    await pageLoad(sessionWith(null))
    expect(useUserStore.getState()).toMatchObject(cached)
    expect(stored()).toEqual(cached)
  })

  it('never store who is signed in', async () => {
    await pageLoad(sessionWith(null))
    act(() => useUserStore.getState().setTheme('dark'))
    expect(localStorage.getItem(KEY)).not.toContain('rita@example.com')
  })

  it('a corrupted cache falls back field by field instead of breaking the page', async () => {
    resetPreferenceSync()
    useUserStore.setState({ ...DEFAULT_PREFERENCES, hydrated: false })
    localStorage.setItem(KEY, JSON.stringify({ state: { theme: 'dark', uiStyle: 42, incidentView: 'spreadsheet' }, version: 0 }))
    await act(async () => { await useUserStore.persist.rehydrate() })
    expect(useUserStore.getState()).toMatchObject({ theme: 'dark', uiStyle: 'aurora', incidentView: 'table', sidebarCollapsed: false })
  })
})
