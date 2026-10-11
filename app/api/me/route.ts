import { NextResponse } from 'next/server'
import { parseJson, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sessionOrThrow } from '@/lib/organizations'
import { loadSession } from '@/lib/session'
import { profileSchema } from '@/lib/validators'

/** GET /api/me — the signed-in user, their profile and current organization membership. */
export const GET = route('me.get', async () => NextResponse.json(await sessionOrThrow()), { members: false })

/** PATCH /api/me — save the onboarding profile (name, job title, department, phone, bio). */
export const PATCH = route('me.update', async req => {
  const session = await sessionOrThrow()
  const profile = await parseJson(req, profileSchema)
  await prisma.user.update({
    where: { id: session.user.id },
    data: { ...profile, ...(!session.user.onboarded && { onboardedAt: new Date() }) }
  })
  return NextResponse.json(await loadSession(session.user.id))
}, { members: false })
