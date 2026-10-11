'use client'

import { DEFAULT_PREFERENCES, diffPreferences, pickPreferences, type Preferences } from '@/lib/preferences'
import { useUserStore } from '@/lib/store'

/*
 * Keeps the preferences store (theme, UI style, sidebar, incident view) in step with the account:
 *  - On sign-in the account's saved preferences win over this browser's cache (same look on every
 *    device). If the account has none yet, this browser's current choices are uploaded instead, so
 *    nobody's choices are reset to the defaults.
 *  - Every change is applied locally at once and saved to the account shortly after (debounced).
 *  - Saving can fail (offline, server error): the UI keeps the local value, unsaved changes are kept
 *    and retried, and nothing ever blocks rendering.
 */

const DEBOUNCE_MS = 600
const RETRY_DELAYS_MS = [2_000, 10_000, 30_000]

let lastSaved: Preferences = { ...DEFAULT_PREFERENCES }
let pending: Partial<Preferences> = {}
let timer: ReturnType<typeof setTimeout> | undefined
let attempt = 0

async function flush(): Promise<void> {
  timer = undefined
  const body = pending
  if (Object.keys(body).length === 0) return
  pending = {}
  try {
    const res = await fetch('/api/me/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Lets the save finish even if the user navigates away right after changing something
      keepalive: true
    })
    if (!res.ok) throw new Error(`Saving preferences failed (${res.status})`)
    lastSaved = { ...lastSaved, ...body }
    attempt = 0
  } catch {
    // Keep what was not saved (newer changes win) and try again later
    pending = { ...body, ...pending }
    const delay = RETRY_DELAYS_MS[attempt]
    attempt += 1
    if (delay !== undefined) timer = setTimeout(() => void flush(), delay)
    // Out of retries: stays pending and goes out with the next change
  }
}

function queue(changes: Partial<Preferences>): void {
  pending = { ...pending, ...changes }
  if (timer) clearTimeout(timer)
  attempt = 0
  timer = setTimeout(() => void flush(), DEBOUNCE_MS)
}

/**
 * Starts syncing for a signed-in user. `saved` is the account's preferences, or null if the user never
 * saved any. Waits for this browser's cache to load first, so the account always has the last word.
 * Returns a cleanup function.
 */
export function startPreferenceSync(saved: Preferences | null): () => void {
  let unsubscribe: (() => void) | undefined

  const begin = (): void => {
    if (saved) {
      lastSaved = { ...saved }
      useUserStore.setState(saved)
    } else {
      lastSaved = { ...DEFAULT_PREFERENCES }
      const local = pickPreferences(useUserStore.getState())
      queue(local)
    }
    unsubscribe = useUserStore.subscribe(state => {
      const changes = diffPreferences({ ...lastSaved, ...pending }, pickPreferences(state))
      if (Object.keys(changes).length > 0) queue(changes)
    })
  }

  let stopWaiting: (() => void) | undefined
  if (useUserStore.getState().hydrated) begin()
  else stopWaiting = useUserStore.persist.onFinishHydration(() => begin())

  return () => {
    stopWaiting?.()
    unsubscribe?.()
  }
}

/** Test hook: forget all module state. */
export function resetPreferenceSync(): void {
  if (timer) clearTimeout(timer)
  timer = undefined
  pending = {}
  attempt = 0
  lastSaved = { ...DEFAULT_PREFERENCES }
}
