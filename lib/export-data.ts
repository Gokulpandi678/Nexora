import { parseWith, requireOrg } from '@/lib/api'
import { prisma } from '@/lib/db'
import { describeFilters, EXPORT_LIMITS, type ExportFormat, type ExportMeta } from '@/lib/export'
import { listIncidents } from '@/lib/search'
import type { IncidentListItem } from '@/lib/types'
import { listIncidentsSchema, searchParamsToObject } from '@/lib/validators'

export interface ExportData {
  items: IncidentListItem[]
  meta: ExportMeta
  email: string
}

/**
 * The incidents an export covers: the list filters in `params`, the caller's organization only, up to
 * the format's row limit.
 */
export async function loadExport(req: Request, params: URLSearchParams, formatLimit: ExportFormat): Promise<ExportData> {
  const { actor, scope } = await requireOrg(req)
  const query = parseWith(listIncidentsSchema, searchParamsToObject(params))
  const [{ items, total }, org] = await Promise.all([
    listIncidents({ ...query, page: 1, pageSize: EXPORT_LIMITS[formatLimit] }, scope),
    scope.organizationId
      ? prisma.organization.findUnique({ where: { id: scope.organizationId }, select: { name: true } })
      : Promise.resolve(null)
  ])
  return {
    items,
    email: actor.email,
    meta: {
      organizationName: org?.name ?? 'All organizations',
      generatedBy: actor.name,
      generatedAt: new Date(),
      filters: describeFilters(query),
      total
    }
  }
}
