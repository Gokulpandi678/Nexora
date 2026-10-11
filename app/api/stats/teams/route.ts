import { NextResponse } from 'next/server'
import { requireOrg, route } from '@/lib/api'
import { getTeamStats } from '@/lib/stats'

export const dynamic = 'force-dynamic'

/** GET /api/stats/teams — per-department volume and MTTR, top solvers, department × system heatmap. */
export const GET = route('stats.teams', async req => {
  const { scope } = await requireOrg(req)
  return NextResponse.json(await getTeamStats(scope))
})
