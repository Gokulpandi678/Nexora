import { route } from '@/lib/api'
import { exportFilename, incidentsPdf } from '@/lib/export'
import { loadExport } from '@/lib/export-data'

export const runtime = 'nodejs'

/** GET /api/export/pdf — the current list filters as a printable report (up to 1,000 rows, your organization only). */
export const GET = route('export.pdf', async req => {
  const { items, meta } = await loadExport(req, new URL(req.url).searchParams, 'pdf')
  const pdf = await incidentsPdf(items, meta)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${exportFilename('pdf')}"`
    }
  })
})
