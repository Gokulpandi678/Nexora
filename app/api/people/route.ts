import { NextResponse } from 'next/server'
import { requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import type { Person } from '@/lib/types'

/**
 * GET /api/people?q=jan — members of the current organization, for @mention autocomplete.
 * (Under tests, where there is no organization, it falls back to people seen on incidents.)
 */
export const GET = route('people.search', async req => {
  const { scope } = await requireOrg(req)
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 60)
  const pattern = `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`

  const people = scope.organizationId
    ? await prisma.$queryRaw<Person[]>`
        SELECT CASE WHEN u."name" = '' THEN u."email" ELSE u."name" END AS name, u."email"
        FROM "Membership" m JOIN "User" u ON u."id" = m."userId"
        WHERE m."organizationId" = ${scope.organizationId} AND m."status" = 'ACTIVE'
          AND (u."name" ILIKE ${pattern} OR u."email" ILIKE ${pattern})
        ORDER BY u."email"
        LIMIT 8
      `
    : await prisma.$queryRaw<Person[]>`
        SELECT DISTINCT ON (email) name, email FROM (
          SELECT "createdBy" AS name, "email" FROM "Incident" WHERE "deletedAt" IS NULL
          UNION ALL SELECT "solvedBy", "email" FROM "Solution" WHERE "email" <> ''
          UNION ALL SELECT "author", "email" FROM "Comment"
        ) p
        WHERE name ILIKE ${pattern} OR email ILIKE ${pattern}
        ORDER BY email, name
        LIMIT 8
      `
  return NextResponse.json(people)
})
