import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '@/lib/rate-limit'

describe('createRateLimiter', () => {
  it('allows up to the limit, then blocks until the window resets', () => {
    const check = createRateLimiter({ limit: 3, windowMs: 1000 })
    const t0 = 1_000_000
    expect(check('ip', t0)).toEqual({ allowed: true, remaining: 2, resetAt: t0 + 1000 })
    expect(check('ip', t0 + 10)).toMatchObject({ allowed: true, remaining: 1 })
    expect(check('ip', t0 + 20)).toMatchObject({ allowed: true, remaining: 0 })
    expect(check('ip', t0 + 30)).toEqual({ allowed: false, remaining: 0, resetAt: t0 + 1000 })
    expect(check('ip', t0 + 999).allowed).toBe(false)

    expect(check('ip', t0 + 1000)).toEqual({ allowed: true, remaining: 2, resetAt: t0 + 2000 })
  })

  it('tracks keys independently', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 1000 })
    expect(check('a', 0).allowed).toBe(true)
    expect(check('a', 1).allowed).toBe(false)
    expect(check('b', 1).allowed).toBe(true)
  })
})
