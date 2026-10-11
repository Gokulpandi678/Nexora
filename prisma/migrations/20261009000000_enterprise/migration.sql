-- DropIndex
DROP INDEX "MatchLink_newIncidentId_originalIncidentId_idx";

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "actualMTTR" INTEGER,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "department" TEXT NOT NULL DEFAULT 'Unassigned',
ADD COLUMN     "estimatedMTTR" INTEGER,
ADD COLUMN     "initialFixes" TEXT,
ADD COLUMN     "recurringCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Solution" ADD COLUMN     "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "monitoring" TEXT,
ADD COLUMN     "preventionRules" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;

-- AlterTable
ALTER TABLE "MatchLink" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "didSolutionWork" BOOLEAN,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "delivered" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "parentId" TEXT,
    "author" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_incidentId_createdAt_idx" ON "Comment"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "ActivityLog_incidentId_timestamp_idx" ON "ActivityLog"("incidentId", "timestamp");

-- CreateIndex
CREATE INDEX "Incident_department_idx" ON "Incident"("department");

-- CreateIndex
CREATE INDEX "Incident_createdAt_idx" ON "Incident"("createdAt");

-- CreateIndex
CREATE INDEX "Incident_deletedAt_idx" ON "Incident"("deletedAt");

-- CreateIndex
CREATE INDEX "Incident_affectedSystems_idx" ON "Incident" USING GIN ("affectedSystems");

-- Full-text search: a stored generated column keeps the vector in sync without triggers.
-- Title is weighted highest, then symptoms, then description.
ALTER TABLE "Incident" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("symptoms", '')), 'B') ||
  setweight(to_tsvector('english', coalesce("description", '')), 'C')
) STORED;

-- CreateIndex
CREATE INDEX "Incident_searchVector_idx" ON "Incident" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Solution_status_idx" ON "Solution"("status");

-- CreateIndex
CREATE INDEX "MatchLink_originalIncidentId_idx" ON "MatchLink"("originalIncidentId");

-- CreateIndex
CREATE INDEX "MatchLink_solutionUsed_idx" ON "MatchLink"("solutionUsed");

-- CreateIndex
CREATE INDEX "NotificationLog_recipientEmail_readAt_idx" ON "NotificationLog"("recipientEmail", "readAt");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill derived fields for incidents created before this migration
UPDATE "Incident" SET "actualMTTR" = GREATEST(0, ROUND(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 60))::int
WHERE "resolvedAt" IS NOT NULL;

UPDATE "Incident" i SET "recurringCount" = 1 + (SELECT count(*) FROM "Incident" c WHERE c."linkedToId" = i."id");

UPDATE "Incident" SET "tags" = '{}' WHERE "tags" IS NULL;

INSERT INTO "ActivityLog" ("id", "incidentId", "action", "actor", "details", "timestamp")
SELECT 'mig_' || "id", "id", 'CREATED', "createdBy", 'Incident reported (' || "severity" || ')', "createdAt" FROM "Incident";
