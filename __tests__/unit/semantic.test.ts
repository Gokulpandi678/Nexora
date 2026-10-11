import { afterEach, describe, expect, it, vi } from 'vitest'
import { MIN_SIMILARITY, SEMANTIC_BOUNDS, semanticPercent } from '@/lib/search'
import { embeddingConfig, embedTexts, incidentEmbeddingText, toVectorLiteral } from '@/lib/embeddings'

describe('semanticPercent', () => {
  it('is 1 at or below the floor and 99 at or above the ceiling', () => {
    expect(semanticPercent(SEMANTIC_BOUNDS.floor - 0.1, 0, 0)).toBe(1)
    expect(semanticPercent(SEMANTIC_BOUNDS.ceiling + 0.1, 1, 1)).toBe(99)
  })

  it('needs a clearly close meaning to cross the match threshold', () => {
    expect(semanticPercent(0.5, 0, 2)).toBeLessThan(MIN_SIMILARITY)
    expect(semanticPercent(0.66, 1, 2)).toBeGreaterThanOrEqual(MIN_SIMILARITY)
  })

  it('shared systems only top up the score', () => {
    expect(semanticPercent(0.7, 2, 2) - semanticPercent(0.7, 0, 2)).toBe(15)
  })
})

describe('embeddings helpers', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('formats pgvector literals and neutralises non-finite numbers', () => {
    expect(toVectorLiteral([0.5, -1, Number.NaN])).toBe('[0.5,-1,0]')
  })

  it('leads with title and symptoms and caps length', () => {
    const text = incidentEmbeddingText({ title: 'T', symptoms: 'S', description: 'x'.repeat(10_000) })
    expect(text.startsWith('T\n\nSymptoms: S')).toBe(true)
    expect(text.length).toBe(8000)
  })

  it('is off without a key, prefers Voyage, and honours EMBEDDINGS_PROVIDER', () => {
    vi.stubEnv('VOYAGE_API_KEY', '')
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(embeddingConfig()).toBeNull()
    vi.stubEnv('VOYAGE_API_KEY', 'v')
    vi.stubEnv('OPENAI_API_KEY', 'o')
    expect(embeddingConfig()?.provider).toBe('voyage')
    vi.stubEnv('EMBEDDINGS_PROVIDER', 'openai')
    expect(embeddingConfig()?.provider).toBe('openai')
  })

  it('returns null instead of throwing when the provider fails', async () => {
    vi.stubEnv('VOYAGE_API_KEY', 'v')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await embedTexts(['hello'])).toBeNull()
    fetchMock.mockRestore()
    errors.mockRestore()
  })
})
