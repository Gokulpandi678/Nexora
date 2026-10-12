import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { HttpError, notFound, parseJson, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { assertActiveMember, projectInclude, toProjectDTO } from '@/lib/projects'
import { projectUpdateSchema } from '@/lib/validators'

type Params = { id: string }

/**
 * PATCH /api/projects/:id — edit a project, replace its SLA policies, or archive / restore it (admins).
 * New policies apply to incidents reported from now on; open incidents keep the due dates they were given.
 */
export const PATCH = route<Params>('projects.update', async (req, { params }) => {
  const { id } = await params
  const { scope } = await requireOrg(req, 'ADMIN')
  const { slaPolicies, archived, ...input } = await parseJson(req, projectUpdateSchema)

  const current = await prisma.project.findFirst({
    where: { id, ...(scope.organizationId ? { organizationId: scope.organizationId } : {}) },
    select: { id: true, archivedAt: true, organizationId: true, ownerId: true }
  })
  if (!current) throw notFound('Project')
  // A new lead must be an active member; keeping the current one as is never fails
  if (input.ownerId && input.ownerId !== current.ownerId) await assertActiveMember(input.ownerId, current.organizationId)

  try {
    const project = await prisma.$transaction(async tx => {
      if (slaPolicies) {
        await tx.slaPolicy.deleteMany({ where: { projectId: id } })
        if (slaPolicies.length) await tx.slaPolicy.createMany({ data: slaPolicies.map(p => ({ ...p, projectId: id })) })
      }
      return tx.project.update({
        where: { id },
        data: {
          ...input,
          ...(archived !== undefined && { archivedAt: archived ? (current.archivedAt ?? new Date()) : null })
        },
        include: projectInclude
      })
    })
    return NextResponse.json(toProjectDTO(project))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, `A project called "${input.name}" already exists`)
    }
    throw error
  }
})
