import { handleAuth } from '@workos-inc/authkit-nextjs'
import { syncUser } from '@/lib/session'

/** WorkOS redirects here after sign-in (WORKOS_REDIRECT_URI). Layouts then route the user by role. */
export const GET = handleAuth({
  returnPathname: '/',
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  onSuccess: async ({ user }) => {
    await syncUser(user)
  }
})
