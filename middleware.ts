import { NextResponse, type NextRequest } from 'next/server'
import { authkit, handleAuthkitHeaders } from '@workos-inc/authkit-nextjs'
import { apiGuard } from '@/lib/api-guard'

/** Reachable without signing in. Everything else redirects to WorkOS (pages) or returns 401 (API). */
const PUBLIC_PATHS = [/^\/$/, /^\/login$/, /^\/auth\/(callback|sign-in|sign-up)$/, /^\/invite\/[^/]+$/, /^\/api\/health$/]

const passesThrough = (res: NextResponse): boolean => res.headers.get('x-middleware-next') === '1'

/** Runs WorkOS AuthKit on every request (refreshes the session, feeds withAuth) after the API guards. */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith('/api/')

  const guarded = isApi ? apiGuard(req) : null
  if (guarded && !passesThrough(guarded)) return guarded

  const { session, headers, authorizationUrl } = await authkit(req)

  if (!session.user && !PUBLIC_PATHS.some(p => p.test(pathname))) {
    if (isApi) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
    return handleAuthkitHeaders(req, headers, { redirect: authorizationUrl ?? '/login' })
  }

  const res = handleAuthkitHeaders(req, headers)
  for (const name of ['X-RateLimit-Limit', 'X-RateLimit-Remaining']) {
    const value = guarded?.headers.get(name)
    if (value) res.headers.set(name, value)
  }
  return res
}

export const config = {
  // Everything except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)']
}
