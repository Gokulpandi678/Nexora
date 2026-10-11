-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "symptoms" TEXT NOT NULL,
    "affectedSystems" TEXT[],
    "severity" TEXT NOT NULL DEFAULT 'P2',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "linkedToId" TEXT,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Solution" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "rootCause" TEXT NOT NULL,
    "approach" TEXT NOT NULL,
    "timeToFix" INTEGER NOT NULL,
    "efficiency" TEXT NOT NULL DEFAULT 'MEDIUM',
    "useCaseNotes" TEXT NOT NULL,
    "qaChecks" TEXT[],
    "solvedBy" TEXT NOT NULL,
    "solvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',

    CONSTRAINT "Solution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchLink" (
    "id" TEXT NOT NULL,
    "newIncidentId" TEXT NOT NULL,
    "originalIncidentId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'SIMILAR',
    "solutionUsed" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Incident_status_severity_createdAt_idx" ON "Incident"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_linkedToId_idx" ON "Incident"("linkedToId");

-- CreateIndex
CREATE INDEX "Solution_incidentId_idx" ON "Solution"("incidentId");

-- CreateIndex
CREATE INDEX "MatchLink_newIncidentId_originalIncidentId_idx" ON "MatchLink"("newIncidentId", "originalIncidentId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchLink_newIncidentId_originalIncidentId_key" ON "MatchLink"("newIncidentId", "originalIncidentId");

-- CreateIndex
CREATE INDEX "NotificationLog_recipientEmail_incidentId_idx" ON "NotificationLog"("recipientEmail", "incidentId");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_linkedToId_fkey" FOREIGN KEY ("linkedToId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solution" ADD CONSTRAINT "Solution_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLink" ADD CONSTRAINT "MatchLink_newIncidentId_fkey" FOREIGN KEY ("newIncidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLink" ADD CONSTRAINT "MatchLink_originalIncidentId_fkey" FOREIGN KEY ("originalIncidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

