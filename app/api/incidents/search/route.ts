import { NextResponse } from 'next/server'
import { parseWith, requireOrg, route } from '@/lib/api'
import { listIncidents } from '@/lib/search'
import { listIncidentsSchema, searchParamsToObject } from '@/lib/validators'

/**
 * GET /api/incidents/search?q=… — full-text search over title, symptoms and description
 * (prefix matching, so partial words work), ranked by relevance. Accepts every list filter.
 */
export const GET = route('incidents.search', async req => {
  const { scope } = await requireOrg(req)
  const query = parseWith(listIncidentsSchema, searchParamsToObject(new URL(req.url).searchParams))
  return NextResponse.json(await listIncidents({ ...query, sort: query.sort ?? (query.q ? 'relevance' : 'newest') }, scope))
})
