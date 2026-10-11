import { beforeEach, describe, expect, it } from 'vitest'
import type { Incident } from '@prisma/client'
import { prisma } from '@/lib/db'
import { POST as addComment } from '@/app/api/incidents/[id]/comments/route'
import { PATCH as patchIncident } from '@/app/api/incidents/[id]/route'
import { POST as createIncident } from '@/app/api/incidents/create/route'
import type { CommentDTO } from '@/lib/types'
import {
  addMembership, createOrg, createUser, ctx, incidentInput, json, member, noParams, req, resetDb, seedIncident, type TestUser
} from '../setup/helpers'

/*
 * Incident emails (mentions, status changes, verifications, recurrences) only ever reach active members
 * of the incident's organization. The one exception is the on-call distribution list for P1s.
 */

let acme: { id: string }
let beta: { id: string }
let alice: TestUser
let ada: TestUser
let bob: TestUser
let incident: Incident

beforeEach(async () => {
  await resetDb()
  acme = await createOrg('Acme Cloud')
  beta = await createOrg('Beta Health')
  alice = await member(acme, { name: 'Alice Acme', email: 'alice@acme.test' })
  ada = await member(acme, { name: 'Ada Acme', email: 'ada@acme.test' })
  bob = await member(beta, { name: 'Bob Beta', email: 'bob@beta.test' })
  incident = await seedIncident({ organizationId: acme.id, createdBy: ada.name, email: ada.email })
})

const notificationsFor = (email: string): Promise<{ notificationType: string }[]> =>
  prisma.notificationLog.findMany({ where: { recipientEmail: email }, select: { notificationType: true } })

describe('@mentions', () => {
  it('keeps and notifies members, and silently drops everyone else', async () => {
    const res = await addComment(
      req('POST', `/api/incidents/${incident.id}/comments`, {
        content: 'Can you take a look?',
        mentions: [ada.email, bob.email, 'outsider@gmail.test']
      }, alice),
      ctx({ id: incident.id })
    )
    expect(res.status).toBe(201)
    const comment = await json<CommentDTO>(res)
    expect(comment.mentions).toEqual([ada.email])

    expect(await notificationsFor(ada.email)).toEqual([{ notificationType: 'MENTION' }])
    expect(await notificationsFor(bob.email)).toEqual([])
    expect(await notificationsFor('outsider@gmail.test')).toEqual([])
  })

  it('does not notify members who are only pending or were declined', async () => {
    const pending = await createUser({ name: 'Pat Pending', email: 'pat@acme.test' })
    await addMembership(acme.id, pending.id, { status: 'PENDING' })
    const res = await addComment(
      req('POST', `/api/incidents/${incident.id}/comments`, { content: 'ping', mentions: [pending.email] }, alice),
      ctx({ id: incident.id })
    )
    expect((await json<CommentDTO>(res)).mentions).toEqual([])
    expect(await notificationsFor(pending.email)).toEqual([])
  })
})

describe('incident emails', () => {
  it('notify the reporter while they are a member', async () => {
    const res = await patchIncident(req('PATCH', `/api/incidents/${incident.id}`, { status: 'INVESTIGATING' }, alice), ctx({ id: incident.id }))
    expect(res.status).toBe(200)
    expect(await notificationsFor(ada.email)).toEqual([{ notificationType: 'STATUS_CHANGED' }])
  })

  it('stop once the reporter has left the organization', async () => {
    await prisma.membership.deleteMany({ where: { organizationId: acme.id, user: { email: ada.email } } })
    await patchIncident(req('PATCH', `/api/incidents/${incident.id}`, { status: 'INVESTIGATING' }, alice), ctx({ id: incident.id }))
    expect(await notificationsFor(ada.email)).toEqual([])
  })

  it('stop while the organization is suspended', async () => {
    await prisma.organization.update({ where: { id: acme.id }, data: { suspendedAt: new Date(), suspendedReason: 'test' } })
    await patchIncident(req('PATCH', `/api/incidents/${incident.id}`, { status: 'INVESTIGATING' }, alice), ctx({ id: incident.id }))
    expect(await notificationsFor(ada.email)).toEqual([])
  })

  it('still escalate P1s to the on-call list, which is not a member', async () => {
    const res = await createIncident(req('POST', '/api/incidents/create', incidentInput({ severity: 'P1' }), alice), noParams)
    expect(res.status).toBe(201)
    expect(await notificationsFor('oncall@example.com')).toEqual([{ notificationType: 'P1_ESCALATION' }])
  })
})

describe('notifications are filed under the incident’s organization', () => {
  it('records the organization so each inbox only shows its own', async () => {
    await patchIncident(req('PATCH', `/api/incidents/${incident.id}`, { status: 'INVESTIGATING' }, alice), ctx({ id: incident.id }))
    const row = await prisma.notificationLog.findFirstOrThrow({ where: { recipientEmail: ada.email } })
    expect(row.organizationId).toBe(acme.id)
  })
})
