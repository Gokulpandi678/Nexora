-- Semantic matching needs pgvector (available on Supabase; locally use the pgvector/pgvector image)
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "embedding" vector(1024),
ADD COLUMN     "embeddingModel" TEXT,
ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "organizationId" TEXT;

-- CreateIndex
CREATE INDEX "Incident_organizationId_deletedAt_createdAt_idx" ON "Incident"("organizationId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_recipientEmail_organizationId_idx" ON "NotificationLog"("recipientEmail", "organizationId");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

