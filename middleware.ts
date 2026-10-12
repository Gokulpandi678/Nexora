import { NextResponse, type NextRequest } from 'next/server'
import { authkit, handleAuthkitHeaders } from '@workos-inc/authkit-nextjs'
import { apiGuard } from '@/lib/api-guard'
import { E2E_COOKIE, E2E_LOGIN_PATH, e2eAuthEnabled, verifyE2eSession } from '@/lib/e2e-auth'

/** Reachable without signing in (the cron route checks its own secret). Everything else redirects to WorkOS (pages) or returns 401 (API). */
const PUBLIC_PATHS = [/^\/$/, /^\/login$/, /^\/auth\/(callback|sign-in|sign-up)$/, /^\/invite\/[^/]+$/, /^\/api\/health$/, /^\/api\/cron\/sla$/]

const passesThrough = (res: NextResponse): boolean => res.headers.get('x-middleware-next') === '1'

function withRateHeaders(res: NextResponse, guarded: NextResponse | null): NextResponse {
  for (const name of ['X-RateLimit-Limit', 'X-RateLimit-Remaining']) {
    const value = guarded?.headers.get(name)
    if (value) res.headers.set(name, value)
  }
  return res
}

/** Runs WorkOS AuthKit on every request (refreshes the session, feeds withAuth) after the API guards. */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith('/api/')
  const isPublic = PUBLIC_PATHS.some(p => p.test(pathname))

  const guarded = isApi ? apiGuard(req) : null
  if (guarded && !passesThrough(guarded)) return guarded

  // Playwright runs: a signed test cookie stands in for WorkOS (lib/e2e-auth.ts; never in production builds)
  if (e2eAuthEnabled()) {
    const signedIn = (await verifyE2eSession(req.cookies.get(E2E_COOKIE)?.value)) !== null
    if (!signedIn && !isPublic && pathname !== E2E_LOGIN_PATH) {
      if (isApi) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
      return NextResponse.redirect(new URL('/login', req.url))
    }
    return withRateHeaders(NextResponse.next(), guarded)
  }

  const { session, headers, authorizationUrl } = await authkit(req)

  if (!session.user && !isPublic) {
    if (isApi) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
    return handleAuthkitHeaders(req, headers, { redirect: authorizationUrl ?? '/login' })
  }

  return withRateHeaders(handleAuthkitHeaders(req, headers), guarded)
}

export const config = {
  // Everything except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)']
}
