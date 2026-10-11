import { describe, expect, it } from 'vitest'
import { POSITION_DEFAULT_ROLE, POSITION_LABEL, POSITIONS } from '@/lib/constants'
import { memberInviteSchema, organizationActionSchema } from '@/lib/validators'
import { isUsable, type SessionMembership } from '@/lib/session-rules'

describe('organizationActionSchema', () => {
  it('accepts suspend with a reason and reactivate with nothing', () => {
    expect(organizationActionSchema.parse({ action: 'suspend', reason: '  Contract ended  ' })).toEqual({ action: 'suspend', reason: 'Contract ended' })
    expect(organizationActionSchema.parse({ action: 'reactivate' })).toEqual({ action: 'reactivate' })
  })

  it('requires a meaningful reason to suspend', () => {
    expect(organizationActionSchema.safeParse({ action: 'suspend', reason: 'no' }).success).toBe(false)
    expect(organizationActionSchema.safeParse({ action: 'suspend' }).success).toBe(false)
  })

  it('validates details on update and normalises the website', () => {
    const parsed = organizationActionSchema.parse({ action: 'update', details: { name: 'Acme Cloud', website: 'acme.io' } })
    expect(parsed).toMatchObject({ action: 'update', details: { name: 'Acme Cloud', website: 'https://acme.io', size: null } })
    expect(organizationActionSchema.safeParse({ action: 'update', details: { name: 'A' } }).success).toBe(false)
  })

  it('has no delete action: organizations are never deleted', () => {
    expect(organizationActionSchema.safeParse({ action: 'delete' }).success).toBe(false)
  })
})

describe('isUsable', () => {
  const m = (overrides: Partial<SessionMembership>): SessionMembership => ({
    id: 'm1', role: 'REPORTER', position: null, status: 'ACTIVE', suspended: false, organization: { id: 'o1', name: 'Acme', slug: 'acme' }, ...overrides
  })

  it('only active memberships of organizations that are not suspended can be used', () => {
    expect(isUsable(m({}))).toBe(true)
    expect(isUsable(m({ suspended: true }))).toBe(false)
    expect(isUsable(m({ status: 'PENDING' }))).toBe(false)
  })
})

describe('positions and member invitations', () => {
  it('every position has a label and a suggested access level', () => {
    for (const p of POSITIONS) {
      expect(POSITION_LABEL[p]).toBeTruthy()
      expect(['VIEWER', 'REPORTER', 'VERIFIER', 'ADMIN']).toContain(POSITION_DEFAULT_ROLE[p])
    }
  })

  it('normalises the email and defaults access to reporter with no position', () => {
    expect(memberInviteSchema.parse({ email: '  Dev@Example.COM ' })).toEqual({ email: 'dev@example.com', role: 'REPORTER', position: null })
    expect(memberInviteSchema.safeParse({ email: 'dev@example.com', position: 'EMPEROR' }).success).toBe(false)
  })
})
