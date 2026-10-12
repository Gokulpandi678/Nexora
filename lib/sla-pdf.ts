import PDFDocument from 'pdfkit'
import { format } from 'date-fns'
import { CRITICALITY_LABEL } from '@/lib/constants'
import { COLORS } from '@/lib/export'
import type { SlaReport } from '@/lib/types'
import { formatMinutes } from '@/lib/utils'

interface Meta {
  organizationName: string
  generatedBy: string
}

const pct = (v: number | null): string => (v === null ? '—' : `${v}%`)
const money = (v: number): string => (v ? v.toLocaleString('en-US') : '—')

interface Column {
  label: string
  width: number
}

/** The monthly SLA report: totals, one row per project, and incidents at risk now. */
export function slaPdf(report: SlaReport, meta: Meta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const monthLabel = format(new Date(`${report.month}-01T00:00:00Z`), 'MMMM yyyy')
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
      info: { Title: `SLA report ${monthLabel} — ${meta.organizationName}`, Author: meta.generatedBy, Creator: 'Nexora' }
    })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const width = doc.page.width - left - doc.page.margins.right
    const bottom = (): number => doc.page.height - doc.page.margins.bottom - 18

    doc.rect(left, 36, width, 3).fill(COLORS.brand)
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(18).text(`SLA & availability — ${monthLabel}`, left, 50)
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted)
      .text(`${meta.organizationName} · generated ${format(new Date(report.generatedAt), "d MMM yyyy 'at' HH:mm")} by ${meta.generatedBy} · times in UTC`)

    const t = report.totals
    const tiles = [
      { label: 'SLA compliance', value: pct(t.compliance) },
      { label: 'SLA breaches', value: String(t.slaBreached) },
      { label: 'Projects on target', value: `${t.projectsMeetingTarget} of ${t.projects}` },
      { label: 'Outage time', value: formatMinutes(t.outageMinutes) },
      { label: 'Downtime cost', value: money(t.downtimeCost) }
    ]
    const tileWidth = (width - 10 * (tiles.length - 1)) / tiles.length
    const tileTop = doc.y + 10
    tiles.forEach((tile, n) => {
      const x = left + n * (tileWidth + 10)
      doc.roundedRect(x, tileTop, tileWidth, 44, 4).fill(COLORS.band)
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(tile.label.toUpperCase(), x + 8, tileTop + 8, { width: tileWidth - 16 })
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(15).text(tile.value, x + 8, tileTop + 21, { width: tileWidth - 16 })
    })
    let y = tileTop + 62

    const table = (title: string, columns: Column[], rows: { cells: string[]; alert: boolean }[], empty: string): void => {
      if (y + 60 > bottom()) {
        doc.addPage()
        y = doc.page.margins.top
      }
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12).text(title, left, y)
      y += 20
      const header = (): void => {
        doc.rect(left, y, width, 18).fill(COLORS.ink)
        let x = left
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
        for (const c of columns) {
          doc.text(c.label, x + 4, y + 5, { width: c.width - 8, lineBreak: false })
          x += c.width
        }
        y += 18
      }
      if (rows.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted).text(empty, left, y)
        y += 24
        return
      }
      header()
      rows.forEach((row, n) => {
        doc.font('Helvetica').fontSize(8)
        const height = Math.max(...row.cells.map((text, k) => doc.heightOfString(text, { width: (columns[k]?.width ?? 0) - 8 }))) + 10
        if (y + height > bottom()) {
          doc.addPage()
          y = doc.page.margins.top
          header()
        }
        if (n % 2 === 1) doc.rect(left, y, width, height).fill(COLORS.band)
        let x = left
        row.cells.forEach((text, k) => {
          const col = columns[k]!
          doc.fillColor(row.alert && k === 0 ? COLORS.p1 : COLORS.ink).font(k === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
            .text(text, x + 4, y + 5, { width: col.width - 8 })
          x += col.width
        })
        doc.moveTo(left, y + height).lineTo(left + width, y + height).lineWidth(0.5).strokeColor(COLORS.line).stroke()
        y += height
      })
      y += 18
    }

    // A4 landscape leaves 770pt of table
    table('Projects', [
      { label: 'Project', width: 150 }, { label: 'Criticality', width: 62 }, { label: 'Availability', width: 70 },
      { label: 'Target', width: 52 }, { label: 'Outage', width: 62 }, { label: 'Degraded', width: 62 },
      { label: 'Budget left', width: 66 }, { label: 'Incidents', width: 52 }, { label: 'SLA met', width: 50 },
      { label: 'Breached', width: 52 }, { label: 'Compliance', width: 58 }, { label: 'Cost', width: 34 }
    ], report.projects.map(p => ({
      alert: !p.targetMet || p.slaBreached > 0,
      cells: [
        p.name + (p.archived ? ' (archived)' : ''), CRITICALITY_LABEL[p.criticality], `${p.availability}%`, `${p.availabilityTarget}%`,
        formatMinutes(p.outageMinutes), formatMinutes(p.degradedMinutes),
        p.errorBudgetLeftMinutes < 0 ? `over by ${formatMinutes(-p.errorBudgetLeftMinutes)}` : formatMinutes(p.errorBudgetLeftMinutes),
        String(p.incidents), String(p.slaMet), String(p.slaBreached), pct(p.compliance), money(p.downtimeCost)
      ]
    })), 'No projects yet. Admins add them under Projects & SLAs.')

    table('Open incidents at risk now', [
      { label: 'Incident', width: 330 }, { label: 'Severity', width: 60 }, { label: 'Projects', width: 170 },
      { label: 'Clock', width: 70 }, { label: 'Due', width: 140 }
    ], report.atRisk.map(r => ({
      alert: r.state === 'breached',
      cells: [
        r.title, r.severity, r.projects.join(', '), r.clock === 'response' ? 'Response' : 'Resolve',
        r.remainingMinutes < 0 ? `${formatMinutes(-r.remainingMinutes)} overdue` : `in ${formatMinutes(r.remainingMinutes)}`
      ]
    })), 'Nothing at risk right now.')

    // Page footers
    const range = doc.bufferedPageRange()
    for (let p = range.start; p < range.start + range.count; p++) {
      doc.switchToPage(p)
      // Writing inside the bottom margin would otherwise make pdfkit start a new page
      const margin = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(
        `${meta.organizationName} · Nexora SLA report · page ${p - range.start + 1} of ${range.count}`,
        left, doc.page.height - margin + 8, { width, align: 'right', lineBreak: false }
      )
      doc.page.margins.bottom = margin
    }
    doc.end()
  })
}
