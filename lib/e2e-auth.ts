/**
 * Test-only sign-in for the Playwright suite, which cannot log in through WorkOS's hosted page.
 *
 * Switched on only when E2E_AUTH_SECRET is set (32+ characters) AND the app is not a production build:
 * `next start` and every Vercel deployment run with NODE_ENV=production, so it can never activate there,
 * even if the secret leaks into their environment. While on, WorkOS is not used at all: the middleware and
 * getSession() trust a cookie holding a user id signed with the secret (HMAC-SHA256).
 *
 * Uses Web Crypto only, so the same code runs in the middleware (edge) and in route handlers (Node).
 */

export const E2E_COOKIE = 'nexora-e2e'
export const E2E_LOGIN_PATH = '/api/e2e/login'

export function e2eAuthEnabled(): boolean {
  const secret = process.env.E2E_AUTH_SECRET
  return process.env.NODE_ENV !== 'production' && typeof secret === 'string' && secret.length >= 32
}

const encoder = new TextEncoder()

async function signature(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(process.env.E2E_AUTH_SECRET ?? ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Constant-time string comparison, so a wrong signature reveals nothing through timing. */
export function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Cookie value for a user: `<userId>.<signature>`. */
export async function signE2eSession(userId: string): Promise<string> {
  return `${userId}.${await signature(userId)}`
}

/** The user id in a valid cookie; null when test sign-in is off, or the cookie is missing or forged. */
export async function verifyE2eSession(token: string | undefined | null): Promise<string | null> {
  if (!e2eAuthEnabled() || !token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const userId = token.slice(0, dot)
  return sameString(token.slice(dot + 1), await signature(userId)) ? userId : null
}
