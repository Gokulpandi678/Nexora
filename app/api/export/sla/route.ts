import { requireOrg, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { slaPdf } from '@/lib/sla-pdf'
import { getSlaReport } from '@/lib/sla-report'

export const runtime = 'nodejs'

/** GET /api/export/sla?month=YYYY-MM — the month's SLA & availability report as a PDF (your organization only). */
export const GET = route('export.sla', async req => {
  const { actor, scope } = await requireOrg(req)
  const report = await getSlaReport(scope, new URL(req.url).searchParams.get('month'))
  const org = scope.organizationId
    ? await prisma.organization.findUnique({ where: { id: scope.organizationId }, select: { name: true } })
    : null
  const pdf = await slaPdf(report, { organizationName: org?.name ?? 'All organizations', generatedBy: actor.name })
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="sla-report-${report.month}.pdf"`
    }
  })
})
