import { afterEach, describe, expect, it, vi } from 'vitest'
import { e2eAuthEnabled, sameString, signE2eSession, verifyE2eSession } from '@/lib/e2e-auth'

const SECRET = 'unit-test-secret-0123456789abcdefghij'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('test sign-in switch', () => {
  it('is off without a secret, with a short one, and in any production build', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('E2E_AUTH_SECRET', '')
    expect(e2eAuthEnabled()).toBe(false)
    vi.stubEnv('E2E_AUTH_SECRET', 'too-short')
    expect(e2eAuthEnabled()).toBe(false)
    vi.stubEnv('E2E_AUTH_SECRET', SECRET)
    expect(e2eAuthEnabled()).toBe(true)
    vi.stubEnv('NODE_ENV', 'production')
    expect(e2eAuthEnabled()).toBe(false)
  })
})

describe('signed test cookie', () => {
  it('round-trips a user id', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('E2E_AUTH_SECRET', SECRET)
    expect(await verifyE2eSession(await signE2eSession('user_123'))).toBe('user_123')
  })

  it('rejects a forged or re-targeted cookie', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('E2E_AUTH_SECRET', SECRET)
    const token = await signE2eSession('user_123')
    const signature = token.split('.').at(-1)
    expect(await verifyE2eSession(`someone_else.${signature}`)).toBeNull()
    expect(await verifyE2eSession('user_123.forged')).toBeNull()
    expect(await verifyE2eSession('no-signature')).toBeNull()
    expect(await verifyE2eSession(undefined)).toBeNull()
  })

  it('rejects a cookie signed with another secret', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('E2E_AUTH_SECRET', SECRET)
    const token = await signE2eSession('user_123')
    vi.stubEnv('E2E_AUTH_SECRET', `${SECRET}-rotated`)
    expect(await verifyE2eSession(token)).toBeNull()
  })

  it('accepts nothing in a production build, even a validly signed cookie', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('E2E_AUTH_SECRET', SECRET)
    const token = await signE2eSession('user_123')
    vi.stubEnv('NODE_ENV', 'production')
    expect(await verifyE2eSession(token)).toBeNull()
  })
})

describe('sameString', () => {
  it('compares exactly', () => {
    expect(sameString('abc', 'abc')).toBe(true)
    expect(sameString('abc', 'abd')).toBe(false)
    expect(sameString('abc', 'abcd')).toBe(false)
  })
})
