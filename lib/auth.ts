import { actorSchema } from '@/lib/validators'
import type { Department, Role } from '@/lib/constants'
import { ACTOR_HEADERS } from '@/lib/auth-headers'

export { ACTOR_HEADERS }

export interface Actor {
  name: string
  email: string
  department: Department
  role: Role
  /** Set for session-based actors */
  userId?: string
  organizationId?: string
}

const decode = (value: string | null): string | undefined => {
  if (!value) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

/**
 * Identity from request headers. Only trusted by the test suite (NODE_ENV=test), where route
 * handlers are called directly without a WorkOS session.
 */
export function actorFromHeaders(req: Request): Actor | null {
  const parsed = actorSchema.safeParse({
    name: decode(req.headers.get(ACTOR_HEADERS.name)),
    email: decode(req.headers.get(ACTOR_HEADERS.email)),
    department: decode(req.headers.get(ACTOR_HEADERS.department)),
    role: decode(req.headers.get(ACTOR_HEADERS.role))
  })
  return parsed.success ? parsed.data : null
}

export type ActorResult = { actor: Actor } | { actor: null; reason: 'signed-out' | 'not-member' }

// One session lookup per request, however many guards ask
const resolved = new WeakMap<Request, Promise<ActorResult>>()

/**
 * Resolves who is making the request from the WorkOS AuthKit session (see lib/session.ts).
 * Superadmins act as ADMIN; everyone else needs an ACTIVE membership in an organization.
 * `organizationId` is the organization the user has selected.
 */
export function resolveActor(req: Request): Promise<ActorResult> {
  let result = resolved.get(req)
  if (!result) {
    result = lookupActor(req)
    resolved.set(req, result)
  }
  return result
}

async function lookupActor(req: Request): Promise<ActorResult> {
  if (process.env.NODE_ENV === 'test') {
    const actor = actorFromHeaders(req)
    if (!actor) return { actor: null, reason: 'signed-out' }
    // Lets integration tests exercise organization scoping without a WorkOS session
    const organizationId = decode(req.headers.get(ACTOR_HEADERS.organization))
    return { actor: organizationId ? { ...actor, organizationId } : actor }
  }

  // Imported lazily so this module stays importable outside the Next.js server runtime
  const { getSession } = await import('@/lib/session')
  const session = await getSession()
  if (!session) return { actor: null, reason: 'signed-out' }

  const { user, membership } = session
  if (!membership && !user.isSuperAdmin) return { actor: null, reason: 'not-member' }

  return {
    actor: {
      name: user.name || user.email,
      email: user.email,
      department: user.department ?? 'Unassigned',
      role: membership?.role ?? 'ADMIN',
      userId: user.id,
      organizationId: membership?.organization.id
    }
  }
}

export async function getActor(req: Request): Promise<Actor | null> {
  return (await resolveActor(req)).actor
}

const ROLE_RANK: Record<Role, number> = { VIEWER: 0, REPORTER: 1, VERIFIER: 2, ADMIN: 3 }

export function hasRole(actor: Actor | null, minimum: Role): boolean {
  return actor !== null && ROLE_RANK[actor.role] >= ROLE_RANK[minimum]
}
