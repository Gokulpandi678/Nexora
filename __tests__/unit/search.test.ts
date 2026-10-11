import { describe, expect, it } from 'vitest'
import { extractTerms, MIN_SIMILARITY, similarityPercent, toPrefixQuery } from '@/lib/search'

describe('extractTerms', () => {
  it('lowercases, dedupes and drops stopwords and short words', () => {
    expect(extractTerms('The API and the api WERE down for DB')).toEqual(['api', 'down'])
  })

  it('splits on any non-alphanumeric character', () => {
    expect(extractTerms('pool-exhausted; 504 timeout')).toEqual(['pool', 'exhausted', '504', 'timeout'])
  })

  it('respects max and minLength', () => {
    expect(extractTerms('alpha beta gamma delta', 2)).toEqual(['alpha', 'beta'])
    expect(extractTerms('db is up', 24, 2)).toEqual(['db', 'is', 'up'])
  })

  it('returns [] for text with no usable words', () => {
    expect(extractTerms('!!! ?? the and')).toEqual([])
  })
})

describe('toPrefixQuery', () => {
  it('builds an AND of prefix terms', () => {
    expect(toPrefixQuery('db time')).toBe('db:* & time:*')
  })

  it('strips tsquery operators and other unsafe characters', () => {
    const query = toPrefixQuery("conn' | !pool & (x):* <-> drop;--")
    expect(query).toBe('conn:* & pool:* & drop:*')
    for (const term of query?.split(' & ') ?? []) expect(term).toMatch(/^[a-z0-9]+:\*$/)
  })

  it('drops non-ASCII letters rather than passing them through', () => {
    expect(toPrefixQuery('café ünïcode')).toBe('caf:* & code:*')
  })

  it('returns null when nothing is searchable', () => {
    expect(toPrefixQuery('')).toBeNull()
    expect(toPrefixQuery('& | !')).toBeNull()
  })

  it('limits to 8 terms', () => {
    const q = toPrefixQuery('aa bb cc dd ee ff gg hh ii jj')
    expect(q?.split(' & ')).toHaveLength(8)
  })
})

describe('similarityPercent', () => {
  it('is always between 1 and 99', () => {
    expect(similarityPercent(0, 10, 0, 0)).toBe(1)
    expect(similarityPercent(0, 0, 0, 0)).toBe(1)
    expect(similarityPercent(50, 10, 5, 2)).toBe(99)
    expect(similarityPercent(10, 10, 2, 2)).toBe(99)
  })

  it('weights keyword coverage above system overlap', () => {
    expect(similarityPercent(10, 10, 0, 2)).toBe(85)
    expect(similarityPercent(0, 10, 2, 2)).toBe(15)
  })

  it('caps the term denominator at 10', () => {
    expect(similarityPercent(10, 24, 0, 0)).toBe(similarityPercent(10, 10, 0, 0))
  })

  it('a shared system alone never reaches the display threshold', () => {
    expect(similarityPercent(0, 10, 1, 1)).toBeLessThan(MIN_SIMILARITY)
  })
})
