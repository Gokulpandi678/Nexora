// Any origin works here: it only lets us see whether a value would leave the site once resolved
const PROBE_ORIGIN = 'https://nexora.invalid'

/**
 * A `?next=` / `?returnTo=` value reduced to a path on this site, or undefined if it could lead elsewhere.
 *
 * Prefix checks alone are not enough: browsers drop tabs and newlines inside URLs and treat `\` like `/`,
 * so "/%09/evil.com" or "/\evil.com" would pass a "starts with one slash" test and still land on
 * evil.com. So control characters and backslashes are refused outright, and the value is resolved
 * with the URL parser and must stay on our origin.
 */
export function safeReturnTo(value: string | null | undefined): string | undefined {
  if (!value || value.length > 2048 || !value.startsWith('/')) return undefined
  if (/[\u0000-\u001F\u007F\\]/.test(value)) return undefined
  try {
    const url = new URL(value, PROBE_ORIGIN)
    if (url.origin !== PROBE_ORIGIN) return undefined
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return undefined
  }
}
