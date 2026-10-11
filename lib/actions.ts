'use server'

import { signOut } from '@workos-inc/authkit-nextjs'

/** Ends the WorkOS session. The returnTo URL must be listed under Redirects → Sign-out in the WorkOS dashboard. */
export async function signOutAction(): Promise<void> {
  await signOut({ returnTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/login` })
}
