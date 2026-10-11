import { NextResponse } from 'next/server'
import { inOrg, notFound, requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { toSolution } from '@/lib/serializers'

type Params = { id: string }

/** GET /api/solutions/:id */
export const GET = route<Params>('solutions.get', async (req, { params }) => {
  const { id } = await params
  const { scope } = await requireOrg(req)
  const solution = await prisma.solution.findFirst({ where: { id, incident: { deletedAt: null, ...inOrg(scope) } } })
  if (!solution) throw notFound('Solution')
  return NextResponse.json(toSolution(solution))
})
