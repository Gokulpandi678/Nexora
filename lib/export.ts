import PDFDocument from 'pdfkit'
import { format } from 'date-fns'
import { toCsv } from '@/lib/csv'
import { SEVERITY_LABEL, STATUS_LABEL } from '@/lib/constants'
import type { IncidentListItem } from '@/lib/types'
import { formatMinutes } from '@/lib/utils'
import type { ListIncidentsQuery } from '@/lib/validators'

/** Most rows a single export contains. A PDF table past ~1,000 rows is not useful to read. */
export const EXPORT_LIMITS = { csv: 5000, pdf: 1000 } as const

export type ExportFormat = 'csv' | 'pdf'

export interface ExportMeta {
  organizationName: string
  generatedBy: string
  generatedAt: Date
  /** Human-readable filters, e.g. "Status: Open · Severity: P1" */
  filters: string
  /** Matching incidents in total (the export may hold fewer, see EXPORT_LIMITS) */
  total: number
}

export const exportFilename = (ext: ExportFormat, at = new Date()): string => `incidents-${format(at, 'yyyy-MM-dd')}.${ext}`

export function describeFilters(query: ListIncidentsQuery): string {
  const parts: string[] = []
  if (query.q) parts.push(`Search: "${query.q}"`)
  if (query.status.length) parts.push(`Status: ${query.status.map(s => STATUS_LABEL[s]).join(', ')}`)
  if (query.severity.length) parts.push(`Severity: ${query.severity.join(', ')}`)
  if (query.systems.length) parts.push(`Systems: ${query.systems.join(', ')}`)
  if (query.department) parts.push(`Department: ${query.department}`)
  if (query.from) parts.push(`From: ${format(query.from, 'd MMM yyyy')}`)
  if (query.to) parts.push(`To: ${format(query.to, 'd MMM yyyy')}`)
  if (query.recurring !== undefined) parts.push(query.recurring ? 'Recurring only' : 'One-off only')
  return parts.length ? parts.join(' · ') : 'All incidents'
}

/* ---------- CSV ---------- */

export function incidentsCsv(items: IncidentListItem[]): string {
  const header = [
    'id', 'title', 'severity', 'status', 'department', 'affectedSystems', 'createdBy', 'createdAt',
    'resolvedAt', 'mttrMinutes', 'recurringCount', 'solutions', 'verifiedSolutions'
  ]
  const rows = items.map(i => [
    i.id, i.title, i.severity, i.status, i.department, i.affectedSystems, i.createdBy, i.createdAt,
    i.resolvedAt, i.actualMTTR, i.recurringCount, i.solutionCount, i.verifiedSolutionCount
  ])
  // BOM so Excel opens it as UTF-8
  return `﻿${toCsv([header, ...rows])}`
}

/* ---------- PDF ---------- */

export const COLORS = { ink: '#111827', muted: '#6B7280', line: '#E5E7EB', band: '#F3F4F6', brand: '#0061FF', p1: '#B91C1C' }

interface Column {
  label: string
  width: number
  value: (i: IncidentListItem) => string
}

// A4 landscape: 842pt wide, 36pt margins → 770pt of table
const COLUMNS: Column[] = [
  { label: 'Title', width: 250, value: i => i.title },
  { label: 'Severity', width: 70, value: i => SEVERITY_LABEL[i.severity] ?? i.severity },
  { label: 'Status', width: 72, value: i => STATUS_LABEL[i.status] ?? i.status },
  { label: 'Department', width: 72, value: i => i.department },
  { label: 'Systems', width: 96, value: i => i.affectedSystems.join(', ') },
  { label: 'Reported', width: 86, value: i => `${format(new Date(i.createdAt), 'd MMM yyyy')}\n${i.createdBy}` },
  { label: 'Time to fix', width: 62, value: i => formatMinutes(i.actualMTTR) },
  { label: 'Repeats', width: 30, value: i => (i.recurringCount > 1 ? `${i.recurringCount}×` : '—') },
  { label: 'Fixes', width: 32, value: i => `${i.verifiedSolutionCount}/${i.solutionCount}` }
]

