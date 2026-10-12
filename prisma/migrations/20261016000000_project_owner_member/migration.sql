-- The project lead becomes a user (an active member of the project's organization) instead of a typed email.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "ownerId" TEXT;

-- Keep existing owners that are active members of the project's organization; any other address is dropped
UPDATE "Project" p SET "ownerId" = u."id"
FROM "User" u
JOIN "Membership" m ON m."userId" = u."id" AND m."status" = 'ACTIVE'
WHERE p."ownerEmail" IS NOT NULL
  AND lower(p."ownerEmail") = lower(u."email")
  AND m."organizationId" = p."organizationId";

ALTER TABLE "Project" DROP COLUMN "ownerEmail";

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
