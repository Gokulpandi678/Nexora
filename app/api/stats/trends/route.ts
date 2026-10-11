import { NextResponse } from 'next/server'
import { parseWith, requireOrg, route } from '@/lib/api'
import { getTrends } from '@/lib/stats'
import { trendsQuerySchema } from '@/lib/validators'

export const dynamic = 'force-dynamic'

/** GET /api/stats/trends?days=30 — daily incidents by severity, resolutions and MTTR (UTC days). */
export const GET = route('stats.trends', async req => {
  const { scope } = await requireOrg(req)
  const { days } = parseWith(trendsQuerySchema, Object.fromEntries(new URL(req.url).searchParams))
  return NextResponse.json(await getTrends(days, scope))
})