/** Plain-text summary numbers for the exported rows. */
export function summarize(items: IncidentListItem[]): { label: string; value: string }[] {
  const open = items.filter(i => i.status === 'OPEN' || i.status === 'INVESTIGATING').length
  const resolved = items.length - open
  const p1 = items.filter(i => i.severity === 'P1').length
  const recurring = items.filter(i => i.recurringCount > 1 || i.linkedToId).length
  const mttrs = items.map(i => i.actualMTTR).filter((m): m is number => m !== null)
  const avg = mttrs.length ? Math.round(mttrs.reduce((a, b) => a + b, 0) / mttrs.length) : null
  return [
    { label: 'Incidents', value: String(items.length) },
    { label: 'Open', value: String(open) },
    { label: 'Resolved / closed', value: String(resolved) },
    { label: 'P1 critical', value: String(p1) },
    { label: 'Recurring', value: String(recurring) },
    { label: 'Avg time to fix', value: formatMinutes(avg) }
  ]
}

/**
 * A printable incident report: header with organization and filters, summary tiles, then a table
 * that repeats its header on every page. Uses PDF base fonts, so characters outside Latin-1 are
 * replaced; the CSV keeps them.
 */
export function incidentsPdf(items: IncidentListItem[], meta: ExportMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
      info: { Title: `Incident report — ${meta.organizationName}`, Author: meta.generatedBy, Creator: 'Nexora' }
    })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const width = doc.page.width - left - doc.page.margins.right
    const bottom = () => doc.page.height - doc.page.margins.bottom - 18

    // Header
    doc.rect(left, 36, width, 3).fill(COLORS.brand)
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(18).text('Incident report', left, 50)
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted)
      .text(`${meta.organizationName} · generated ${format(meta.generatedAt, "d MMM yyyy 'at' HH:mm")} by ${meta.generatedBy}`)
      .text(meta.filters)
    if (meta.total > items.length) {
      doc.fillColor(COLORS.p1).text(`Showing the first ${items.length} of ${meta.total} matching incidents. Download the CSV for all of them.`)
    }

    // Summary tiles
    const tiles = summarize(items)
    const tileWidth = (width - 10 * (tiles.length - 1)) / tiles.length
    const tileTop = doc.y + 10
    tiles.forEach((t, n) => {
      const x = left + n * (tileWidth + 10)
      doc.roundedRect(x, tileTop, tileWidth, 44, 4).fill(COLORS.band)
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(t.label.toUpperCase(), x + 8, tileTop + 8, { width: tileWidth - 16 })
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(15).text(t.value, x + 8, tileTop + 21, { width: tileWidth - 16 })
    })
    let y = tileTop + 60

    const drawHeader = (): void => {
      doc.rect(left, y, width, 18).fill(COLORS.ink)
      let x = left
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
      for (const col of COLUMNS) {
        doc.text(col.label, x + 4, y + 5, { width: col.width - 8, lineBreak: false })
        x += col.width
      }
      y += 18
    }

    if (items.length === 0) {
      doc.font('Helvetica').fontSize(11).fillColor(COLORS.muted).text('No incidents match these filters.', left, y)
    } else {
      drawHeader()
      doc.font('Helvetica').fontSize(8)
      items.forEach((item, n) => {
        const cells = COLUMNS.map(c => c.value(item))
        const height = Math.max(...cells.map((text, k) => doc.heightOfString(text, { width: (COLUMNS[k]?.width ?? 0) - 8 }))) + 10
        if (y + height > bottom()) {
          doc.addPage()
          y = doc.page.margins.top
          drawHeader()
          doc.font('Helvetica').fontSize(8)
        }
        if (n % 2 === 1) doc.rect(left, y, width, height).fill(COLORS.band)
        let x = left
        cells.forEach((text, k) => {
          const col = COLUMNS[k]!
          const critical = col.label === 'Severity' && item.severity === 'P1'
          doc.fillColor(critical ? COLORS.p1 : COLORS.ink).font(critical || k === 0 ? 'Helvetica-Bold' : 'Helvetica')
            .text(text, x + 4, y + 5, { width: col.width - 8 })
          x += col.width
        })
        doc.moveTo(left, y + height).lineTo(left + width, y + height).lineWidth(0.5).strokeColor(COLORS.line).stroke()
        y += height
      })
    }

    // Page footers
    const range = doc.bufferedPageRange()
    for (let p = range.start; p < range.start + range.count; p++) {
      doc.switchToPage(p)
      // Writing inside the bottom margin would otherwise make pdfkit start a new page
      const margin = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(
        `${meta.organizationName} · Nexora · page ${p - range.start + 1} of ${range.count}`,
        left, doc.page.height - margin + 8, { width, align: 'right', lineBreak: false }
      )
      doc.page.margins.bottom = margin
    }
    doc.end()
  })
}
