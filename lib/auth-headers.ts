/**
 * Header identity, trusted only under NODE_ENV=test so integration tests can call route handlers
 * directly. Real requests are identified by the WorkOS session (lib/auth.ts). Values are URI-encoded.
 */
export const ACTOR_HEADERS = {
  name: 'x-user-name',
  email: 'x-user-email',
  department: 'x-user-department',
  role: 'x-user-role',
  /** Tests only: the organization a header identity works in (ignored outside NODE_ENV=test) */
  organization: 'x-test-organization'
} as const
