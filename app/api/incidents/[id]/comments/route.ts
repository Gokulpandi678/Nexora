import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity'
import { badRequest, inOrg, notFound, parseJson, parseWith, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sendMentionNotification } from '@/lib/email'
import { activeMemberEmails } from '@/lib/members'
import { toComment } from '@/lib/serializers'
import { createCommentSchema, paginationSchema } from '@/lib/validators'
import type { CommentDTO, Paginated } from '@/lib/types'

type Params = { id: string }

/** GET /api/incidents/:id/comments?page=1 — top-level comments (oldest first) with their replies. */
export const GET = route<Params>('comments.list', async (req, { params }) => {
  const { id } = await params
  const { scope } = await requireOrg(req)
  const { page, pageSize } = parseWith(paginationSchema, Object.fromEntries(new URL(req.url).searchParams))
  const where = { incidentId: id, parentId: null, incident: { deletedAt: null, ...inOrg(scope) } }

  const [total, comments] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { replies: { orderBy: { createdAt: 'asc' } } }
    })
  ])
  const body: Paginated<CommentDTO> = {
    items: comments.map(toComment),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  }
  return NextResponse.json(body)
})

/** POST /api/incidents/:id/comments — add a comment or reply; mentioned people are notified. */
export const POST = route<Params>('comments.create', async (req, { params }) => {
  const { id } = await params
  const { actor, scope } = await requireOrg(req, 'REPORTER')
  const input = await parseJson(req, createCommentSchema)

  const incident = await prisma.incident.findFirst({ where: { id, deletedAt: null, ...inOrg(scope) }, select: { title: true } })
  if (!incident) throw notFound()

  let parentId: string | null = null
  if (input.parentId) {
    const parent = await prisma.comment.findFirst({ where: { id: input.parentId, incidentId: id } })
    if (!parent) throw badRequest('The comment you are replying to does not exist')
    // Threads are one level deep: a reply to a reply joins the same thread
    parentId = parent.parentId ?? parent.id
  }

  // Only members of this organization can be mentioned (and so emailed). Anything else is dropped,
  // so a comment can never send incident details outside the organization.
  const mentions = scope.organizationId
    ? [...(await activeMemberEmails(scope.organizationId, input.mentions))]
    : input.mentions

  const comment = await prisma.$transaction(async tx => {
    const created = await tx.comment.create({
      data: { incidentId: id, parentId, author: actor.name, email: actor.email, content: input.content, mentions }
    })
    await logActivity(tx, id, 'COMMENTED', actor.name, parentId ? 'Replied to a comment' : 'Added a comment')
    return created
  })

  const excerpt = input.content.length > 280 ? `${input.content.slice(0, 277)}…` : input.content
  await Promise.all(
    mentions
      .filter(email => email !== actor.email)
      .map(to => sendMentionNotification({ to, incidentId: id, incidentTitle: incident.title, author: actor.name, excerpt }))
  )

  return NextResponse.json(toComment(comment), { status: 201 })
})
