import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { apiGuard as middleware } from '@/lib/api-guard'
import { BASE } from '../setup/helpers'

let ipCounter = 0
/** Each test gets its own client IP so the shared in-memory rate limiter never interferes. */
const uniqueIp = (): string => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`

function request(
  path: string,
  { method = 'GET', ip = uniqueIp(), headers = {} }: { method?: string; ip?: string; headers?: Record<string, string> } = {}
): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers: { host: new URL(BASE).host, 'x-forwarded-for': ip, ...headers },
    body: method === 'GET' || method === 'DELETE' ? undefined : '{}'
  })
}

const passesThrough = (res: Response): boolean => res.headers.get('x-middleware-next') === '1'

describe('middleware', () => {
  it('blocks cross-origin mutating requests with 403', async () => {
    const res = middleware(request('/api/incidents/create', {
      method: 'POST',
      headers: { origin: 'https://evil.example.com', 'content-type': 'application/json' }
    }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Cross-origin request blocked' })
  })

  it('rejects non-JSON mutating requests with 415', () => {
    const res = middleware(request('/api/incidents/create', {
      method: 'POST',
      headers: { origin: BASE, 'content-type': 'application/x-www-form-urlencoded' }
    }))
    expect(res.status).toBe(415)
  })

  it('allows DELETE without a content type', () => {
    const res = middleware(request('/api/incidents/abc', { method: 'DELETE', headers: { origin: BASE } }))
    expect(passesThrough(res)).toBe(true)
  })

  it('lets same-origin JSON requests through with rate-limit headers', () => {
    const res = middleware(request('/api/incidents/create', {
      method: 'POST',
      headers: { origin: BASE, 'content-type': 'application/json; charset=utf-8' }
    }))
    expect(passesThrough(res)).toBe(true)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('99')
  })

  it('honours x-forwarded-host behind a proxy', () => {
    const res = middleware(request('/api/incidents/create', {
      method: 'POST',
      headers: { origin: 'https://tracker.example.com', 'x-forwarded-host': 'tracker.example.com', 'content-type': 'application/json' }
    }))
    expect(passesThrough(res)).toBe(true)
  })

  it('lets GETs through regardless of content type', () => {
    expect(passesThrough(middleware(request('/api/incidents')))).toBe(true)
  })

  it('returns 429 with Retry-After on the 101st request in a minute from one IP', async () => {
    const ip = uniqueIp()
    for (let i = 0; i < 100; i++) {
      expect(passesThrough(middleware(request('/api/incidents', { ip })))).toBe(true)
    }
    const res = middleware(request('/api/incidents', { ip }))
    expect(res.status).toBe(429)
    const retryAfter = Number(res.headers.get('Retry-After'))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(60)
    expect(await res.json()).toEqual({ error: 'Too many requests. Please slow down.' })

    // Other clients are unaffected
    expect(passesThrough(middleware(request('/api/incidents')))).toBe(true)
  })

  it('never rate-limits or blocks /api/health', () => {
    const ip = uniqueIp()
    for (let i = 0; i < 105; i++) {
      expect(passesThrough(middleware(request('/api/health', { ip })))).toBe(true)
    }
  })
})
