'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signOut } from '@workos-inc/authkit-nextjs'
import { E2E_COOKIE, e2eAuthEnabled } from '@/lib/e2e-auth'
import { appUrl } from '@/lib/email'

/** Ends the WorkOS session. The returnTo URL must be listed under Redirects → Sign-out in the WorkOS dashboard. */
export async function signOutAction(): Promise<void> {
  if (e2eAuthEnabled()) {
    // Test sign-in (lib/e2e-auth.ts) has no WorkOS session to end
    ;(await cookies()).delete(E2E_COOKIE)
    redirect('/login')
  }
  await signOut({ returnTo: `${appUrl()}/login` })
}
