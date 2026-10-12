import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { runSlaCheck } from '@/lib/sla-check'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const matches = (given: string, expected: string): boolean => {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * GET /api/cron/sla — sends SLA warnings and breach escalations. Called by a scheduler (Vercel Cron, Catalyst
 * cron, or any uptime pinger) with `Authorization: Bearer <CRON_SECRET>`; refuses everything when the secret is unset.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || !matches(given, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await runSlaCheck()
  logger.info('sla check', { ...result })
  return NextResponse.json(result)
}
