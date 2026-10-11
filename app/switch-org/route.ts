import { NextResponse } from 'next/server'
import { safeReturnTo } from '@/lib/safe-redirect'
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_OPTIONS, getSession, isUsable } from '@/lib/session'

/**
 * GET /switch-org?org=<id>&next=/path — make an organization the one the user works in, then go to
 * `next`. Used by the organization switcher and by links in emails. Only organizations the user is an
 * active member of (and that are not suspended) can be selected; anything else lands on `next` unchanged.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const next = safeReturnTo(url.searchParams.get('next')) ?? '/dashboard'
  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/login', url))

  const orgId = url.searchParams.get('org')
  const res = NextResponse.redirect(new URL(next, url))
  if (orgId && session.memberships.some(m => m.organization.id === orgId && isUsable(m))) {
    res.cookies.set(ACTIVE_ORG_COOKIE, orgId, ACTIVE_ORG_COOKIE_OPTIONS)
  }
  return res
}
