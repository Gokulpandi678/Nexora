/**
 * Embeds incidents that have no embedding yet (or one from a different model), so meaning-based
 * matching covers incidents reported before embeddings were switched on.
 *
 *   npm run embeddings:backfill
 *
 * Needs VOYAGE_API_KEY or OPENAI_API_KEY (see .env.example). Safe to re-run and to interrupt.
 */
import { prisma } from '@/lib/db'
import { embedTexts, embeddingConfig, incidentEmbeddingText, saveIncidentEmbedding } from '@/lib/embeddings'

const BATCH = 32

async function main(): Promise<void> {
  const config = embeddingConfig()
  if (!config) throw new Error('Set VOYAGE_API_KEY or OPENAI_API_KEY first')
  console.log(`Embedding with ${config.provider} / ${config.model}`)

  let done = 0
  let failed = 0
  let cursor: string | undefined
  for (;;) {
    // Raw query: the vector column is not visible to the Prisma client
    const batch = await prisma.$queryRaw<{ id: string; title: string; symptoms: string; description: string }[]>`
      SELECT "id", "title", "symptoms", "description" FROM "Incident"
      WHERE "deletedAt" IS NULL
        AND ("embedding" IS NULL OR "embeddingModel" IS DISTINCT FROM ${config.model})
        AND (${cursor ?? null}::text IS NULL OR "id" > ${cursor ?? ''})
      ORDER BY "id"
      LIMIT ${BATCH}
    `
    if (batch.length === 0) break
    cursor = batch[batch.length - 1]?.id

    const vectors = await embedTexts(batch.map(incidentEmbeddingText))
    if (!vectors) {
      failed += batch.length
      console.warn(`\nBatch failed (see error above); skipping ${batch.length} incidents`)
      continue
    }
    for (const [n, incident] of batch.entries()) {
      const vector = vectors[n]
      if (vector) await saveIncidentEmbedding(incident.id, vector)
    }
    done += batch.length
    process.stdout.write(`\rEmbedded ${done} incidents`)
  }
  console.log(`\nDone: ${done} embedded${failed ? `, ${failed} failed (re-run to retry)` : ''}`)
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
