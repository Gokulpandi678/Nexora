-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "impact" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "mitigatedAt" TIMESTAMP(3),
ADD COLUMN     "slaPausedAt" TIMESTAMP(3),
ADD COLUMN     "slaPausedMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slaResolveBreachedAt" TIMESTAMP(3),
ADD COLUMN     "slaResolveDueAt" TIMESTAMP(3),
ADD COLUMN     "slaResponseBreachedAt" TIMESTAMP(3),
ADD COLUMN     "slaResponseDueAt" TIMESTAMP(3),
ADD COLUMN     "slaWarnedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "ownerEmail" TEXT,
    "criticality" TEXT NOT NULL DEFAULT 'MEDIUM',
    "availabilityTarget" DOUBLE PRECISION NOT NULL DEFAULT 99.9,
    "downtimeCostPerMinute" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "responseMinutes" INTEGER NOT NULL,
    "resolveMinutes" INTEGER NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_IncidentToProject" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_IncidentToProject_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Project_organizationId_archivedAt_idx" ON "Project"("organizationId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_name_key" ON "Project"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicy_projectId_severity_key" ON "SlaPolicy"("projectId", "severity");

-- CreateIndex
CREATE INDEX "_IncidentToProject_B_index" ON "_IncidentToProject"("B");

-- CreateIndex
CREATE INDEX "Incident_status_slaResolveDueAt_idx" ON "Incident"("status", "slaResolveDueAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IncidentToProject" ADD CONSTRAINT "_IncidentToProject_A_fkey" FOREIGN KEY ("A") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IncidentToProject" ADD CONSTRAINT "_IncidentToProject_B_fkey" FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

