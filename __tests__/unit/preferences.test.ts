import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, diffPreferences, parsePreferences, preferencesPatchSchema } from '@/lib/preferences'

describe('parsePreferences (never throws, falls back per field)', () => {
  it.each([null, undefined, 'dark', 42, [], ['theme', 'dark']])('turns %j into the defaults', value => {
    expect(parsePreferences(value)).toEqual(DEFAULT_PREFERENCES)
  })

  it('keeps valid fields and replaces only the broken ones', () => {
    expect(parsePreferences({ theme: 'dark', uiStyle: 'neon-pink', sidebarCollapsed: 'yes', incidentView: 'board' }))
      .toEqual({ theme: 'dark', uiStyle: DEFAULT_PREFERENCES.uiStyle, sidebarCollapsed: false, incidentView: 'board' })
  })

  it('fills in fields added after the value was saved, and drops unknown ones', () => {
    expect(parsePreferences({ theme: 'light', legacyThing: true })).toEqual({ ...DEFAULT_PREFERENCES, theme: 'light' })
  })

  it('has safe defaults', () => {
    expect(DEFAULT_PREFERENCES).toEqual({ theme: 'system', uiStyle: 'aurora', sidebarCollapsed: false, incidentView: 'table' })
  })
})

describe('preferencesPatchSchema', () => {
  it('accepts any subset', () => {
    expect(preferencesPatchSchema.parse({ incidentView: 'cards' })).toEqual({ incidentView: 'cards' })
  })

  it('rejects empty, invalid or unknown fields', () => {
    expect(preferencesPatchSchema.safeParse({}).success).toBe(false)
    expect(preferencesPatchSchema.safeParse({ theme: 'sepia' }).success).toBe(false)
    expect(preferencesPatchSchema.safeParse({ theme: 'dark', isSuperAdmin: true }).success).toBe(false)
  })
})

describe('diffPreferences', () => {
  it('returns only what changed', () => {
    expect(diffPreferences(DEFAULT_PREFERENCES, { ...DEFAULT_PREFERENCES, theme: 'dark', sidebarCollapsed: true }))
      .toEqual({ theme: 'dark', sidebarCollapsed: true })
    expect(diffPreferences(DEFAULT_PREFERENCES, { ...DEFAULT_PREFERENCES })).toEqual({})
  })
})
