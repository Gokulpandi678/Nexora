import { NextResponse } from 'next/server'
import { notFound, requireOrg, route } from '@/lib/api'
import { getSolutionEffectiveness } from '@/lib/stats'

type Params = { id: string }

/** GET /api/solutions/:id/effectiveness — times tried on recurrences, success rate, MTTR improvement. */
export const GET = route<Params>('solutions.effectiveness', async (req, { params }) => {
  const { id } = await params
  const { scope } = await requireOrg(req)
  const result = await getSolutionEffectiveness(id, scope)
  if (!result) throw notFound('Solution')
  return NextResponse.json(result)
})
