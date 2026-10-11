import { prisma } from '@/lib/db'
import { logError } from '@/lib/logger'

/**
 * Text embeddings for semantic ("same meaning, different words") incident matching.
 *
 * Providers (picked by EMBEDDINGS_PROVIDER, else whichever key is set, Voyage first):
 *   voyage  VOYAGE_API_KEY   voyage-3.5-lite        (1024 dims)
 *   openai  OPENAI_API_KEY   text-embedding-3-small (shortened to 1024 dims)
 * With no key configured, matching stays keyword-only. Calls never throw: failures return null.
 */
export const EMBEDDING_DIMENSIONS = 1024

type Provider = 'voyage' | 'openai'

interface ProviderConfig {
  provider: Provider
  model: string
  apiKey: string
}

export function embeddingConfig(): ProviderConfig | null {
  const wanted = process.env.EMBEDDINGS_PROVIDER?.toLowerCase()
  const voyage = process.env.VOYAGE_API_KEY
  const openai = process.env.OPENAI_API_KEY
  if ((wanted === 'voyage' || !wanted) && voyage) {
    return { provider: 'voyage', model: process.env.EMBEDDINGS_MODEL || 'voyage-3.5-lite', apiKey: voyage }
  }
  if ((wanted === 'openai' || !wanted) && openai) {
    return { provider: 'openai', model: process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small', apiKey: openai }
  }
  return null
}

export const embeddingsEnabled = (): boolean => embeddingConfig() !== null

/** Title and symptoms lead; capped so one huge description cannot blow the token limit. */
export function incidentEmbeddingText(incident: { title: string; symptoms: string; description: string }): string {
  return `${incident.title}\n\nSymptoms: ${incident.symptoms}\n\n${incident.description}`.slice(0, 8000)
}

const MAX_BATCH = 64

/** Embeds up to 64 texts. Returns null if embeddings are off or the provider call fails. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const config = embeddingConfig()
  if (!config || texts.length === 0) return null
  if (texts.length > MAX_BATCH) throw new Error(`embedTexts takes at most ${MAX_BATCH} texts`)

  try {
    const res = await fetch(
      config.provider === 'voyage' ? 'https://api.voyageai.com/v1/embeddings' : 'https://api.openai.com/v1/embeddings',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(
          config.provider === 'voyage'
            ? { input: texts, model: config.model, input_type: 'document', output_dimension: EMBEDDING_DIMENSIONS }
            : { input: texts, model: config.model, dimensions: EMBEDDING_DIMENSIONS }
        ),
        signal: AbortSignal.timeout(10_000)
      }
    )
    if (!res.ok) {
      logError(new Error(`Embeddings API ${res.status}: ${(await res.text()).slice(0, 300)}`), { step: 'embedTexts', provider: config.provider })
      return null
    }
    const body = (await res.json()) as { data: { embedding: number[]; index: number }[] }
    const vectors = [...body.data].sort((a, b) => a.index - b.index).map(d => d.embedding)
    if (vectors.length !== texts.length || vectors.some(v => v.length !== EMBEDDING_DIMENSIONS)) {
      logError(new Error('Embeddings API returned an unexpected shape'), { step: 'embedTexts', provider: config.provider })
      return null
    }
    return vectors
  } catch (error) {
    logError(error, { step: 'embedTexts', provider: config.provider })
    return null
  }
}

export async function embedText(text: string): Promise<number[] | null> {
  return (await embedTexts([text]))?.[0] ?? null
}

/** pgvector text literal: [0.1,0.2,…] */
export const toVectorLiteral = (vector: number[]): string => `[${vector.map(n => (Number.isFinite(n) ? n : 0)).join(',')}]`

export async function saveIncidentEmbedding(incidentId: string, vector: number[]): Promise<void> {
  const model = embeddingConfig()?.model ?? 'unknown'
  await prisma.$executeRaw`
    UPDATE "Incident" SET "embedding" = ${toVectorLiteral(vector)}::vector, "embeddingModel" = ${model}
    WHERE "id" = ${incidentId}
  `
}

/** The stored vector for an incident, if it was embedded with the current model. */
export async function loadIncidentEmbedding(incidentId: string): Promise<number[] | null> {
  const model = embeddingConfig()?.model
  if (!model) return null
  const rows = await prisma.$queryRaw<{ embedding: string | null }[]>`
    SELECT "embedding"::text AS embedding FROM "Incident" WHERE "id" = ${incidentId} AND "embeddingModel" = ${model}
  `
  const text = rows[0]?.embedding
  return text ? (JSON.parse(text) as number[]) : null
}

/** Embeds an incident and stores the vector. Returns it, or null when embeddings are off or failed. */
export async function embedIncident(incident: { id: string; title: string; symptoms: string; description: string }): Promise<number[] | null> {
  const vector = await embedText(incidentEmbeddingText(incident))
  if (vector) {
    try {
      await saveIncidentEmbedding(incident.id, vector)
    } catch (error) {
      logError(error, { step: 'saveIncidentEmbedding', incidentId: incident.id })
    }
  }
  return vector
}
