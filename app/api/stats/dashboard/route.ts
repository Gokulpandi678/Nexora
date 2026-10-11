import { NextResponse } from 'next/server'
import { requireOrg, route } from '@/lib/api'
import { getDashboardStats } from '@/lib/stats'

export const dynamic = 'force-dynamic'

/** GET /api/stats/dashboard — KPIs, breakdowns, top 10 recurring and recent incidents. */
export const GET = route('stats.dashboard', async req => {
  const { scope } = await requireOrg(req)
  return NextResponse.json(await getDashboardStats(scope))
})
