import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from '@/lib/rate-limit'

const LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 100)
const checkRate = createRateLimiter({ limit: LIMIT, windowMs: 60_000 })

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function clientKey(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local'
}

/**
 * API guardrails:
 *  - Rate limiting: RATE_LIMIT_PER_MINUTE (default 100) requests per client IP per minute.
 *  - CSRF: state-changing requests must be JSON and same-origin. Browsers cannot send
 *    cross-site JSON without a CORS preflight, which this app never approves.
 * Returns a pass-through response (x-middleware-next) carrying rate-limit headers, or an error response.
 */
export function apiGuard(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname === '/api/health') return NextResponse.next()

  const rate = checkRate(clientKey(req))
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rate.resetAt - Date.now()) / 1000)) } }
    )
  }

  if (MUTATING.has(req.method)) {
    const origin = req.headers.get('origin')
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    if (origin && new URL(origin).host !== host) {
      return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 })
    }
    const type = req.headers.get('content-type') ?? ''
    if (req.method !== 'DELETE' && !type.includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 })
    }
  }

  const res = NextResponse.next()
  res.headers.set('X-RateLimit-Limit', String(LIMIT))
  res.headers.set('X-RateLimit-Remaining', String(rate.remaining))
  return res
}
