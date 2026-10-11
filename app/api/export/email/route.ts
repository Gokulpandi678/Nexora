import { NextResponse } from 'next/server'
import { z } from 'zod'
import { HttpError, parseJson, route } from '@/lib/api'
import { appUrl, renderEmail, sendEmail } from '@/lib/email'
import { exportFilename, incidentsCsv, incidentsPdf } from '@/lib/export'
import { loadExport } from '@/lib/export-data'

export const runtime = 'nodejs'

const emailExportSchema = z.object({
  formats: z.array(z.enum(['csv', 'pdf'])).min(1, 'Pick at least one format').max(2).transform(f => [...new Set(f)]),
  /** The list's query string, e.g. "status=OPEN&severity=P1" */
  params: z.string().max(2000).default('')
})

/**
 * POST /api/export/email — email the current list (your organization only) to yourself as CSV
 * and/or PDF attachments. Sends to the signed-in user's own address only.
 */
export const POST = route('export.email', async req => {
  const { formats, params } = await parseJson(req, emailExportSchema)
  const search = new URLSearchParams(params)
  const wantsPdf = formats.includes('pdf')

  // CSV may hold more rows than the PDF, so each format loads its own slice
  const [csvData, pdfData] = await Promise.all([
    formats.includes('csv') ? loadExport(req, search, 'csv') : Promise.resolve(null),
    wantsPdf ? loadExport(req, search, 'pdf') : Promise.resolve(null)
  ])
  const base = (csvData ?? pdfData)!
  const { meta, email } = base

  const attachments = [
    ...(csvData ? [{ filename: exportFilename('csv'), content: Buffer.from(incidentsCsv(csvData.items), 'utf-8') }] : []),
    ...(pdfData ? [{ filename: exportFilename('pdf'), content: await incidentsPdf(pdfData.items, pdfData.meta) }] : [])
  ]

  const result = await sendEmail({
    to: email,
    subject: `Nexora export — ${meta.organizationName} (${meta.total} incident${meta.total === 1 ? '' : 's'})`,
    attachments,
    context: { type: 'EXPORT', formats },
    html: renderEmail({
      heading: 'Your incident export',
      intro: `Attached: ${formats.map(f => f.toUpperCase()).join(' and ')} of ${meta.total} incident${meta.total === 1 ? '' : 's'} from ${meta.organizationName}.`,
      blocks: [
        { label: 'Filters', value: meta.filters },
        { label: 'Generated', value: meta.generatedAt.toUTCString() }
      ],
      cta: { label: 'Open incidents', url: `${appUrl()}/incidents${params ? `?${params}` : ''}` },
      footer: 'You receive this because you asked for an export.'
    })
  })

  if (!result.ok) {
    throw new HttpError(502, result.reason === 'disabled'
      ? 'Email is not configured on this server. Download the files instead.'
      : `The email could not be sent: ${result.message}`)
  }
  return NextResponse.json({ sentTo: email, formats, total: meta.total })
})
