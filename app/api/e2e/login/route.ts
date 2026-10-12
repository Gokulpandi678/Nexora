import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { E2E_COOKIE, e2eAuthEnabled, sameString, signE2eSession } from '@/lib/e2e-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/e2e/login {"email","secret"} — signs in an existing user for Playwright (lib/e2e-auth.ts).
 * A 404 whenever test sign-in is off, so in production this route does not exist as far as callers can tell.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!e2eAuthEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as { email?: unknown; secret?: unknown } | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const secret = typeof body?.secret === 'string' ? body.secret : ''
  if (!sameString(secret, process.env.E2E_AUTH_SECRET ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // The test setup creates its users; this route never creates accounts
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'No such user' }, { status: 404 })

  const res = NextResponse.json({ ok: true, userId: user.id })
  res.cookies.set(E2E_COOKIE, await signE2eSession(user.id), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 6 })
  return res
}
