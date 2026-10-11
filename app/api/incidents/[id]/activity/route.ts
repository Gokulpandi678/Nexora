import { NextResponse } from 'next/server'
import { inOrg, notFound, parseWith, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { toActivity } from '@/lib/serializers'
import { paginationSchema } from '@/lib/validators'

type Params = { id: string }

/** GET /api/incidents/:id/activity?page=1 — audit trail, newest first. */
export const GET = route<Params>('incidents.activity', async (req, { params }) => {
  const { id } = await params
  const { scope } = await requireOrg(req)
  const visible = await prisma.incident.findFirst({ where: { id, deletedAt: null, ...inOrg(scope) }, select: { id: true } })
  if (!visible) throw notFound()
  const { page, pageSize } = parseWith(paginationSchema, Object.fromEntries(new URL(req.url).searchParams))
  const [total, entries] = await Promise.all([
    prisma.activityLog.count({ where: { incidentId: id } }),
    prisma.activityLog.findMany({
      where: { incidentId: id },
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ])
  return NextResponse.json({
    items: entries.map(toActivity),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  })
})
