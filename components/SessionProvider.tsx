'use client'

import { createContext, useContext, useEffect, useRef } from 'react'
import { startPreferenceSync } from '@/lib/preferences-sync'
import { useIdentityStore } from '@/lib/store'
import type { AppSession } from '@/lib/session'

const SessionContext = createContext<AppSession | null>(null)

function syncStore(session: AppSession): void {
  const { user, membership } = session
  useIdentityStore.getState().setIdentity(
    { name: user.name || user.email, email: user.email, department: user.department ?? 'Unassigned' },
    membership?.status === 'ACTIVE' ? membership.role : user.isSuperAdmin ? 'ADMIN' : 'VIEWER'
  )
}

/**
 * Makes the server-resolved WorkOS session available to client components, mirrors it into the
 * identity store that existing components read from, and syncs the user's preferences with the account.
 */
export default function SessionProvider({ session, children }: { session: AppSession; children: React.ReactNode }): React.JSX.Element {
  // Fill the store before children render so nothing flashes a signed-out state
  const synced = useRef(false)
  if (!synced.current) {
    syncStore(session)
    synced.current = true
  }
  useEffect(() => syncStore(session), [session])

  // Preferences follow the account across browsers and devices. Started once per signed-in user (not
  // on every session refresh) so a refresh can never undo a change that is still being saved.
  const initialPreferences = useRef(session.preferences)
  useEffect(() => startPreferenceSync(initialPreferences.current), [session.user.id])

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): AppSession {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}
