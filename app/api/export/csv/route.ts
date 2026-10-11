import { route } from '@/lib/api'
import { EXPORT_LIMITS, exportFilename, incidentsCsv } from '@/lib/export'
import { loadExport } from '@/lib/export-data'

/** GET /api/export/csv — the current list filters as CSV (up to 5,000 rows, your organization only). */
export const GET = route('export.csv', async req => {
  const { items } = await loadExport(req, new URL(req.url).searchParams, 'csv')
  return new Response(incidentsCsv(items), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename('csv')}"`,
      'X-Export-Limit': String(EXPORT_LIMITS.csv)
    }
  })
})
