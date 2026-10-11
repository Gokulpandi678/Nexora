import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJson, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import type { NotificationDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/notifications — the current user's 20 latest notifications and unread count. */
export const GET = route('notifications.list', async req => {
  const { actor, scope } = await requireOrg(req)
  // The inbox follows the selected organization
  const where = { recipientEmail: actor.email, ...(scope.organizationId && { organizationId: scope.organizationId }) }
  const [items, unread] = await Promise.all([
    prisma.notificationLog.findMany({ where, orderBy: { sentAt: 'desc' }, take: 20 }),
    prisma.notificationLog.count({ where: { ...where, readAt: null } })
  ])
  const body: { items: NotificationDTO[]; unread: number } = {
    items: items.map(n => ({
      id: n.id,
      incidentId: n.incidentId,
      notificationType: n.notificationType,
      title: n.title,
      readAt: n.readAt?.toISOString() ?? null,
      sentAt: n.sentAt.toISOString()
    })),
    unread
  }
  return NextResponse.json(body)
})

const markReadSchema = z.object({ ids: z.array(z.string().max(64)).max(100).optional() })

/** PATCH /api/notifications — mark the given ids (or all) as read. */
export const PATCH = route('notifications.read', async req => {
  const { actor, scope } = await requireOrg(req)
  const { ids } = await parseJson(req, markReadSchema)
  const { count } = await prisma.notificationLog.updateMany({
    where: {
      recipientEmail: actor.email,
      readAt: null,
      ...(scope.organizationId && { organizationId: scope.organizationId }),
      ...(ids && { id: { in: ids } })
    },
    data: { readAt: new Date() }
  })
  return NextResponse.json({ updated: count })
})
