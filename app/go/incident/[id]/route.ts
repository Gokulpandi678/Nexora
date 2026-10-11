import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_OPTIONS, getSession, isUsable } from '@/lib/session'

/**
 * GET /go/incident/:id — opens an incident from an email or notification, first switching to the
 * incident's organization when the user belongs to it. Otherwise the incident page shows "not found".
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  const url = new URL(req.url)
  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/login', url))

  const res = NextResponse.redirect(new URL(`/incidents/${encodeURIComponent(id)}`, url))
  const incident = await prisma.incident.findUnique({ where: { id }, select: { organizationId: true } })
  const orgId = incident?.organizationId
  if (orgId && session.memberships.some(m => m.organization.id === orgId && isUsable(m))) {
    res.cookies.set(ACTIVE_ORG_COOKIE, orgId, ACTIVE_ORG_COOKIE_OPTIONS)
  }
  return res
}
