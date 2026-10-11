import { describe, expect, it } from 'vitest'
import { actorFromHeaders as getActor, hasRole, type Actor } from '@/lib/auth'
import { HttpError, requireActor } from '@/lib/api'

function request(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/x', { headers })
}

const base = {
  'x-user-name': encodeURIComponent('Zoë Ølsen 山田'),
  'x-user-email': encodeURIComponent('Zoe@Example.com'),
  'x-user-department': 'Platform',
  'x-user-role': 'VERIFIER'
}

async function statusOf(fn: () => Promise<unknown>): Promise<number | null> {
  try {
    await fn()
    return null
  } catch (error) {
    if (error instanceof HttpError) return error.status
    throw error
  }
}

describe('getActor', () => {
  it('decodes URI-encoded non-ASCII names and normalises email', () => {
    expect(getActor(request(base))).toEqual({
      name: 'Zoë Ølsen 山田', email: 'zoe@example.com', department: 'Platform', role: 'VERIFIER'
    })
  })

  it('returns null without identity, with a bad email or a blank name', () => {
    expect(getActor(request({}))).toBeNull()
    expect(getActor(request({ ...base, 'x-user-email': 'not-an-email' }))).toBeNull()
    expect(getActor(request({ ...base, 'x-user-name': encodeURIComponent('   ') }))).toBeNull()
  })

  it('returns null for malformed URI encoding', () => {
    expect(getActor(request({ ...base, 'x-user-name': '%E0%A4%A' }))).toBeNull()
  })

  it('falls back for an unknown department and role', () => {
    const actor = getActor(request({ ...base, 'x-user-department': 'Mars', 'x-user-role': 'GOD' }))
    expect(actor).toMatchObject({ department: 'Unassigned', role: 'REPORTER' })
  })
})

describe('hasRole', () => {
  const as = (role: Actor['role']): Actor => ({ name: 'n', email: 'n@x.com', department: 'IT', role })

  it('orders VIEWER < REPORTER < VERIFIER < ADMIN', () => {
    expect(hasRole(as('VIEWER'), 'VIEWER')).toBe(true)
    expect(hasRole(as('VIEWER'), 'REPORTER')).toBe(false)
    expect(hasRole(as('REPORTER'), 'VERIFIER')).toBe(false)
    expect(hasRole(as('VERIFIER'), 'REPORTER')).toBe(true)
    expect(hasRole(as('VERIFIER'), 'ADMIN')).toBe(false)
    expect(hasRole(as('ADMIN'), 'VERIFIER')).toBe(true)
    expect(hasRole(null, 'VIEWER')).toBe(false)
  })
})

describe('requireActor', () => {
  it('throws 401 without identity and 403 with too low a role', async () => {
    expect(await statusOf(() => requireActor(request({})))).toBe(401)
    expect(await statusOf(() => requireActor(request(base), 'ADMIN'))).toBe(403)
    expect((await requireActor(request(base), 'VERIFIER')).email).toBe('zoe@example.com')
  })
})
