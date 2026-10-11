import { describe, expect, it } from 'vitest'
import { safeReturnTo } from '@/lib/safe-redirect'

describe('safeReturnTo', () => {
  it('keeps same-site paths, including query and hash', () => {
    expect(safeReturnTo('/dashboard')).toBe('/dashboard')
    expect(safeReturnTo('/incidents?status=OPEN&q=db#list')).toBe('/incidents?status=OPEN&q=db#list')
    expect(safeReturnTo('/invite/abc_DEF-123')).toBe('/invite/abc_DEF-123')
  })

  it('normalises dot segments but stays on the site', () => {
    expect(safeReturnTo('/a/../dashboard')).toBe('/dashboard')
  })

  it.each([
    ['protocol-relative', '//evil.com'],
    ['tab trick (the confirmed bypass)', decodeURIComponent('/%09/evil.com')],
    ['newline trick', decodeURIComponent('/%0A/evil.com')],
    ['carriage return trick', decodeURIComponent('/%0D/evil.com')],
    ['backslash', '/\\evil.com'],
    ['backslash later in the path', '/x/..\\..\\evil.com'],
    ['absolute URL', 'https://evil.com/dashboard'],
    ['javascript URL', 'javascript:alert(1)'],
    ['relative path', 'dashboard'],
    ['empty', ''],
    ['too long', `/${'a'.repeat(3000)}`]
  ])('rejects %s', (_label, value) => {
    expect(safeReturnTo(value)).toBeUndefined()
  })

  it('rejects null and undefined', () => {
    expect(safeReturnTo(null)).toBeUndefined()
    expect(safeReturnTo(undefined)).toBeUndefined()
  })
})
