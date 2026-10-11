import { NextResponse } from 'next/server'
import { requireOrg, route } from '@/lib/api'
import { getSystemStats } from '@/lib/stats'

export const dynamic = 'force-dynamic'

/** GET /api/stats/systems — incidents, open, recurring and average MTTR per affected system. */
export const GET = route('stats.systems', async req => {
  const { scope } = await requireOrg(req)
  return NextResponse.json(await getSystemStats(scope))
})
