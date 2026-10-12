import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { HttpError, parseJson, requireOrg, route } from '@/lib/api'
import { hasRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertActiveMember, listProjects, projectInclude, toProjectDTO } from '@/lib/projects'
import { projectSchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

/** GET /api/projects — the organization's active projects (`?archived=1` adds archived ones, admins only). */
export const GET = route('projects.list', async req => {
  const { actor, scope } = await requireOrg(req)
  const includeArchived = new URL(req.url).searchParams.get('archived') === '1' && hasRole(actor, 'ADMIN')
  return NextResponse.json(await listProjects(scope, { includeArchived }))
})

/** POST /api/projects — create a project with its SLA policies (admins). */
export const POST = route('projects.create', async req => {
  const { scope } = await requireOrg(req, 'ADMIN')
  if (!scope.organizationId) throw new HttpError(403, 'Choose an organization to work in first')
  const { slaPolicies, ...input } = await parseJson(req, projectSchema)
  if (input.ownerId) await assertActiveMember(input.ownerId, scope.organizationId)
  try {
    const project = await prisma.project.create({
      data: { ...input, organizationId: scope.organizationId, slaPolicies: { create: slaPolicies } },
      include: projectInclude
    })
    return NextResponse.json(toProjectDTO(project), { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, `A project called "${input.name}" already exists`)
    }
    throw error
  }
})
