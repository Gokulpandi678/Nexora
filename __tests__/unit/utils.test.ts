import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatMinutes, initials, pluralize, shortId, timeAgo } from '@/lib/utils'

describe('formatMinutes', () => {
  it.each([
    [null, '—'],
    [undefined, '—'],
    [0, '0 min'],
    [59, '59 min'],
    [60, '1h'],
    [90, '1h 30m'],
    [1440, '1d'],
    [1500, '1d 1h'],
    [3 * 1440 + 59, '3d']
  ])('%s → %s', (input, expected) => {
    expect(formatMinutes(input)).toBe(expected)
  })
})

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a relative phrase with a suffix', () => {
    expect(timeAgo('2025-06-15T09:00:00Z')).toBe('3 hours ago')
    expect(timeAgo(new Date('2025-06-13T12:00:00Z'))).toBe('2 days ago')
    expect(timeAgo('2025-06-15T12:05:00Z')).toBe('in 5 minutes')
  })
})

describe('initials', () => {
  it('uses the first and last word', () => {
    expect(initials('ada lovelace')).toBe('AL')
    expect(initials('  Jean  Claude Van Damme ')).toBe('JD')
    expect(initials('Cher')).toBe('C')
    expect(initials('Élodie Ñúñez')).toBe('ÉÑ')
  })

  it('falls back to ? for blank names', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
  })
})

describe('pluralize', () => {
  it('handles singular, plural and a custom plural', () => {
    expect(pluralize(1, 'incident')).toBe('1 incident')
    expect(pluralize(0, 'incident')).toBe('0 incidents')
    expect(pluralize(2, 'person', 'people')).toBe('2 people')
  })
})

describe('shortId', () => {
  it('keeps the last 7 characters', () => {
    expect(shortId('clx0123456789abcdef')).toBe('#9abcdef')
  })
})
