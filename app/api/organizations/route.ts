import { NextResponse } from 'next/server'
import { route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sessionOrThrow, type OrganizationSummary } from '@/lib/organizations'

/** GET /api/organizations?q= — organizations the signed-in user can still ask to join. */
export const GET = route('organizations.list', async req => {
  const session = await sessionOrThrow()
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 120)
  // Organizations the user already belongs to or has asked to join are not offered again
  const taken = session.memberships.filter(m => m.status !== 'REJECTED').map(m => m.organization.id)
  const orgs = await prisma.organization.findMany({
    where: {
      suspendedAt: null,
      ...(q && { name: { contains: q, mode: 'insensitive' } }),
      ...(taken.length && { id: { notIn: taken } })
    },
    select: {
      id: true, name: true, slug: true, industry: true, size: true,
      _count: { select: { memberships: { where: { status: 'ACTIVE' } } } }
    },
    orderBy: { name: 'asc' },
    take: 50
  })
  const items: OrganizationSummary[] = orgs.map(({ _count, ...o }) => ({ ...o, memberCount: _count.memberships }))
  return NextResponse.json({ items })
}, { members: false })
