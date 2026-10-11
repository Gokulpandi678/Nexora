import { NextResponse } from 'next/server'
import { HttpError, notFound, parseJson, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sendOrganizationStatusEmail } from '@/lib/email'
import { orgAdminEmails, sessionOrThrow } from '@/lib/organizations'
import { isAdminOf } from '@/lib/session'
import { organizationActionSchema } from '@/lib/validators'

type Params = { id: string }

const select = {
  id: true, name: true, slug: true, industry: true, size: true, website: true, description: true,
  suspendedAt: true, suspendedBy: true, suspendedReason: true
} as const

/**
 * PATCH /api/organizations/:id
 *  { action: 'update', details }  — edit name and profile (that organization's admins, or a superadmin)
 *  { action: 'suspend', reason }  — superadmin only. Members lose access; nothing is deleted.
 *  { action: 'reactivate' }       — superadmin only. Everything comes back as it was.
 * Organizations are never deleted.
 */
export const PATCH = route<Params>('organizations.update', async (req, { params }) => {
  const { id } = await params
  const session = await sessionOrThrow()
  const input = await parseJson(req, organizationActionSchema)

  const org = await prisma.organization.findUnique({ where: { id }, select })
  if (!org) throw notFound('Organization')
  const superAdmin = session.user.isSuperAdmin

  if (input.action === 'update') {
    if (!superAdmin && !isAdminOf(session, id)) throw new HttpError(403, 'Only this organization’s admins can edit it')
    const { details } = input
    if (details.name.toLowerCase() !== org.name.toLowerCase()) {
      const taken = await prisma.organization.findFirst({
        where: { id: { not: id }, name: { equals: details.name, mode: 'insensitive' } },
        select: { id: true }
      })
      if (taken) throw new HttpError(409, `An organization named "${details.name}" already exists`)
    }
    const updated = await prisma.organization.update({ where: { id }, data: details, select })
    return NextResponse.json(updated)
  }

  if (!superAdmin) throw new HttpError(403, 'Only platform superadmins can suspend or reactivate organizations')

  if (input.action === 'suspend') {
    if (org.suspendedAt) throw new HttpError(409, `${org.name} is already suspended`)
    const updated = await prisma.organization.update({
      where: { id },
      data: { suspendedAt: new Date(), suspendedBy: session.user.email, suspendedReason: input.reason },
      select
    })
    await notifyAdmins(id, org.name, true, input.reason)
    return NextResponse.json(updated)
  }

  if (!org.suspendedAt) throw new HttpError(409, `${org.name} is not suspended`)
  const updated = await prisma.organization.update({
    where: { id },
    data: { suspendedAt: null, suspendedBy: null, suspendedReason: null },
    select
  })
  await notifyAdmins(id, org.name, false)
  return NextResponse.json(updated)
}, { members: false })

async function notifyAdmins(organizationId: string, organizationName: string, suspended: boolean, reason?: string): Promise<void> {
  const admins = await orgAdminEmails(organizationId)
  await Promise.all(admins.map(to => sendOrganizationStatusEmail({ to, organizationName, suspended, reason })))
}
