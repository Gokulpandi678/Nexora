/**
 * Fixed-window rate limiter.
 *
 * In-memory, so limits apply per server instance. On multi-instance or serverless deployments,
 * back this with a shared store (Upstash Redis, Vercel KV) using the same interface.
 */
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  return function check(key: string, now: number = Date.now()): RateLimitResult {
    // Opportunistic cleanup keeps memory bounded without a timer
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
    }
    const entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
    }
    entry.count += 1
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt }
  }
}
