import 'server-only'
import { NextResponse } from 'next/server'
import { getSignInUrl, getSignUpUrl } from '@workos-inc/authkit-nextjs'
import { safeReturnTo } from '@/lib/safe-redirect'

/** Redirects to the WorkOS hosted sign-in or sign-up page. Must run in a route handler (it sets a PKCE cookie). */
export async function redirectToAuthKit(req: Request, screen: 'sign-in' | 'sign-up'): Promise<NextResponse> {
  const params = new URL(req.url).searchParams
  const options = {
    returnTo: safeReturnTo(params.get('returnTo')),
    loginHint: params.get('email')?.slice(0, 320) || undefined
  }
  const url = screen === 'sign-up' ? await getSignUpUrl(options) : await getSignInUrl(options)
  return NextResponse.redirect(url)
}
