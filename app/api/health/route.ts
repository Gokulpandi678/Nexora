import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /api/health — liveness + database reachability, for load balancers and uptime checks. */
export async function GET(): Promise<NextResponse> {
  const started = performance.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', db: 'ok', latencyMs: Math.round(performance.now() - started) })
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'unreachable' }, { status: 503 })
  }
}
