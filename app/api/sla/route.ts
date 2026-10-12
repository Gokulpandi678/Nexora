import { NextResponse } from 'next/server'
import { requireOrg, route } from '@/lib/api'
import { getSlaReport } from '@/lib/sla-report'

export const dynamic = 'force-dynamic'

/** GET /api/sla?month=YYYY-MM — availability, downtime and SLA compliance per project, plus incidents at risk now. */
export const GET = route('sla.report', async req => {
  const { scope } = await requireOrg(req)
  return NextResponse.json(await getSlaReport(scope, new URL(req.url).searchParams.get('month')))
})
