import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { ZodError, type ZodType, type ZodTypeDef } from 'zod'
import { hasRole, resolveActor, type Actor } from '@/lib/auth'
import type { Role } from '@/lib/constants'
import { logError } from '@/lib/logger'

/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, string[]>
  ) {
    super(message)
  }
}

export const badRequest = (message: string): HttpError => new HttpError(400, message)
export const notFound = (what = 'Incident'): HttpError => new HttpError(404, `${what} not found`)

export async function parseJson<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw badRequest('Request body must be valid JSON')
  }
  return parseWith(schema, body)
}

export function parseWith<T>(schema: ZodType<T, ZodTypeDef, unknown>, value: unknown): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw validationError(result.error)
}

function validationError(error: ZodError): HttpError {
  const flat = error.flatten()
  const fieldErrors = Object.fromEntries(
    Object.entries(flat.fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
  )
  const first = error.issues[0]
  const message = first
    ? first.path.length && first.message === 'Required'
      ? `${first.path.join('.')} is required`
      : first.message
    : 'Invalid request'
  return new HttpError(400, message, fieldErrors)
}

export async function requireActor(req: Request, minimum: Role = 'REPORTER'): Promise<Actor> {
  const result = await resolveActor(req)
  if (!result.actor) {
    throw result.reason === 'not-member'
      ? new HttpError(403, 'Your organization membership has not been approved yet')
      : new HttpError(401, 'Sign in first')
  }
  if (!hasRole(result.actor, minimum)) throw new HttpError(403, `This action needs the ${minimum.toLowerCase()} role`)
  return result.actor
}

/* ---------- Organization scoping ---------- */

/** The organization a request works in. null only under tests, where header identities carry no organization. */
export interface OrgScope {
  organizationId: string | null
}

/** Every incident read or write goes through this, so one organization never sees another's data. */
export async function requireOrg(req: Request, minimum: Role = 'VIEWER'): Promise<{ actor: Actor; scope: OrgScope }> {
  const actor = await requireActor(req, minimum)
  if (!actor.organizationId && process.env.NODE_ENV !== 'test') {
    throw new HttpError(403, 'Choose an organization to work in first')
  }
  return { actor, scope: { organizationId: actor.organizationId ?? null } }
}

/** Prisma `where` fragment for incidents in scope. */
export const inOrg = (scope: OrgScope): { organizationId?: string } =>
  scope.organizationId ? { organizationId: scope.organizationId } : {}

/** Raw-SQL fragment: ` AND <alias>."organizationId" = $1`, or nothing when unscoped (tests). */
export function orgSql(scope: OrgScope, alias?: string): Prisma.Sql {
  if (!scope.organizationId) return Prisma.empty
  const column = alias ? Prisma.raw(`${alias}."organizationId"`) : Prisma.raw('"organizationId"')
  return Prisma.sql` AND ${column} = ${scope.organizationId}`
}

type RouteContext<P> = { params: Promise<P> }
type Handler<P> = (req: Request, ctx: RouteContext<P>) => Promise<Response>

/**
 * Wraps a route handler with an auth check and consistent error handling: HttpError → its status,
 * Prisma "record not found" → 404, anything else → logged 500 with a generic message
 * (internal details never reach the client).
 */
export function route<P = Record<string, never>>(
  name: string,
  handler: Handler<P>,
  { members = true }: { /** Require an approved organization member (or superadmin). */ members?: boolean } = {}
): Handler<P> {
  return async (req, ctx) => {
    const started = performance.now()
    try {
      // Header identity in tests is opt-in per request, so the blanket check only runs for real sessions
      if (members && process.env.NODE_ENV !== 'test') await requireActor(req, 'VIEWER')
      const res = await handler(req, ctx)
      res.headers.set('Server-Timing', `app;dur=${(performance.now() - started).toFixed(1)}`)
      return res
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json(
          { error: error.message, ...(error.details && { fieldErrors: error.details }) },
          { status: error.status }
        )
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      logError(error, { route: name, method: req.method, url: req.url })
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
    }
  }
}
