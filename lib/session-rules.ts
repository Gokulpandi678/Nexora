import type { MembershipStatus, Position, Role } from '@/lib/constants'

export interface SessionMembership {
  id: string
  role: Role
  position: Position | null
  status: MembershipStatus
  /** The organization was suspended by a superadmin: kept, but nobody can use it */
  suspended: boolean
  organization: { id: string; name: string; slug: string }
}

/** An admin's invitation for this user to join an organization (accepted with one click). */
export interface SessionInvite {
  id: string
  role: Role
  position: Position | null
  invitedBy: string
  organization: { id: string; name: string }
}

/** An organization the member can work in right now: approved, and not suspended. */
export const isUsable = (m: SessionMembership): boolean => m.status === 'ACTIVE' && !m.suspended
