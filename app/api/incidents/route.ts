import { NextResponse } from 'next/server'
import { parseWith, requireOrg, route } from '@/lib/api'
import { listIncidents } from '@/lib/search'
import { listIncidentsSchema, searchParamsToObject } from '@/lib/validators'

export { POST } from './create/route'

/**
 * GET /api/incidents — paginated list.
 * Filters: status, severity, systems (repeatable or comma-separated), department, from, to, recurring.
 * Sort: newest (default), oldest, mttr, severity, recurring, relevance (with q).
 */
export const GET = route('incidents.list', async req => {
  const { scope } = await requireOrg(req)
  const query = parseWith(listIncidentsSchema, searchParamsToObject(new URL(req.url).searchParams))
  return NextResponse.json(await listIncidents(query, scope))
})
